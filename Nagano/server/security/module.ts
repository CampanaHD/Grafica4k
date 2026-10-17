import {Router,type RequestHandler} from 'express';
import type {DatabaseSync} from 'node:sqlite';
import {securityConfig,type SecurityConfig} from './config';
import {smtpSender,securityMessage,type MailSender} from './mail';
import {securityStore,digest,opaque,deviceSummary} from './store';
import {hashPassword,passwordProblem,verifyPassword} from './passwords';
export interface SecurityOptions {config?:SecurityConfig;sendMail?:MailSender;fetch?:typeof fetch;now?:()=>number}
interface Hooks {session:(req:any)=>any;issueSession:(req:any,res:any,profileId?:string|null,deviceId?:string)=>void;requireLogin:RequestHandler;requireProfile:RequestHandler;admin:RequestHandler;profiles:()=>any[]}
const generic='Se existir uma conta associada a este e-mail, enviaremos instruções para recuperação.';
const error=(message:string,status=400,code?:string)=>Object.assign(new Error(message),{status,code});
export const readCookie=(req:any,name:string)=>String(req.headers.cookie||'').split(';').map((x:string)=>x.trim()).find((x:string)=>x.startsWith(name+'='))?.slice(name.length+1)||'';
export function createSecurityModule(db:DatabaseSync,hooks:Hooks,options:SecurityOptions={}){
  const config=options.config||securityConfig(),store=securityStore(db,options.now),send=options.sendMail||smtpSender(config),http=options.fetch||fetch;
  db.exec('CREATE TABLE IF NOT EXISTS security_captcha(hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL)');
  const jobs=new Set<Promise<void>>();
  const mail=(to:string,subject:string,body:string)=>{const job=Promise.resolve().then(()=>send({to,...securityMessage(subject,body)})).catch(()=>{store.event('EMAIL_DELIVERY_FAILED');});jobs.add(job);void job.finally(()=>jobs.delete(job));};
  const link=(purpose:string,token:string)=>`${config.origin}/#security=${purpose}&token=${token}`;
  const account=()=>db.prepare('SELECT * FROM account WHERE id=1').get()!;
  const limited=(req:any,action:string,max=5,window=15*60000,subject='')=>{store.limit(`${action}:origin:${req.ip}`,max*4,window);store.limit(`${action}:subject:${subject||'account'}`,max,window);};
  const publicConfig=()=>({emailProtection:config.enabled,emailConfigured:!!(config.origin&&config.smtpUser&&config.smtpPassword),captchaConfigured:!!config.siteKey,siteKey:config.siteKey,production:config.production,mfa:{prepared:true,available:false}});
  const captcha=async(req:any,action:string,required:boolean)=>{
    if(!required)return;
    store.event('CAPTCHA_REQUIRED',req);
    if(!config.siteKey||!config.captchaSecret)throw error('A verificação de segurança precisa ser configurada pelo administrador.',503,'CAPTCHA_NOT_CONFIGURED');
    const token=req.body?.captchaToken;
    if(typeof token!=='string'||!token||token.length>2048)throw error('Conclua a verificação de segurança para continuar.',403,'CAPTCHA_REQUIRED');
    db.prepare('DELETE FROM security_captcha WHERE expires_at<?').run(store.now());
    const reserved=db.prepare('INSERT OR IGNORE INTO security_captcha VALUES(?,?)').run(digest(token),store.now()+5*60000);
    let valid=false;
    if(reserved.changes)try{
      const response=await http('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:config.captchaSecret,response:token}),signal:AbortSignal.timeout(8000)});
      const result=await response.json() as any,age=store.now()-Date.parse(result.challenge_ts);
      valid=response.ok&&result.success===true&&config.captchaHostnames.includes(result.hostname)&&result.action===action&&age>=-30000&&age<=300000;
    }catch{/* Fail closed; never log provider tokens or response bodies. */}
    store.event(valid?'CAPTCHA_VALIDATED':'CAPTCHA_FAILED',req);
    if(!valid)throw error('Não foi possível validar a verificação de segurança. Tente novamente.',403,'CAPTCHA_INVALID');
  };
  const sendVerification=(req:any,subject='account',email=String(account().email),cooldownChecked=false)=>{
    if(!cooldownChecked)store.limit('verify-cooldown:'+subject,1,60000);
    const token=store.token('verify',subject,24*3600000,{email});
    if(subject==='account')db.prepare('UPDATE account_security SET email_verification_sent_at=? WHERE id=1').run(store.now());
    mail(email,'Confirme seu e-mail',`Confirme seu e-mail para continuar. Este link é válido por 24 horas e funciona uma única vez:\n\n${link('verify',token)}`);store.event('EMAIL_VERIFICATION_SENT',req,subject==='account'?undefined:subject);
  };
  const knownDevice=(req:any)=>{
    const token=readCookie(req,'nagano_device');
    return /^[a-f0-9]{64}$/.test(token)?db.prepare('SELECT * FROM security_devices WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?').get(digest(token),store.now()):undefined;
  };
  const trustDevice=(req:any,res:any)=>{
    const token=opaque(),id=opaque();
    db.prepare('INSERT INTO security_devices VALUES(?,?,?,?,?,?,NULL)').run(id,digest(token),JSON.stringify(deviceSummary(req.get('user-agent')||'')),store.now(),store.now(),store.now()+30*86400000);
    res.cookie('nagano_device',token,{httpOnly:true,sameSite:'strict',secure:config.production||req.secure,path:'/',maxAge:30*86400000});return id;
  };
  const beforeLogin=async(req:any)=>{
    const email=String(req.body?.email||'').slice(0,200).trim().toLowerCase();limited(req,'login',30,15*60000,email);
    for(const key of ['account:'+email,'origin:'+req.ip]){const blocked=db.prepare('SELECT until_at FROM security_backoff WHERE key=? AND until_at>?').get(digest(key),store.now());if(blocked)throw Object.assign(error('Aguarde alguns instantes antes de tentar novamente.',429),{retryAfter:Math.max(1,Math.ceil((Number(blocked.until_at)-store.now())/1000))});}
    const risk=store.count('login-fail:account:'+email)>=3||store.count('login-fail:origin:'+req.ip)>=6;
    await captcha(req,'login',risk&&!!config.siteKey);
  };
  const loginFailed=(req:any)=>{const email=String(req.body?.email||'').slice(0,200).trim().toLowerCase();for(const key of ['account:'+email,'origin:'+req.ip]){store.limit('login-fail:'+key,10000,15*60000);const failures=store.count('login-fail:'+key);if(failures>=5)db.prepare('INSERT OR REPLACE INTO security_backoff VALUES(?,?)').run(digest(key),store.now()+Math.min(60000,1000*2**Math.min(10,failures-5)));}store.event('LOGIN_FAILED',req);};
  const loginPassed=(req:any)=>{const email=String(req.body?.email||'').slice(0,200).trim().toLowerCase();for(const key of ['account:'+email,'origin:'+req.ip]){db.prepare('DELETE FROM security_limits WHERE key=?').run(digest('login-fail:'+key));db.prepare('DELETE FROM security_backoff WHERE key=?').run(digest(key));}};
  const loginGate=(req:any,res:any)=>{
    const currentAccount=account();
    if(!config.enabled)return false;
    const security=db.prepare('SELECT * FROM account_security WHERE id=1').get()!;
    if(!security.email_verified_at){
      try{sendVerification(req);}catch(e){if((e as any).status!==429)throw e;}
      res.json({success:true,requiresEmailVerification:true,message:'Confirme seu e-mail para continuar.'});return true;
    }
    const known=knownDevice(req);
    if(known){db.prepare('UPDATE security_devices SET last_used_at=? WHERE id=?').run(store.now(),known.id);req.securityDeviceId=known.id;return false;}
    limited(req,'new-device',5,15*60000);
    const challenge=store.challenge({accountHash:currentAccount.hash,summary:deviceSummary(req.get('user-agent')||'')});
    const old=readCookie(req,'nagano_challenge');if(old)db.prepare('DELETE FROM security_challenges WHERE hash=?').run(digest(old));
    res.cookie('nagano_challenge',challenge.id,{httpOnly:true,sameSite:'strict',secure:config.production||req.secure,maxAge:10*60000,path:'/api/auth/device'});
    mail(String(currentAccount.email),'Confirme este dispositivo',`Recebemos uma tentativa de acesso em um novo dispositivo.\n\nCódigo: ${challenge.code}\n\nVálido por 10 minutos, com até 5 tentativas. Digite o código somente no sistema Nagano que você abriu. Não compartilhe este código.`);
    store.event('NEW_DEVICE_CHALLENGE',req);res.json({success:true,requiresDeviceVerification:true,message:'Enviamos um código para o e-mail confirmado da conta.'});return true;
  };
  const sessionAllowed=(req:any,current:any)=>{
    const meta=db.prepare('SELECT * FROM security_sessions WHERE token_hash=?').get(current.token_hash);
    // Old local sessions are preserved only until email protection is activated.
    if(config.enabled&&!meta)return false;
    if(config.enabled&&!db.prepare('SELECT email_verified_at FROM account_security WHERE id=1').get()?.email_verified_at)return false;
    if(meta&&Number(meta.last_used_at)<store.now()-60*60000){db.prepare('DELETE FROM team_sessions WHERE token_hash=?').run(current.token_hash);return false;}
    if(config.enabled&&(!meta?.device_id||!db.prepare('SELECT id FROM security_devices WHERE id=? AND revoked_at IS NULL AND expires_at>?').get(meta.device_id,store.now())))return false;
    if(meta&&req.path!=='/api/auth/session'&&req.originalUrl?.split('?')[0]!=='/api/auth/session')db.prepare('UPDATE security_sessions SET last_used_at=? WHERE token_hash=?').run(store.now(),current.token_hash);
    return true;
  };
  const sessionIssued=(req:any,tokenHash:string,deviceId?:string)=>{
    db.prepare('INSERT INTO security_sessions VALUES(?,?,?,?,?)').run(tokenHash,deviceId||req.securityDeviceId||knownDevice(req)?.id||null,store.now(),store.now(),JSON.stringify(deviceSummary(req.get('user-agent')||'')));if(!req.naganoSession)store.event('LOGIN_SUCCESS',req);
  };
  const profileAllowed=(selected:any)=>{
    if(config.enabled){const row=db.prepare('SELECT * FROM security_profile_email WHERE profile_id=?').get(selected.id);if(selected.id!=='administrator'&&(!row?.verified_at||row.email!==selected.email))throw error('Confirme o e-mail deste perfil para continuar.',403,'EMAIL_UNVERIFIED');}
    if(config.production&&!selected.hasPin)throw error('Configure um PIN individual neste perfil antes de publicar o sistema.',403,'PROFILE_PIN_REQUIRED');
  };
  const inviteProfile=(req:any,id:string,email:string)=>{if(!config.enabled)return;if(typeof email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200)throw error('Informe um e-mail válido para confirmar este perfil.');const existing=db.prepare('SELECT email,verified_at FROM security_profile_email WHERE profile_id=?').get(id);if(existing?.verified_at&&existing.email===email)return;store.limit('verify-cooldown:'+id,1,60000);db.prepare('INSERT INTO security_profile_email VALUES(?,?,NULL) ON CONFLICT(profile_id) DO UPDATE SET email=excluded.email,verified_at=NULL').run(id,email);sendVerification(req,id,email,true);};
  const guard=(handler:(req:any,res:any)=>any):RequestHandler=>(req,res,next)=>{Promise.resolve().then(()=>handler(req,res)).catch(e=>{if((e as any).retryAfter)res.setHeader('Retry-After',String((e as any).retryAfter));res.status((e as any).status||500).json({success:false,code:(e as any).code,error:(e as any).status?(e as Error).message:'Não foi possível concluir a operação de segurança.'});});};
  const router=Router();router.use('/api/auth',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  router.get('/api/auth/security-config',(_req,res)=>res.json({success:true,...publicConfig()}));
  router.post('/api/auth/email/resend',guard(async(req,res)=>{
    const email=String(req.body.email||'').trim().toLowerCase();limited(req,'resend',4,15*60000,email);await captcha(req,'resend',!!config.siteKey&&store.count('resend:subject:'+email)>2);
    if(config.enabled&&email===account().email&&!db.prepare('SELECT email_verified_at FROM account_security WHERE id=1').get()?.email_verified_at)try{sendVerification(req);}catch(e){if((e as any).status!==429)throw e;}
    res.json({success:true,message:'Se houver uma confirmação pendente, enviaremos as instruções para o e-mail informado.'});
  }));
  router.post('/api/auth/email/verify',guard((req,res)=>{
    limited(req,'verify',15);const row=store.consume(req.body.token,'verify');if(!row)throw error('Link inválido, expirado ou já utilizado. Solicite outro.');
    const payload=JSON.parse(String(row.payload));if(row.subject==='account'){if(payload.email!==account().email)throw error('Este link não está mais disponível.');db.prepare('UPDATE account_security SET email_verified_at=? WHERE id=1').run(store.now());}
    else {const profile=hooks.profiles().find(p=>p.id===row.subject);const emailRow=db.prepare('SELECT email FROM security_profile_email WHERE profile_id=?').get(row.subject);if(!profile||emailRow?.email!==payload.email||profile.email!==payload.email)throw error('Este link não está mais disponível.');db.prepare('UPDATE security_profile_email SET verified_at=? WHERE profile_id=?').run(store.now(),row.subject);}
    store.event('EMAIL_VERIFIED',req,row.subject==='account'?undefined:String(row.subject));res.json({success:true,message:'E-mail confirmado. Entre no sistema para continuar.'});
  }));
  router.post('/api/auth/password/forgot',guard(async(req,res)=>{
    const email=String(req.body.email||'').trim().toLowerCase();limited(req,'recovery',4,15*60000,email);await captcha(req,'recovery',!!config.siteKey&&store.count('recovery:subject:'+email)>1);
    if(config.enabled&&email===account().email){const token=store.token('reset','account',30*60000,{accountHash:account().hash});mail(email,'Recuperação de senha',`Para definir uma nova senha, abra o link abaixo. Ele expira em 30 minutos e funciona uma única vez:\n\n${link('reset',token)}\n\nSe você não solicitou a recuperação, ignore esta mensagem.`);}
    store.event('PASSWORD_RECOVERY_REQUESTED',req);res.json({success:true,message:generic});
  }));
  const replacePassword=(password:string)=>{const secret=hashPassword(password);db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE account SET salt=?,hash=? WHERE id=1').run(secret.salt,secret.hash);db.prepare('UPDATE account_security SET password_changed_at=? WHERE id=1').run(store.now());db.prepare('UPDATE security_tokens SET used_at=? WHERE used_at IS NULL').run(store.now());db.exec('DELETE FROM security_challenges;DELETE FROM team_sessions;DELETE FROM security_sessions;');db.prepare('UPDATE security_devices SET revoked_at=? WHERE revoked_at IS NULL').run(store.now());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}mail(String(account().email),'Senha alterada','A senha da conta foi alterada. As sessões e os dispositivos anteriores foram encerrados. Caso não reconheça esta alteração, recupere sua conta imediatamente.');};
  router.post('/api/auth/password/reset',guard((req,res)=>{
    limited(req,'reset',8);const problem=passwordProblem(req.body.password);if(problem)throw error(problem);if(req.body.password!==req.body.confirmation)throw error('As senhas não conferem.');
    const row=store.peek(req.body.token,'reset');if(!row||JSON.parse(String(row.payload)).accountHash!==account().hash)throw error('Link inválido, expirado ou já utilizado. Solicite outro.');
    if(!store.consume(req.body.token,'reset'))throw error('Link inválido, expirado ou já utilizado.');replacePassword(req.body.password);store.event('PASSWORD_RESET',req);res.clearCookie('nagano_session',{path:'/'});res.json({success:true,message:'Senha atualizada. Entre novamente.'});
  }));
  router.post('/api/auth/device/confirm',guard(async(req,res)=>{
    limited(req,'device-confirm',15);await captcha(req,'device',!!config.siteKey&&store.count('device-confirm:subject:account')>5);
    const id=readCookie(req,'nagano_challenge'),row=/^[a-f0-9]{64}$/.test(id)?db.prepare('SELECT * FROM security_challenges WHERE hash=? AND expires_at>? AND attempts<5').get(digest(id),store.now()):undefined;
    if(!row)throw error('Verificação expirada. Entre novamente para receber outro código.');
    db.prepare('UPDATE security_challenges SET attempts=attempts+1 WHERE hash=?').run(row.hash);
    const payload=JSON.parse(String(row.payload)),code=typeof req.body.code==='string'?req.body.code:'';
    if(payload.accountHash!==account().hash||!/^\d{8}$/.test(code)||digest(id+':'+code)!==row.code_hash){store.event('DEVICE_VERIFICATION_FAILED',req);throw error('Código inválido ou expirado. Confira e tente novamente.');}
    db.prepare('DELETE FROM security_challenges WHERE hash=?').run(row.hash);
    const deviceId=trustDevice(req,res);hooks.issueSession(req,res,null,deviceId);res.clearCookie('nagano_challenge',{path:'/api/auth/device'});store.event('NEW_DEVICE_CONFIRMED',req);
    const report=store.token('report',String(deviceId),24*3600000,{deviceId});
    const summary=deviceSummary(req.get('user-agent')||'');mail(String(account().email),'Detectamos um novo acesso à sua conta',`Data e hora: ${new Date(store.now()).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} (Brasília)\nNavegador: ${summary.browser}\nSistema: ${summary.os}\n\nNão reconheço este acesso:\n${link('report',report)}\n\nO link permite encerrar este dispositivo e revisar a segurança.`);
    res.json({success:true,profile:null,profiles:hooks.profiles().filter(p=>p.active)});
  }));
  router.post('/api/auth/device/report',guard((req,res)=>{
    limited(req,'report',10);const row=store.consume(req.body.token,'report');if(!row)throw error('Link inválido, expirado ou já utilizado.');const {deviceId}=JSON.parse(String(row.payload));
    db.prepare('UPDATE security_devices SET revoked_at=? WHERE id=?').run(store.now(),deviceId);db.prepare('DELETE FROM team_sessions WHERE token_hash IN (SELECT token_hash FROM security_sessions WHERE device_id=?)').run(deviceId);store.event('UNRECOGNIZED_LOGIN_REVOKED',req);res.json({success:true,message:'Dispositivo e sessões encerrados. Recomendamos recuperar a senha e revisar sua conta.'});
  }));
  const auth=[hooks.requireLogin,hooks.requireProfile];
  router.get('/api/security/me',...auth,guard((req,res)=>{
    const current=hooks.session(req),isAdmin=req.naganoProfile.role==='ADMIN',state=db.prepare('SELECT * FROM account_security WHERE id=1').get();
    const sessions=db.prepare('SELECT t.token_hash,t.profile_id,t.expires_at,s.device_id,s.created_at,s.last_used_at,s.summary FROM team_sessions t JOIN security_sessions s ON s.token_hash=t.token_hash WHERE t.expires_at>?').all(store.now()).filter(s=>isAdmin||s.profile_id===req.naganoProfile.id).map(s=>({id:digest('public:'+String(s.token_hash)),profileId:s.profile_id,current:s.token_hash===current.token_hash,createdAt:s.created_at,lastUsedAt:s.last_used_at,expiresAt:s.expires_at,deviceId:s.device_id,...JSON.parse(String(s.summary))}));
    const devices=isAdmin?db.prepare('SELECT id,summary,created_at,last_used_at,expires_at,revoked_at FROM security_devices WHERE revoked_at IS NULL AND expires_at>? ORDER BY last_used_at DESC LIMIT 100').all(store.now()).map(d=>({id:d.id,...JSON.parse(String(d.summary)),createdAt:d.created_at,lastUsedAt:d.last_used_at,trusted:true,current:d.id===db.prepare('SELECT device_id FROM security_sessions WHERE token_hash=?').get(current.token_hash)?.device_id})):[];
    const events=db.prepare('SELECT id,type,profile_id,created_at,summary FROM security_events WHERE (?=1 OR profile_id=?) ORDER BY id DESC LIMIT 50').all(isAdmin?1:0,req.naganoProfile.id).map(e=>({...e,summary:JSON.parse(String(e.summary))}));
    const profileEmail=db.prepare('SELECT email,verified_at FROM security_profile_email WHERE profile_id=?').get(req.naganoProfile.id);
    res.json({success:true,admin:isAdmin,config:publicConfig(),email:isAdmin?account().email:req.naganoProfile.email||'',emailVerified:isAdmin?!!state?.email_verified_at:!!profileEmail?.verified_at&&profileEmail.email===req.naganoProfile.email,passwordChangedAt:isAdmin?state?.password_changed_at:null,sessions,devices,events});
  }));
  router.post('/api/security/password',...auth,hooks.admin,guard(async(req,res)=>{
    limited(req,'change-password',5);await captcha(req,'password',!!config.siteKey&&store.count('change-password:subject:account')>2);
    const problem=passwordProblem(req.body.password);if(problem)throw error(problem);if(req.body.password!==req.body.confirmation)throw error('As senhas não conferem.');
    const initial=account();if(typeof req.body.currentPassword!=='string'||req.body.currentPassword.length>200||!await verifyPassword(req.body.currentPassword,{salt:initial.salt,hash:initial.hash}))throw error('Senha atual incorreta.',403);
    if(!hooks.session(req)||initial.hash!==account().hash)throw error('A sessão mudou. Entre novamente.',401);
    replacePassword(req.body.password);store.event('PASSWORD_CHANGED',req,req.naganoProfile.id);res.clearCookie('nagano_session',{path:'/'});res.json({success:true,message:'Senha alterada. Entre novamente em todos os dispositivos.'});
  }));
  router.post('/api/security/sessions/revoke',...auth,guard((req,res)=>{
    limited(req,'revoke-session',20);const current=hooks.session(req),isAdmin=req.naganoProfile.role==='ADMIN';
    const rows=db.prepare('SELECT token_hash,profile_id FROM team_sessions').all().filter(s=>(isAdmin||s.profile_id===req.naganoProfile.id)&&(req.body.others?s.token_hash!==current.token_hash:digest('public:'+String(s.token_hash))===req.body.id));
    for(const s of rows)db.prepare('DELETE FROM team_sessions WHERE token_hash=?').run(s.token_hash);store.event('SESSION_REVOKED',req,req.naganoProfile.id);res.json({success:true});
  }));
  router.post('/api/security/devices/revoke',...auth,hooks.admin,guard((req,res)=>{
    limited(req,'revoke-device',20);const device=db.prepare('SELECT id FROM security_devices WHERE id=? AND revoked_at IS NULL').get(String(req.body.id||''));if(!device)throw error('Dispositivo indisponível.');
    db.prepare('UPDATE security_devices SET revoked_at=? WHERE id=?').run(store.now(),device.id);db.prepare('DELETE FROM team_sessions WHERE token_hash IN (SELECT token_hash FROM security_sessions WHERE device_id=?)').run(device.id);store.event('DEVICE_REVOKED',req,req.naganoProfile.id);mail(String(account().email),'Dispositivo removido','Um dispositivo confiável foi removido em Meu Perfil > Segurança. As sessões desse dispositivo foram encerradas.');res.json({success:true});
  }));
  router.get('/api/security/admin',...auth,hooks.admin,guard((_req,res)=>{
    store.cleanup();const counts=db.prepare('SELECT type,COUNT(*) AS count FROM security_events WHERE created_at>? GROUP BY type').all(store.now()-24*3600000),limits=db.prepare('SELECT COUNT(*) AS count FROM (SELECT key FROM security_limit_blocks WHERE until_at>? UNION SELECT key FROM security_backoff WHERE until_at>?)').get(store.now(),store.now());
    res.json({success:true,config:publicConfig(),counts,limitedOrigins:limits?.count||0,events:db.prepare('SELECT id,type,profile_id,created_at,summary FROM security_events ORDER BY id DESC LIMIT 100').all().map(e=>({...e,summary:JSON.parse(String(e.summary))}))});
  }));
  router.post('/api/security/profile-email',...auth,guard(async(req,res)=>{limited(req,'profile-email',4,15*60000,req.naganoProfile.id);if(!config.enabled)throw error('Configure o envio de e-mails no servidor antes de confirmar os perfis.',503);inviteProfile(req,req.naganoProfile.id,req.naganoProfile.email||'');res.json({success:true,message:'Enviamos o link de confirmação para o e-mail do perfil.'});}));
  router.post('/api/security/profiles/:id/resend',...auth,hooks.admin,guard((req,res)=>{limited(req,'profile-invite',4,15*60000,String(req.params.id));const profile=hooks.profiles().find(p=>p.id===req.params.id);if(!profile)throw error('Perfil indisponível.');inviteProfile(req,profile.id,profile.email||'');res.json({success:true});}));
  const maintenance=setInterval(()=>{store.cleanup();db.prepare('DELETE FROM security_captcha WHERE expires_at<?').run(store.now());},15*60000);maintenance.unref();
  return {router,config,publicConfig,beforeLogin,loginFailed,loginPassed,loginGate,sessionAllowed,sessionIssued,profileAllowed,inviteProfile,captcha,limited,guard,store,flushMail:()=>Promise.all(jobs),close:()=>clearInterval(maintenance)};
}
