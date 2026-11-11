import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import { z, ZodError } from 'zod';
import * as OTPAuth from 'otpauth';
import { pool } from './db.js';
import { config } from './config.js';
import { token, hashToken, verifyPassword, hashPassword, unseal } from './crypto.js';
import { registerStreams } from './streams.js';
export type Identity = { id: string; email: string; role: 'admin'|'user'; csrf: string };
declare module 'fastify' { interface FastifyRequest { identity: Identity | null } }
const id = z.uuid();
const cameraInput = z.object({
 name: z.string().trim().min(1).max(100), location: z.string().trim().min(1).max(200),
 latitude: z.number().min(-90).max(90).nullable().default(null), longitude: z.number().min(-180).max(180).nullable().default(null),
 streamPath: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), enabled: z.boolean().default(true), publicApproved: z.boolean().default(false)
}).strict();
const cameraFields = 'c.id,c.name,c.location,c.latitude,c.longitude,c.enabled,c.public_approved,c.health,c.health_checked_at';
export async function audit(req: FastifyRequest, action: string, target?: string) {
 await pool.query('INSERT INTO audit_logs(actor_id,action,target,ip) VALUES ($1,$2,$3,$4)',[req.identity?.id ?? null,action,target ?? null,req.ip]);
}
export async function permitted(cameraId: string, identity: Identity | null) {
 const r = await pool.query(`SELECT stream_path FROM cameras c WHERE c.id=$1 AND c.enabled AND
 (c.public_approved OR $2::text='admin' OR EXISTS(SELECT 1 FROM camera_grants g WHERE g.camera_id=c.id AND g.user_id=$3::uuid))`,[cameraId,identity?.role ?? null,identity?.id ?? null]);
 return r.rows[0]?.stream_path as string | undefined;
}
export async function buildServer() {
 const cfg = config();
 const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info', redact: ['req.headers.cookie','req.headers.authorization','res.headers.set-cookie'] }, bodyLimit: 16384, trustProxy: false, requestTimeout: 20000 });
 await app.register(cookie);
 await app.register(helmet, { contentSecurityPolicy: false });
 await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
 app.decorateRequest('identity', null);
 const dummyHash = await hashPassword(token());
 app.setErrorHandler((error, req, reply) => {
  if(error instanceof ZodError) return reply.code(400).send({error:'Input tidak valid'});
  const e = error as Error & {code?: string; statusCode?: number};
  if(e.code === '23505') return reply.code(409).send({error:'Data sudah digunakan'});
  if(e.code === '23503') return reply.code(400).send({error:'Referensi tidak ditemukan'});
  if(e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({error:e.statusCode===429?'Terlalu banyak permintaan':'Permintaan ditolak'});
  req.log.error({code:e.code, name:e.name},'Request failed');
  return reply.code(500).send({error:'Kesalahan server'});
 });
 app.addHook('onRequest', async(req, reply)=> {
  reply.header('Cache-Control','private, no-store, max-age=0').header('Vary','Cookie').header('Pragma','no-cache');
  const raw = req.cookies.session;
  if(raw && /^[a-f0-9]{64}$/.test(raw)) {
   const r = await pool.query(`SELECT u.id,u.email,u.role,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.enabled`,[hashToken(raw)]);
   req.identity = r.rows[0] ?? null;
  }
  if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
   if(req.headers.origin !== cfg.APP_ORIGIN) return reply.code(403).send({error:'Origin ditolak'});
   if(req.url !== '/api/auth/login' && (!req.identity || req.headers['x-csrf-token'] !== req.identity.csrf)) return reply.code(403).send({error:'CSRF ditolak'});
  }
 });
 app.addHook('preHandler', async(req, reply)=> {
  if(req.url.startsWith('/api/admin/') && req.identity?.role !== 'admin') return reply.code(403).send({error:'Akses ditolak'});
 });
 app.get('/api/health', {config:{rateLimit:false}}, async(_req,reply)=> {
  try { await pool.query('SELECT 1'); return {status:'ok'}; } catch { return reply.code(503).send({status:'unavailable'}); }
 });
 app.post('/api/auth/login', {config:{rateLimit:{max:10,timeWindow:'1 minute'}}}, async(req,reply)=> {
  const body = z.object({email:z.email().max(254).transform(s=>s.toLowerCase()),password:z.string().min(1).max(128),otp:z.string().regex(/^\d{6}$/).optional()}).strict().parse(req.body);
  const client = await pool.connect();
  try {
   await client.query('BEGIN');
   // Same account serializes across replicas; IP limits are also serialized.
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`ip:${req.ip}`]);
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`email:${body.email}`]);
   const count = await client.query("SELECT count(*)::int AS n FROM login_attempts WHERE (ip=$1 OR email=$2) AND created_at>now()-interval '15 minutes'",[req.ip,body.email]);
   if(count.rows[0].n >= 10) { await client.query('COMMIT'); return reply.code(429).send({error:'Coba lagi setelah 15 menit'}); }
   await client.query('INSERT INTO login_attempts(ip,email) VALUES ($1,$2)',[req.ip,body.email]);
   const u = (await client.query('SELECT * FROM users WHERE email=$1 FOR UPDATE',[body.email])).rows[0];
   let valid = await verifyPassword(body.password,u?.password_hash ?? dummyHash);
   let step = -1;
   if(u?.role === 'admin') {
    const otp = new OTPAuth.TOTP({secret:OTPAuth.Secret.fromBase32(unseal(u.totp_secret,cfg.MFA_ENCRYPTION_KEY)),algorithm:'SHA1',digits:6,period:30});
    const delta = body.otp ? otp.validate({token:body.otp,window:1}) : null;
    step = Math.floor(Date.now()/30000)+(delta ?? 0);
    valid = valid && delta !== null && step > Number(u.last_totp_step);
   }
   if(!u || !u.enabled || !valid) {
    await client.query("INSERT INTO audit_logs(action,ip) VALUES ('login.failed',$1)",[req.ip]);
    await client.query('COMMIT'); return reply.code(401).send({error:'Email, kata sandi, atau kode MFA tidak valid'});
   }
   if(u.role === 'admin') await client.query('UPDATE users SET last_totp_step=$1 WHERE id=$2',[step,u.id]);
   const raw = token(), csrf = token();
   await client.query("INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES ($1,$2,$3,now()+interval '8 hours')",[hashToken(raw),u.id,csrf]);
   await client.query("INSERT INTO audit_logs(actor_id,action,ip) VALUES ($1,'login.success',$2)",[u.id,req.ip]);
   await client.query('COMMIT');
   reply.setCookie('session',raw,{httpOnly:true,secure:cfg.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:28800});
   return {user:{id:u.id,email:u.email,role:u.role},csrf};
  } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
 });
 app.get('/api/auth/me',async(req)=>({user:req.identity ? {id:req.identity.id,email:req.identity.email,role:req.identity.role}:null,csrf:req.identity?.csrf ?? null}));
 app.post('/api/auth/logout',async(req,reply)=> {
  await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hashToken(req.cookies.session || '')]);
  await audit(req,'logout'); reply.clearCookie('session',{path:'/'}); return {ok:true};
 });
 app.get('/api/cameras',async(req)=> {
  const r = await pool.query(`SELECT ${cameraFields} FROM cameras c WHERE c.enabled AND
   (c.public_approved OR $1::text='admin' OR EXISTS(SELECT 1 FROM camera_grants g WHERE g.camera_id=c.id AND g.user_id=$2::uuid)) ORDER BY c.name`,[req.identity?.role ?? null, req.identity?.id ?? null]);
  return {cameras:r.rows};
 });
 app.get('/api/admin/cameras',async()=>({cameras:(await pool.query(`SELECT ${cameraFields},c.stream_path FROM cameras c ORDER BY c.name`)).rows}));
 app.post('/api/admin/cameras',async(req,reply)=> {
  const b=cameraInput.parse(req.body);
  const r=await pool.query(`INSERT INTO cameras(name,location,latitude,longitude,stream_path,enabled,public_approved)
   VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[b.name,b.location,b.latitude,b.longitude,b.streamPath,b.enabled,b.publicApproved]);
  await audit(req,b.publicApproved?'camera.create.public-approved':'camera.create',r.rows[0].id); return reply.code(201).send(r.rows[0]);
 });
 app.put('/api/admin/cameras/:id',async(req)=> {
  const cameraId=id.parse((req.params as {id:string}).id), b=cameraInput.parse(req.body);
  const r=await pool.query('UPDATE cameras SET name=$1,location=$2,latitude=$3,longitude=$4,stream_path=$5,enabled=$6,public_approved=$7 WHERE id=$8 RETURNING id',[b.name,b.location,b.latitude,b.longitude,b.streamPath,b.enabled,b.publicApproved,cameraId]);
  if(!r.rowCount) throw Object.assign(new Error(),{statusCode:404});
  await audit(req,b.publicApproved?'camera.update.public-approved':'camera.update.private',cameraId); return {ok:true};
 });
 app.delete('/api/admin/cameras/:id',async(req)=> {
  const cameraId=id.parse((req.params as {id:string}).id);
  await pool.query('DELETE FROM cameras WHERE id=$1',[cameraId]); await audit(req,'camera.delete',cameraId); return {ok:true};
 });
 app.get('/api/admin/users',async()=>({users:(await pool.query('SELECT id,email,role,enabled,created_at FROM users ORDER BY email')).rows}));
 app.post('/api/admin/users',async(req,reply)=> {
  const b=z.object({email:z.email().max(254).transform(s=>s.toLowerCase()),password:z.string().min(14).max(128)}).strict().parse(req.body);
  const r=await pool.query("INSERT INTO users(email,password_hash,role) VALUES ($1,$2,'user') RETURNING id",[b.email,await hashPassword(b.password)]);
  await audit(req,'user.create',r.rows[0].id); return reply.code(201).send(r.rows[0]);
 });
 app.put('/api/admin/users/:id',async(req)=> {
  const userId=id.parse((req.params as {id:string}).id);
  const b=z.object({enabled:z.boolean(),password:z.string().min(14).max(128).optional()}).strict().parse(req.body);
  if(userId===req.identity?.id) throw Object.assign(new Error(),{statusCode:400});
  const client=await pool.connect();
  try {
   await client.query('BEGIN');
   const r=await client.query("UPDATE users SET enabled=$1,password_hash=COALESCE($2,password_hash) WHERE id=$3 AND role='user' RETURNING id",[b.enabled,b.password?await hashPassword(b.password):null,userId]);
   if(!r.rowCount) throw Object.assign(new Error(),{statusCode:404});
   await client.query('DELETE FROM sessions WHERE user_id=$1',[userId]);
   await client.query('COMMIT');
  } catch(e) { await client.query('ROLLBACK'); throw e; } finally {client.release();}
  await audit(req,'user.update.revoke-sessions',userId);return {ok:true};
 });
 app.get('/api/admin/grants',async()=>({grants:(await pool.query('SELECT camera_id,user_id FROM camera_grants')).rows}));
 app.put('/api/admin/grants',async(req)=> {
  const b=z.object({cameraId:id,userId:id,allowed:z.boolean()}).strict().parse(req.body);
  if(b.allowed) await pool.query('INSERT INTO camera_grants(camera_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[b.cameraId,b.userId]);
  else await pool.query('DELETE FROM camera_grants WHERE camera_id=$1 AND user_id=$2',[b.cameraId,b.userId]);
  await audit(req,b.allowed?'grant.add':'grant.remove',`${b.cameraId}:${b.userId}`);return {ok:true};
 });
 app.get('/api/admin/audit',async()=>({logs:(await pool.query('SELECT a.id,a.action,a.target,a.ip,a.created_at,u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200')).rows}));
 await registerStreams(app,cfg);
 return app;
}
