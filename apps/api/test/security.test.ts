import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import * as OTPAuth from 'otpauth';
import {pool} from '../src/db.js';
import {migrate} from '../src/migrate.js';
import {buildServer} from '../src/server.js';
import {hashPassword,seal} from '../src/crypto.js';
import {safePlaylist} from '../src/streams.js';
if(process.env.ALLOW_TEST_DATABASE_RESET!=='1'||!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))throw new Error('Tests require a dedicated *_test database and ALLOW_TEST_DATABASE_RESET=1');
process.env.NODE_ENV='test';process.env.APP_ORIGIN='http://localhost:3000';process.env.MFA_ENCRYPTION_KEY='ab'.repeat(32);
const upstream=createServer((req,res)=>{
 if(req.url?.endsWith('.m3u8')){res.setHeader('Content-Type','application/vnd.apple.mpegurl');res.end('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2,\nsegment.mp4\n');}
 else{res.setHeader('Content-Type','video/mp4');res.end(Buffer.from('synthetic-test-segment'));}
});
let app:Awaited<ReturnType<typeof buildServer>>,uid:string,privateId:string,publicId:string;
const origin={origin:'http://localhost:3000'},password='Long test password 938!';
const otp=new OTPAuth.TOTP({secret:OTPAuth.Secret.fromBase32('JBSWY3DPEHPK3PXP')});
let cookie='',csrf='';
before(async()=>{
 await new Promise<void>(r=>upstream.listen(0,'127.0.0.1',r));const addr=upstream.address() as {port:number};process.env.MEDIAMTX_HLS_URL=`http://127.0.0.1:${addr.port}`;
 await migrate();await pool.query('TRUNCATE users,cameras,audit_logs,login_attempts CASCADE');
 const u=await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('viewer@test.local',$1,'user') RETURNING id",[await hashPassword(password)]);uid=u.rows[0].id;
 await pool.query("INSERT INTO users(email,password_hash,role,totp_secret) VALUES ('admin@test.local',$1,'admin',$2)",[await hashPassword(password),seal(otp.secret.base32,process.env.MFA_ENCRYPTION_KEY!)]);
 privateId=(await pool.query("INSERT INTO cameras(name,location,stream_path) VALUES ('Private','Lab','private') RETURNING id")).rows[0].id;
 publicId=(await pool.query("INSERT INTO cameras(name,location,stream_path,public_approved) VALUES ('Public','Lab','public',true) RETURNING id")).rows[0].id;
 app=await buildServer();await app.ready();
});
after(async()=>{await app?.close();await pool.end();await new Promise<void>(r=>upstream.close(()=>r()));});
test('public listing excludes private cameras and internal paths',async()=>{const r=await app.inject('/api/cameras');assert.equal(r.statusCode,200);assert.equal(r.json().cameras.length,1);assert.equal(r.json().cameras[0].id,publicId);assert.ok(!r.body.includes('stream_path'));});
test('anonymous access to private master, media playlist, init, segment and HEAD denied',async()=>{for(const file of ['index.m3u8','main_stream.m3u8','init.mp4','segment.mp4','segment.m4s','segment.ts']){for(const method of ['GET','HEAD'] as const){const r=await app.inject({method,url:`/api/streams/${privateId}/${file}`});assert.equal(r.statusCode,404);assert.match(r.headers['cache-control'] as string,/no-store/);}}});
test('public HLS playlist and segments accessible with no shared cache',async()=>{for(const file of ['index.m3u8','init.mp4','segment.mp4']){const r=await app.inject(`/api/streams/${publicId}/${file}`);assert.equal(r.statusCode,200);assert.match(r.headers['cache-control'] as string,/no-store/);assert.equal(r.headers['cdn-cache-control'],'no-store');assert.ok(!r.headers['access-control-allow-origin']);}});
test('cross-site login rejected',async()=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:'https://evil.test'},payload:{email:'viewer@test.local',password}});assert.equal(r.statusCode,403);});
test('user login establishes opaque HttpOnly SameSite session',async()=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:origin,payload:{email:'viewer@test.local',password}});assert.equal(r.statusCode,200);cookie=r.headers['set-cookie']!.toString().split(';')[0];csrf=r.json().csrf;assert.match(r.headers['set-cookie']!.toString(),/HttpOnly/);assert.match(r.headers['set-cookie']!.toString(),/SameSite=Strict/i);assert.ok(!r.body.includes(password));});
test('viewer cannot access admin or bypass CSRF',async()=>{const r=await app.inject({url:'/api/admin/users',headers:{cookie}});assert.equal(r.statusCode,403);const s=await app.inject({method:'POST',url:'/api/auth/logout',headers:{...origin,cookie},payload:{}});assert.equal(s.statusCode,403);});
test('logged-in user without grant cannot access shared private URL',async()=>{assert.equal((await app.inject({url:`/api/streams/${privateId}/segment.mp4`,headers:{cookie}})).statusCode,404);});
test('grant permits all resources; revocation immediately denies subsequent segments',async()=>{await pool.query('INSERT INTO camera_grants VALUES ($1,$2)',[privateId,uid]);for(const file of ['index.m3u8','main_stream.m3u8','init.mp4','segment.mp4'])assert.equal((await app.inject({url:`/api/streams/${privateId}/${file}`,headers:{cookie}})).statusCode,200);await pool.query('DELETE FROM camera_grants WHERE user_id=$1',[uid]);assert.equal((await app.inject({url:`/api/streams/${privateId}/segment.mp4`,headers:{cookie}})).statusCode,404);});
test('expired session and disabled user deny segment access',async()=>{await pool.query('INSERT INTO camera_grants VALUES ($1,$2)',[privateId,uid]);await pool.query('UPDATE users SET enabled=false WHERE id=$1',[uid]);assert.equal((await app.inject({url:`/api/streams/${privateId}/init.mp4`,headers:{cookie}})).statusCode,404);await pool.query('UPDATE users SET enabled=true WHERE id=$1',[uid]);await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",[uid]);assert.equal((await app.inject({url:`/api/streams/${privateId}/segment.mp4`,headers:{cookie}})).statusCode,404);});
test('private approval removal and camera disable protect public URLs immediately',async()=>{await pool.query('UPDATE cameras SET public_approved=false WHERE id=$1',[publicId]);assert.equal((await app.inject(`/api/streams/${publicId}/segment.mp4`)).statusCode,404);await pool.query('UPDATE cameras SET public_approved=true,enabled=false WHERE id=$1',[publicId]);assert.equal((await app.inject(`/api/streams/${publicId}/index.m3u8`)).statusCode,404);await pool.query('UPDATE cameras SET enabled=true WHERE id=$1',[publicId]);});
test('path traversal, SSRF and unexpected query denied',async()=>{for(const file of ['%2e%2e%2fsecret.mp4','https:%2f%2fevil.mp4','init.mp4?url=http://evil'])assert.ok((await app.inject(`/api/streams/${publicId}/${file}`)).statusCode>=400);assert.equal(safePlaylist('#EXTM3U\nhttps://evil/a.ts'),false);assert.equal(safePlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="//evil/key"'),false);assert.equal(safePlaylist('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\na.mp4\n'),true);});
test('admin MFA required; valid code works once, replay denied',async()=>{const login=(code?:string)=>app.inject({method:'POST',url:'/api/auth/login',headers:origin,payload:{email:'admin@test.local',password,...(code?{otp:code}:{})}});assert.equal((await login()).statusCode,401);const code=otp.generate();const r=await login(code);assert.equal(r.statusCode,200);assert.equal((await login(code)).statusCode,401);const adminCookie=r.headers['set-cookie']!.toString().split(';')[0],adminCsrf=r.json().csrf;
 const bad=await app.inject({method:'POST',url:'/api/admin/cameras',headers:{...origin,cookie:adminCookie},payload:{}});assert.equal(bad.statusCode,403);
 const created=await app.inject({method:'POST',url:'/api/admin/cameras',headers:{...origin,cookie:adminCookie,'x-csrf-token':adminCsrf},payload:{name:'New',location:'Lab',streamPath:'new'}});assert.equal(created.statusCode,201);const row=(await pool.query('SELECT public_approved FROM cameras WHERE id=$1',[created.json().id])).rows[0];assert.equal(row.public_approved,false);
});
test('database rate limit persists across app replicas',async()=>{for(let i=0;i<10;i++)await pool.query("INSERT INTO login_attempts(ip,email) VALUES ('other-ip','locked@test.local')");const r=await app.inject({method:'POST',url:'/api/auth/login',headers:origin,payload:{email:'locked@test.local',password}});assert.equal(r.statusCode,429);});
test('audit records exist without submitted password',async()=>{const rows=(await pool.query('SELECT * FROM audit_logs')).rows;assert.ok(rows.length>=4);assert.ok(!JSON.stringify(rows).includes(password));});
