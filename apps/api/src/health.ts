import { pool } from './db.js';
export async function checkStreams(apiUrl: string) {
 let ready = new Set<string>();
 let state: 'online'|'unknown' = 'unknown';
 try {
  const res=await fetch(`${apiUrl}/v3/paths/list?itemsPerPage=1000`,{signal:AbortSignal.timeout(5000)});
  if(!res.ok) throw new Error('MediaMTX unavailable');
  const body=await res.json() as {items:{name:string;ready:boolean}[]};
  ready=new Set(body.items.filter(i=>i.ready).map(i=>i.name)); state='online';
 } catch { /* A failed monitor must never retain stale online status. */ }
 await pool.query("UPDATE cameras SET health=CASE WHEN $1::text='unknown' THEN 'unknown' WHEN stream_path=ANY($2::text[]) THEN 'online' ELSE 'offline' END, health_checked_at=now()",[state,[...ready]]);
}
export async function cleanup() {
 await pool.query('DELETE FROM sessions WHERE expires_at<now()');
 await pool.query("DELETE FROM login_attempts WHERE created_at<now()-interval '1 day'");
}
