import {randomBytes,createHash,randomInt} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const opaque=()=>randomBytes(32).toString('hex');
export function migrateSecurity(db:DatabaseSync){
  db.exec(`CREATE TABLE IF NOT EXISTS account_security(id INTEGER PRIMARY KEY CHECK(id=1),email_verified_at INTEGER,password_changed_at INTEGER,email_verification_sent_at INTEGER);
    INSERT OR IGNORE INTO account_security(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS security_tokens(hash TEXT PRIMARY KEY,purpose TEXT NOT NULL,subject TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS security_devices(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,summary TEXT NOT NULL,created_at INTEGER NOT NULL,last_used_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,revoked_at INTEGER);
    CREATE TABLE IF NOT EXISTS security_sessions(token_hash TEXT PRIMARY KEY,device_id TEXT,created_at INTEGER NOT NULL,last_used_at INTEGER NOT NULL,summary TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS security_challenges(hash TEXT PRIMARY KEY,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS security_events(id INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL,profile_id TEXT,created_at INTEGER NOT NULL,summary TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS security_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,until_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS security_backoff(key TEXT PRIMARY KEY,until_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS security_limit_blocks(key TEXT PRIMARY KEY,until_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS security_profile_email(profile_id TEXT PRIMARY KEY,email TEXT NOT NULL,verified_at INTEGER);
    CREATE TABLE IF NOT EXISTS security_mfa(subject TEXT PRIMARY KEY,method TEXT NOT NULL DEFAULT 'TOTP',secret_ciphertext TEXT,confirmed_at INTEGER,last_counter INTEGER);
    CREATE INDEX IF NOT EXISTS security_token_expiry ON security_tokens(expires_at);
    CREATE INDEX IF NOT EXISTS security_event_time ON security_events(created_at);`);
}
export function securityStore(db:DatabaseSync,now=()=>Date.now()){
  migrateSecurity(db);
  const event=(type:string,req?:any,profileId?:string)=>{db.prepare('INSERT INTO security_events(type,profile_id,created_at,summary) VALUES(?,?,?,?)').run(type,profileId||null,now(),JSON.stringify(deviceSummary(req?.get?.('user-agent')||'')));};
  const token=(purpose:string,subject='account',ttl=30*60000,payload:any={})=>{const value=opaque();db.prepare('UPDATE security_tokens SET used_at=? WHERE purpose=? AND subject=? AND used_at IS NULL').run(now(),purpose,subject);db.prepare('INSERT INTO security_tokens VALUES(?,?,?,?,NULL,?)').run(digest(value),purpose,subject,now()+ttl,JSON.stringify(payload));return value;};
  const peek=(value:unknown,purpose:string)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)?db.prepare('SELECT * FROM security_tokens WHERE hash=? AND purpose=? AND expires_at>? AND used_at IS NULL').get(digest(value),purpose,now()):undefined;
  const consume=(value:unknown,purpose:string)=>{const row=peek(value,purpose);if(!row)return undefined;const changed=db.prepare('UPDATE security_tokens SET used_at=? WHERE hash=? AND used_at IS NULL AND expires_at>?').run(now(),row.hash,now());return changed.changes?row:undefined;};
  const count=(key:string)=>{const row=db.prepare('SELECT * FROM security_limits WHERE key=? AND until_at>?').get(digest(key),now());return Number(row?.count||0);};
  const limit=(key:string,max:number,windowMs:number)=>{db.prepare('INSERT INTO security_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN until_at>? THEN count+1 ELSE 1 END,until_at=CASE WHEN until_at>? THEN until_at ELSE excluded.until_at END').run(digest(key),now()+windowMs,now(),now());const row=db.prepare('SELECT * FROM security_limits WHERE key=?').get(digest(key))!;if(Number(row.count)>max){db.prepare('INSERT OR REPLACE INTO security_limit_blocks VALUES(?,?)').run(digest(key),row.until_at);event('RATE_LIMITED');throw Object.assign(new Error('Muitas solicitações. Aguarde alguns minutos e tente novamente.'),{status:429,retryAfter:Math.max(1,Math.ceil((Number(row.until_at)-now())/1000))});}};
  const challenge=(payload:any)=>{const id=opaque(),code=String(randomInt(10000000,100000000));db.prepare('INSERT INTO security_challenges VALUES(?,?,?,0,?)').run(digest(id),digest(id+':'+code),now()+10*60000,JSON.stringify(payload));return {id,code};};
  const cleanup=()=>{db.prepare('DELETE FROM security_tokens WHERE expires_at<?').run(now()-86400000);db.prepare('DELETE FROM security_challenges WHERE expires_at<?').run(now());db.prepare('DELETE FROM security_limits WHERE until_at<?').run(now());db.prepare('DELETE FROM security_backoff WHERE until_at<?').run(now());db.prepare('DELETE FROM security_limit_blocks WHERE until_at<?').run(now());db.prepare('DELETE FROM security_events WHERE created_at<?').run(now()-90*86400000);db.prepare('DELETE FROM security_sessions WHERE token_hash NOT IN (SELECT token_hash FROM team_sessions)').run();};
  cleanup();return {event,token,peek,consume,count,limit,challenge,cleanup,now};
}
export function deviceSummary(agent:string){
  const browser=/Edg\//.test(agent)?'Edge':/Firefox\//.test(agent)?'Firefox':/Chrome\//.test(agent)?'Chromium / Brave':/Safari\//.test(agent)?'Safari':'Navegador';
  const os=/Android/.test(agent)?'Android':/iPhone|iPad/.test(agent)?'iOS':/Windows/.test(agent)?'Windows':/Mac OS/.test(agent)?'macOS':/Linux/.test(agent)?'Linux':'Sistema não informado';
  return {browser,os,type:/Mobile|Android|iPhone|iPad/.test(agent)?'Celular / tablet':'Computador',location:null};
}
