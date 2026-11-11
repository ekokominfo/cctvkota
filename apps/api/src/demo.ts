import { pool } from './db.js';
try {
 const r=await pool.query("INSERT INTO cameras(name,location,stream_path,public_approved) VALUES ('Demo • Test Pattern','Laboratorium lokal','demo',true) ON CONFLICT (stream_path) DO NOTHING RETURNING id");
 console.log(r.rowCount ? 'Explicitly approved synthetic demo camera created; no NVR used.' : 'Existing demo unchanged.');
} finally {await pool.end();}
