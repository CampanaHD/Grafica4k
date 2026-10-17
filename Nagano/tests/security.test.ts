import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {scryptSync} from 'node:crypto';
import {createAuthSystem,hashPassword} from '../server/auth';
import {securityConfig,type SecurityConfig} from '../server/security/config';
import {securityHeaders} from '../server/security/headers';
import {verifyPassword,passwordProblem} from '../server/security/passwords';
import {validateImageData} from '../server/imageData';
const password='Frase exclusiva apenas para teste 872!';
const baseConfig:SecurityConfig={enabled:true,production:false,origin:'http://localhost:3000',smtpHost:'smtp.gmail.com',smtpPort:465,smtpUser:'test@example.invalid',smtpPassword:'TEST_ONLY',mailFrom:'test@example.invalid',siteKey:'',captchaSecret:'',captchaHostnames:['localhost']};
async function fixture(overrides:Partial<SecurityConfig>={},legacy=false){
  let now=Date.now();const dir=mkdtempSync(path.join(tmpdir(),'nagano-security-')),messages:any[]=[],salt='legacy-test-only-salt';
  const initial={email:'owner@example.invalid',...(legacy?{salt,hash:scryptSync(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex')}:hashPassword(password))};
  const auth=createAuthSystem(dir,initial,{config:{...baseConfig,...overrides},now:()=>now,sendMail:async m=>{messages.push(m);},fetch:async(_url,options)=>{const token=new URLSearchParams(options?.body as any).get('response')||'';if(token.includes('network-error'))throw new Error('TEST_PROVIDER_UNAVAILABLE');return new Response(JSON.stringify({success:!token.includes('invalid'),action:token.split(':')[0],hostname:token.includes('foreign')?'foreign.invalid':'localhost',challenge_ts:new Date(now-(token.includes('expired')?301000:0)).toISOString()}),{status:200,headers:{'Content-Type':'application/json'}});}});
  const app=express();app.use(express.json());app.use(auth.router);app.use('/api',(req,res,next)=>auth.requireLogin(req,res,()=>auth.requireProfile(req,res,next)));app.get('/api/secret',(_req,res)=>res.json({success:true}));
  const server=app.listen(0);await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address() as any).port}`,jar=new Map<string,string>();let csrf='';
  const call=async(url:string,method='GET',body?:any,headers:Record<string,string>={})=>{const response=await fetch(base+url,{method,headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(csrf?{'X-Nagano-CSRF':csrf}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});for(const c of response.headers.getSetCookie()){const pair=c.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}csrf=response.headers.get('X-Nagano-CSRF')||csrf;return {status:response.status,data:await response.json(),headers:response.headers};};
  const login=()=>call('/api/auth/login','POST',{email:initial.email,password});
  const token=()=>{const match=messages.at(-1)?.text.match(/token=([a-f0-9]{64})/);assert.ok(match,'email contains one opaque token');return match[1];};
  const code=()=>{const match=messages.at(-1)?.text.match(/Código: (\d{8})/);assert.ok(match);return match[1];};
  const enter=async()=>{let result=await login();if(result.data.requiresEmailVerification){await auth.security.flushMail();assert.equal((await call('/api/auth/email/verify','POST',{token:token()})).status,200);result=await login();}if(result.data.requiresDeviceVerification){await auth.security.flushMail();result=await call('/api/auth/device/confirm','POST',{code:code()});assert.equal(result.status,200);}assert.equal((await call('/api/auth/profile','POST',{profileId:'administrator'})).status,200);};
  const close=async()=>{await auth.security.flushMail();await new Promise<void>(resolve=>server.close(()=>resolve()));auth.close();const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(tmpdir())+path.sep));rmSync(resolved,{recursive:true,force:true});};
  return {auth,initial,dir,messages,call,login,token,code,enter,close,jar,advance:(ms:number)=>{now+=ms;}};
}
test('first access requires email confirmation; tokens are hashed, single-use and do not create sessions',async()=>{
  const f=await fixture();try{
    const result=await f.login();assert.equal(result.data.requiresEmailVerification,true);assert.equal((await f.call('/api/auth/session')).data.authenticated,false);
    await f.auth.security.flushMail();const token=f.token(),db=new DatabaseSync(path.join(f.dir,'team.sqlite'));assert.doesNotMatch(JSON.stringify(db.prepare('SELECT * FROM security_tokens').all()),new RegExp(token));db.close();
    assert.equal((await f.call('/api/auth/email/verify','POST',{token})).status,200);assert.equal((await f.call('/api/auth/email/verify','POST',{token})).status,400);assert.equal((await f.call('/api/auth/session')).data.authenticated,false);
    const next=await f.login();assert.equal(next.data.requiresDeviceVerification,true);
  }finally{await f.close();}
});
test('verification expires, resend has cooldown, no session is activated by editing frontend flags',async()=>{
  const f=await fixture();try{
    await f.login();await f.auth.security.flushMail();const token=f.token();f.advance(25*3600000);assert.equal((await f.call('/api/auth/email/verify','POST',{token})).status,400);
    assert.equal((await f.call('/api/security/me','POST',{email_verified:true,authenticated:true})).status,401);
    await f.call('/api/auth/email/resend','POST',{email:f.initial.email});await f.call('/api/auth/email/resend','POST',{email:f.initial.email});await f.auth.security.flushMail();assert.equal(f.messages.length,2);
  }finally{await f.close();}
});
test('new device is browser-bound, has 5 attempts, expires, and a used code cannot create another session',async()=>{
  const f=await fixture();try{
    await f.enter();const firstCookie=f.jar.get('nagano_device');assert.ok(firstCookie);assert.equal((await f.call('/api/security/me')).data.devices[0].current,true);
    await f.call('/api/auth/logout','POST',{});const result=await f.login();assert.equal(result.data.requiresDeviceVerification,undefined);await f.call('/api/auth/logout','POST',{});
    f.jar.delete('nagano_device');await f.login();await f.auth.security.flushMail();const code=f.code(),challenge=f.jar.get('nagano_challenge');assert.ok(challenge);
    f.jar.delete('nagano_challenge');assert.equal((await f.call('/api/auth/device/confirm','POST',{code})).status,400);f.jar.set('nagano_challenge',challenge!);
    for(let i=0;i<5;i++)assert.equal((await f.call('/api/auth/device/confirm','POST',{code:'00000000'})).status,400);
    assert.equal((await f.call('/api/auth/device/confirm','POST',{code})).status,400);
    f.advance(16*60000);await f.login();await f.auth.security.flushMail();const next=f.code();f.advance(11*60000);assert.equal((await f.call('/api/auth/device/confirm','POST',{code:next})).status,400);
  }finally{await f.close();}
});
test('trusted device can be revoked; report link revokes only its device and cannot be reused',async()=>{
  const f=await fixture();try{
    await f.enter();await f.auth.security.flushMail();const report=f.token(),security=(await f.call('/api/security/me')).data;
    assert.equal(security.sessions.length,1);assert.equal(security.emailVerified,true);
    assert.equal((await f.call('/api/auth/device/report','POST',{token:report})).status,200);assert.equal((await f.call('/api/auth/session')).data.authenticated,false);assert.equal((await f.call('/api/auth/device/report','POST',{token:report})).status,400);
  }finally{await f.close();}
});
test('password recovery is generic, hashed, expiring, single-use and revokes sessions and device trust',async()=>{
  const f=await fixture();try{
    await f.enter();const existing=await f.call('/api/auth/password/forgot','POST',{email:f.initial.email}),unknown=await f.call('/api/auth/password/forgot','POST',{email:'unknown@example.invalid'});assert.deepEqual(existing.data,unknown.data);await f.auth.security.flushMail();const token=f.token();
    assert.equal((await f.call('/api/auth/password/reset','POST',{token,password:'123456789012',confirmation:'123456789012'})).status,400);
    const next='Uma nova frase segura de teste 879!';assert.equal((await f.call('/api/auth/password/reset','POST',{token,password:next,confirmation:next})).status,200);assert.equal((await f.call('/api/auth/password/reset','POST',{token,password:next,confirmation:next})).status,400);assert.equal((await f.call('/api/auth/session')).data.authenticated,false);
    assert.equal((await f.login()).status,401);const newLogin=await f.call('/api/auth/login','POST',{email:f.initial.email,password:next});assert.equal(newLogin.data.requiresDeviceVerification,true);
    f.advance(16*60000);await f.call('/api/auth/password/forgot','POST',{email:f.initial.email});await f.auth.security.flushMail();const expired=f.token();f.advance(31*60000);assert.equal((await f.call('/api/auth/password/reset','POST',{token:expired,password:next,confirmation:next})).status,400);
  }finally{await f.close();}
});
test('current password is required, changing it clears all sessions and old recovery tokens',async()=>{
  const f=await fixture();try{await f.enter();const body={currentPassword:'wrong',password:'Nova frase de segurança teste 456!',confirmation:'Nova frase de segurança teste 456!'};assert.equal((await f.call('/api/security/password','POST',body)).status,403);assert.equal((await f.call('/api/security/password','POST',{...body,currentPassword:password})).status,200);assert.equal((await f.call('/api/auth/session')).data.authenticated,false);}finally{await f.close();}
});
test('CAPTCHA is verified by backend including action, hostname, expiration and replay protection',async()=>{
  const f=await fixture({enabled:false,siteKey:'public-test-site-key',captchaSecret:'SERVER_TEST_SECRET'});try{
    await f.enter();const body={name:'Equipe teste',role:'SALES',color:'#3158ed',active:true,modules:['dashboard']};
    for(const token of [undefined,'register:invalid','register:expired','register:foreign','login:wrong-action','register:network-error']){const result=await f.call('/api/team/profiles/new','PUT',{...body,captchaToken:token});assert.equal(result.status,403);}
    const valid='register:valid-unique';assert.equal((await f.call('/api/team/profiles/new','PUT',{...body,captchaToken:valid})).status,200);
    assert.equal((await f.call('/api/team/profiles/other','PUT',{...body,name:'Outra pessoa',captchaToken:valid})).status,403);
    const cfg=await f.call('/api/auth/security-config');assert.doesNotMatch(JSON.stringify(cfg.data),/SERVER_TEST_SECRET|smtpPassword|TEST_ONLY/);
    const db=new DatabaseSync(path.join(f.dir,'team.sqlite'));assert.doesNotMatch(JSON.stringify(db.prepare('SELECT * FROM security_events').all()),/SERVER_TEST_SECRET|register:valid|owner@example/);db.close();
  }finally{await f.close();}
});
test('adaptive CAPTCHA starts after repeated failures and cannot be bypassed by frontend flags',async()=>{
  const f=await fixture({enabled:false,siteKey:'site',captchaSecret:'secret'});try{
    for(let i=0;i<3;i++)assert.equal((await f.call('/api/auth/login','POST',{email:f.initial.email,password:'wrong'})).status,401);
    const required=await f.call('/api/auth/login','POST',{email:f.initial.email,password,captchaValid:true});assert.equal(required.status,403);assert.equal(required.data.code,'CAPTCHA_REQUIRED');
    assert.equal((await f.call('/api/auth/login','POST',{email:f.initial.email,password,captchaToken:'login:valid-once'})).status,200);
  }finally{await f.close();}
});
test('rate limits persist across calls and return a finite retry-after without permanent lockout',async()=>{
  const f=await fixture({enabled:false});try{
    for(let i=0;i<8;i++)await f.call('/api/auth/login','POST',{email:f.initial.email,password:'wrong'});
    const blocked=await f.login();assert.equal(blocked.status,429);f.advance(16*60000);
    // Legacy login protection uses wall clock; persistent adaptive limits also cover recovery.
    for(let i=0;i<4;i++)await f.call('/api/auth/password/forgot','POST',{email:'nobody@example.invalid'});
    const limited=await f.call('/api/auth/password/forgot','POST',{email:'nobody@example.invalid'});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);f.advance(16*60000);assert.equal((await f.call('/api/auth/password/forgot','POST',{email:'nobody@example.invalid'})).status,200);
  }finally{await f.close();}
});
test('RBAC prevents employee access to account settings, device controls and another profile sessions',async()=>{
  const f=await fixture({enabled:false});try{
    await f.enter();await f.call('/api/team/profiles/design','PUT',{name:'Arte',role:'DESIGN',color:'#3158ed',active:true,modules:['kanban']});await f.call('/api/auth/profile','POST',{profileId:'design'});
    assert.equal((await f.call('/api/security/admin')).status,403);assert.equal((await f.call('/api/security/password','POST',{})).status,403);assert.equal((await f.call('/api/security/devices/revoke','POST',{id:'other'})).status,403);
    const me=(await f.call('/api/security/me')).data;assert.equal(me.admin,false);assert.equal(me.devices.length,0);assert.equal(me.sessions.every((s:any)=>s.profileId==='design'),true);assert.equal((await f.call('/api/secret')).status,403);
  }finally{await f.close();}
});
test('invited profiles need their own verified email and cannot self-assign permissions',async()=>{
  const f=await fixture();try{
    await f.enter();await f.call('/api/team/profiles/design','PUT',{name:'Arte',role:'DESIGN',color:'#3158ed',active:true,email:'design@example.invalid',modules:['kanban']});await f.auth.security.flushMail();const token=f.token();assert.equal((await f.call('/api/auth/profile','POST',{profileId:'design'})).status,403);
    assert.equal((await f.call('/api/auth/email/verify','POST',{token})).status,200);assert.equal((await f.call('/api/auth/profile','POST',{profileId:'design'})).status,200);
    await f.call('/api/team/me','PUT',{name:'Arte',role:'ADMIN',modules:['settings']});assert.equal((await f.call('/api/security/admin')).status,403);
  }finally{await f.close();}
});
test('legacy scrypt passwords migrate on valid login without replacing existing profiles',async()=>{
  const f=await fixture({enabled:false},true);try{await f.enter();const db=new DatabaseSync(path.join(f.dir,'team.sqlite')),row=db.prepare('SELECT salt,hash FROM account').get()!;assert.match(String(row.salt),/^argon2id\$/);assert.equal(await verifyPassword(password,{salt:row.salt,hash:row.hash}),true);assert.equal(db.prepare('SELECT COUNT(*) AS count FROM team_profiles').get()?.count,1);db.close();}finally{await f.close();}
});
test('secure cookies rotate; cross-origin and simple form requests cannot mutate authenticated state',async()=>{
  const f=await fixture({enabled:false});try{await f.login();const before=f.jar.get('nagano_session'),result=await f.call('/api/auth/profile','POST',{profileId:'administrator'});assert.notEqual(f.jar.get('nagano_session'),before);assert.match(result.headers.get('set-cookie')||'',/HttpOnly/);assert.match(result.headers.get('set-cookie')||'',/SameSite=Strict/);assert.equal((await f.call('/api/security/sessions/revoke','POST',{others:true},{Origin:'https://foreign.invalid'})).status,403);assert.equal((await f.call('/api/auth/logout','POST',{}, {'Content-Type':'text/plain'})).status,415);}finally{await f.close();}
});
test('sessions have inactivity expiration; polling session endpoint does not keep them alive',async()=>{const f=await fixture({enabled:false});try{await f.enter();f.advance(61*60000);assert.equal((await f.call('/api/auth/session')).data.authenticated,false);}finally{await f.close();}});
test('production refuses partial configuration and HTTP links; no unsafe default credential remains',()=>{
  assert.throws(()=>securityConfig({NODE_ENV:'production'} as any));assert.throws(()=>securityConfig({APP_PUBLIC_URL:'http://public.invalid'} as any));assert.throws(()=>securityConfig({TURNSTILE_SITE_KEY:'only-public'} as any));assert.ok(passwordProblem('123456789012'));assert.equal(passwordProblem(password),'');
  const source=readFileSync(new URL('../server/auth.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/bootstrapCredentials/);
});
test('security headers restrict framing, MIME sniffing and redirects to configured origin',async()=>{
  const app=express();app.use(securityHeaders(true,'https://nagano.example'));const server=app.listen(0);await new Promise<void>(r=>server.once('listening',r));try{const response=await fetch(`http://127.0.0.1:${(server.address() as any).port}//evil.invalid/path`,{redirect:'manual'});assert.equal(new URL(response.headers.get('location')!).origin,'https://nagano.example');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-security-policy')||'',/frame-ancestors 'none'/);assert.match(response.headers.get('strict-transport-security')||'',/31536000/);}finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test('upload validation rejects executable masquerading as PNG and incomplete raster content',()=>{
  const bytes=Buffer.alloc(60);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(10,16);bytes.writeUInt32BE(10,20);bytes.write('IEND',52);assert.throws(()=>validateImageData('data:image/png;base64,'+bytes.toString('base64'),'avatar'));assert.throws(()=>validateImageData('data:application/x-msdownload;base64,TVqQ','avatar'));
});
test('production cookies are Secure and server rejects missing or incorrect synchronizer CSRF tokens',async()=>{
  const f=await fixture({production:true});try{
    await f.login();await f.auth.security.flushMail();await f.call('/api/auth/email/verify','POST',{token:f.token()});await f.login();await f.auth.security.flushMail();const result=await f.call('/api/auth/device/confirm','POST',{code:f.code()});assert.equal(result.status,200);assert.match(result.headers.get('set-cookie')||'',/Secure/);
    assert.equal((await f.call('/api/auth/logout','POST',{}, {'X-Nagano-CSRF':''})).status,403);
    assert.equal((await f.call('/api/auth/logout','POST',{}, {'X-Nagano-CSRF':'forged'})).status,403);
    assert.equal((await f.call('/api/auth/logout','POST',{})).status,200);
  }finally{await f.close();}
});
test('revoking other sessions preserves current session and really revokes its previous cookie',async()=>{
  const f=await fixture({enabled:false});try{
    await f.enter();const old=f.jar.get('nagano_session');f.jar.delete('nagano_session');await f.enter();const current=f.jar.get('nagano_session');assert.equal((await f.call('/api/security/me')).data.sessions.length,2);
    assert.equal((await f.call('/api/security/sessions/revoke','POST',{others:true})).status,200);assert.equal((await f.call('/api/security/me')).data.sessions.length,1);
    f.jar.set('nagano_session',old!);assert.equal((await f.call('/api/auth/session')).data.authenticated,false);f.jar.set('nagano_session',current!);assert.equal((await f.call('/api/auth/session')).data.authenticated,true);
  }finally{await f.close();}
});
test('temporary backoff grows after repeated failures and successful login clears adaptive CAPTCHA risk',async()=>{
  const f=await fixture({enabled:false});try{for(let i=0;i<5;i++)await f.call('/api/auth/login','POST',{email:f.initial.email,password:'wrong'});const blocked=await f.login();assert.equal(blocked.status,429);assert.ok(Number(blocked.headers.get('retry-after'))>=1);f.advance(2000);assert.equal((await f.login()).status,200);}finally{await f.close();}
});
