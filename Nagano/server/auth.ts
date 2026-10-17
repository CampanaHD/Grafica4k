import {checkActionPermission} from './actionPermissions';
import {defaultPermissions,validatePermissions,canPerform,permissionResources} from '../src/utils/permissions';
import { Router, type RequestHandler } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {hashPassword,verifyPassword,passwordProblem} from './security/passwords';
import {createSecurityModule,type SecurityOptions} from './security/module';
import type { TeamProfile, ActorStamp, Activity } from '../src/types/team';
import {allModules,canAccess,canReadOrders,defaultModules} from '../src/utils/profileAccess';
import {updateOwnProfile} from './myProfile';
import {validateImageData} from './imageData';

export {hashPassword} from './security/passwords';
export const actorOf = (req: any): ActorStamp | undefined => req.naganoActor;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const roles = ['ADMIN','SALES','DESIGN','PRODUCTION','FINISHING','FINANCE','READONLY','STOCK','ATTENDANCE'];
export function createAuthSystem(dataDir = process.env.PRINTSHOP_DATA_DIR || path.resolve('data'), initial?:{email:string;salt:string;hash:string}, securityOptions:SecurityOptions={}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'team.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS account(id INTEGER PRIMARY KEY CHECK(id=1), email TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS team_profiles(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS profile_secrets(id TEXT PRIMARY KEY,salt TEXT NOT NULL,hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS team_sessions(token_hash TEXT PRIMARY KEY,profile_id TEXT,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS team_activity(id INTEGER PRIMARY KEY AUTOINCREMENT,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS login_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,until_at INTEGER NOT NULL);`);
  if(!db.prepare('SELECT id FROM account WHERE id=1').get()){
    if(!initial){const email=process.env.NAGANO_INITIAL_EMAIL||'',password=process.env.NAGANO_INITIAL_PASSWORD||'';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||passwordProblem(password))throw new Error('Primeira instalação: configure NAGANO_INITIAL_EMAIL e NAGANO_INITIAL_PASSWORD no servidor. Usuários existentes não precisam dessas variáveis.');initial={email,...hashPassword(password)};}
    db.prepare('INSERT INTO account VALUES(1,?,?,?)').run(initial.email.toLowerCase(), initial.salt, initial.hash);
  }
  if (!db.prepare('SELECT id FROM team_profiles LIMIT 1').get()) {
    if(process.env.NODE_ENV==='production'&&!process.env.NAGANO_INITIAL_PIN)throw new Error('Na primeira instalação em produção, configure NAGANO_INITIAL_PIN.');
    db.prepare('INSERT INTO team_profiles VALUES(?,?)').run('administrator', JSON.stringify({ id:'administrator', name:'Administrador', role:'ADMIN', color:'#3158ed', active:true }));
    const pin=process.env.NAGANO_INITIAL_PIN;if(pin){if(!/^\d{6,12}$/.test(pin))throw new Error('O PIN inicial deve ter de 6 a 12 números.');const secret=hashPassword(pin);db.prepare('INSERT INTO profile_secrets VALUES(?,?,?)').run('administrator',secret.salt,secret.hash);}
  }
  for(const row of db.prepare('SELECT id,payload FROM team_profiles').all()){const p=JSON.parse(String(row.payload));if(!p.permissions){p.permissions=defaultPermissions(p.role,p.modules??defaultModules(p.role));if(p.canViewCosts===true&&p.role!=='ADMIN')p.permissions.costs={view:true};db.prepare('UPDATE team_profiles SET payload=? WHERE id=?').run(JSON.stringify(p),row.id);}}
  const profiles = (): TeamProfile[] => db.prepare('SELECT payload FROM team_profiles').all().map(row => {const p=JSON.parse(String(row.payload));return {...p,hasPin:!!db.prepare('SELECT id FROM profile_secrets WHERE id=?').get(p.id)};});
  const profile = (id: string) => profiles().find(p => p.id === id && p.active);
  const activity = (actor: ActorStamp, action: string, entity: string, entityId: string, title: string, fields: Partial<Activity> = {}) => {
    const entry = { ...fields, actor: { ...actor, at: new Date().toISOString() }, action, entity, entityId, title };
    const inserted = db.prepare('INSERT INTO team_activity(payload) VALUES(?)').run(JSON.stringify(entry));
    return { ...entry, id: Number(inserted.lastInsertRowid) } as Activity;
  };
  const tokenFrom = (req: any) => String(req.headers.cookie || '').split(';').map((part: string) => part.trim()).find((part: string) => part.startsWith('nagano_session='))?.slice(15) || '';
  const session = (req: any) => {
    const token = tokenFrom(req);
    if (!/^[a-f0-9]{64}$/.test(token)) return undefined;
    const current=db.prepare('SELECT * FROM team_sessions WHERE token_hash=? AND expires_at>?').get(digest(token), Date.now());
    return current&&security.sessionAllowed(req,current)?current:undefined;
  };
  const cookie = (req: any, res: any, token: string, maxAge = 12 * 3600000) => res.cookie('nagano_session', token, { httpOnly:true, sameSite:'strict', secure:security.config.production||req.secure, maxAge, path:'/' });
  const sameOrigin: RequestHandler = (req, res, next) => {
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      const webhook=req.path.replace(/\/$/,'')==='/whatsapp/webhook';
      if(!webhook&&req.is('application/x-www-form-urlencoded')||!webhook&&req.is('text/plain')||!webhook&&req.is('multipart/form-data')){res.status(415).json({success:false,error:'Formato da solicitação não permitido.'});return;}
      const expected=security.config.origin||`${req.protocol}://${req.get('host')}`;
      if (!webhook&&(req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== expected))) { res.status(403).json({success:false,error:'Origem da solicitação não permitida.'}); return; }
      if(!webhook&&security.config.production&&session(req)&&req.get('X-Nagano-CSRF')!==digest(tokenFrom(req)+':csrf')){res.status(403).json({success:false,error:'Atualize a página para validar a sessão.'});return;}
    }
    next();
  };
  const requireLogin: RequestHandler = (req: any, res, next) => {
    res.setHeader('Cache-Control','no-store');
    const current = session(req);
    if (!current) { res.status(401).json({success:false,error:'Entre no sistema para continuar.'}); return; }
    req.naganoSession = current;
    const selected = profile(String(current.profile_id || ''));
    if (selected) req.naganoActor = {profileId:selected.id,name:selected.name,at:new Date().toISOString()};
    req.naganoProfile = selected;
    if(req.get('X-Nagano-Profile')&&req.get('X-Nagano-Profile')!==selected?.id){res.setHeader('X-Nagano-Profile-Changed','1');res.status(409).json({success:false,error:'O perfil mudou em outra aba. Aguarde a atualização.'});return;}
    next();
  };
  const requireProfile: RequestHandler = (req: any, res, next) => {
    if (!req.naganoProfile) { res.status(403).json({success:false,error:'Selecione seu perfil para continuar.'}); return; }
    const url=req.originalUrl.split('?')[0],p=req.naganoProfile as TeamProfile,read=['GET','HEAD'].includes(req.method);
    if(!['/api/team/me','/api/security/me','/api/security/profile-email'].includes(url))try{security.profileAllowed(p);}catch(error){res.status((error as any).status||403).json({success:false,error:(error as Error).message});return;}
    let allowed=url==='/api/runtime'||url.startsWith('/api/admin/')&&p.role==='ADMIN'||url.startsWith('/api/team/')||url.startsWith('/api/security/')||url.startsWith('/api/erp/');
    if(url.startsWith('/api/quotations')||url==='/api/calculate-roll')allowed=canAccess(p,'quotations');
    else if(url.startsWith('/api/quotation-retention'))allowed=canAccess(p,'settings');
    else if(url.startsWith('/api/work-orders'))allowed=url.endsWith('/bootstrap')?p.role==='ADMIN':read?canReadOrders(p):['work_orders','kanban','pickup','finance','quotations'].some(key=>canAccess(p,key));
    else if(url.startsWith('/api/third-parties'))allowed=read&&!url.endsWith('/history')?(canAccess(p,'third_parties')||canAccess(p,'quotations')):canAccess(p,'third_parties');
    else if(['/api/materials','/api/visual-services','/api/graphic-products','/api/calculate-'].some(prefix=>url.startsWith(prefix)))allowed=read?(canAccess(p,'settings')||canAccess(p,'quotations')||canAccess(p,'inventory')||canAccess(p,'reports')):url.endsWith('/bootstrap')?(canAccess(p,'settings')||canAccess(p,'quotations')):(canAccess(p,'settings')||canAccess(p,'inventory'));
    else if(url.startsWith('/api/futura'))allowed=canAccess(p,'settings');
    else if(url.startsWith('/api/whatsapp')||url.startsWith('/api/notion'))allowed=url==='/api/whatsapp/send'?['integrations','quotations','customers','pickup'].some(key=>canAccess(p,key)):canAccess(p,'integrations');
    if(!allowed){res.setHeader('X-Nagano-Access-Changed','1');res.status(403).json({success:false,error:'Este perfil não tem acesso a esta área. Peça ao administrador para ajustar as abas permitidas.'});return;}
    const readonlyPreview = ['/api/quotations/calculate-item','/api/quotations/simulate','/api/calculate-roll','/api/erp/composition-preview'];
    if (req.naganoProfile.role === 'READONLY' && !read && !readonlyPreview.includes(url) && !['/api/team/me','/api/security/sessions/revoke','/api/security/profile-email'].includes(url)) { res.status(403).json({success:false,error:'Este perfil permite apenas consulta.'}); return; }
    try{checkActionPermission(req);}catch(e){res.status((e as any).status||403).json({success:false,error:(e as Error).message});return;}
    next();
  };
  const admin: RequestHandler = (req: any, res, next) => {
    if (req.naganoProfile?.role !== 'ADMIN') { res.status(403).json({success:false,error:'Escolha um perfil administrador para gerenciar os acessos.'}); return; }
    next();
  };
  const router = Router();
  const issueSession=(req:any,res:any,profileId:string|null=null,deviceId?:string)=>{
    const old=tokenFrom(req),oldMeta=old?db.prepare('SELECT device_id FROM security_sessions WHERE token_hash=?').get(digest(old)):undefined;
    if(old)db.prepare('DELETE FROM team_sessions WHERE token_hash=?').run(digest(old));
    const expires=req.naganoSession?Math.min(Number(req.naganoSession.expires_at),Date.now()+12*3600000):Date.now()+12*3600000;
    const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO team_sessions(token_hash,profile_id,expires_at) VALUES(?,?,?)').run(digest(token),profileId,expires);security.sessionIssued(req,digest(token),deviceId||String(oldMeta?.device_id||''));cookie(req,res,token,Math.max(0,expires-Date.now()));res.setHeader('X-Nagano-CSRF',digest(token+':csrf'));
  };
  const security=createSecurityModule(db,{session,issueSession,requireLogin,requireProfile,admin,profiles},securityOptions);
  router.use('/api', sameOrigin);
  router.use(security.router);
  router.post('/api/auth/login', security.guard(async (req, res) => {
    await security.beforeLogin(req);
    const email = String(req.body.email || '').toLowerCase().trim();
    const key = digest(String(req.ip) + ':' + email.slice(0,200));
    const attempts = db.prepare('SELECT * FROM login_attempts WHERE key=?').get(key);
    if (attempts && Number(attempts.until_at) > Date.now() && Number(attempts.count) >= 8) { res.setHeader('Retry-After',String(Math.max(1,Math.ceil((Number(attempts.until_at)-Date.now())/1000))));res.status(429).json({success:false,error:'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.'}); return; }
    const account = db.prepare('SELECT * FROM account WHERE id=1').get()!;
    const password = typeof req.body.password === 'string' && req.body.password.length <= 200 ? req.body.password : '';
    const valid=await verifyPassword(password,{salt:account.salt,hash:account.hash});
    if (email !== account.email || !valid) {
      const count = attempts && Number(attempts.until_at)>Date.now() ? Number(attempts.count)+1 : 1;
      db.prepare('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)').run(key,count,Date.now()+15*60000);
      security.loginFailed(req);res.status(401).json({success:false,error:'Usuário ou senha incorretos.'}); return;
    }
    db.prepare('DELETE FROM login_attempts WHERE key=?').run(key);
    db.prepare('DELETE FROM team_sessions WHERE expires_at<?').run(Date.now());
    if(db.prepare('SELECT hash FROM account WHERE id=1').get()?.hash!==account.hash){res.status(401).json({success:false,error:'O acesso mudou. Entre novamente.'});return;}
    security.loginPassed(req);
    if(!String(account.salt).startsWith('argon2id$')){const upgraded=hashPassword(password);db.prepare('UPDATE account SET salt=?,hash=? WHERE id=1').run(upgraded.salt,upgraded.hash);}
    if(security.loginGate(req,res))return;
    issueSession(req,res);res.json({success:true,profile:null,profiles:profiles().filter(p=>p.active)});
  }));
  router.get('/api/auth/session', (req: any,res) => {
    const current = session(req);
    res.setHeader('Cache-Control','no-store');
    if(current)res.setHeader('X-Nagano-CSRF',digest(tokenFrom(req)+':csrf'));
    else if(tokenFrom(req))cookie(req,res,'',0);
    res.json({success:true,authenticated:!!current,profile: current ? profile(String(current.profile_id || '')) || null : null,profiles:current ? profiles().filter(p=>p.active) : []});
  });
  router.post('/api/auth/logout', (req,res) => { const token=tokenFrom(req); if(token)db.prepare('DELETE FROM team_sessions WHERE token_hash=?').run(digest(token));security.store.event('LOGOUT',req);cookie(req,res,'',0);res.json({success:true}); });
  router.post('/api/auth/profile',requireLogin,security.guard(async(req:any,res)=>{
    let selected = profile(req.body.profileId);
    if(!selected){res.status(400).json({success:false,error:'Perfil indisponível.'});return;}
    security.profileAllowed(selected);security.limited(req,'profile-select',40);
    const secret=db.prepare('SELECT salt,hash FROM profile_secrets WHERE id=?').get(selected.id);
    if(secret){
      const key=digest('profile:'+selected.id),attempts=db.prepare('SELECT * FROM login_attempts WHERE key=?').get(key);
      if(attempts&&Number(attempts.until_at)>Date.now()&&Number(attempts.count)>=8){res.status(429).json({success:false,error:'Muitas tentativas de PIN. Aguarde 15 minutos.'});return;}
      const pin=typeof req.body.pin==='string'&&req.body.pin.length<=12?req.body.pin:'';
      if(!await verifyPassword(pin,{salt:secret.salt,hash:secret.hash})){
        const latest=db.prepare('SELECT * FROM login_attempts WHERE key=?').get(key);
        const count=latest&&Number(latest.until_at)>Date.now()?Number(latest.count)+1:1;
        db.prepare('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)').run(key,count,Date.now()+15*60000);
        res.status(403).json({success:false,error:'PIN incorreto. Confira e tente novamente.'});return;
      }
      db.prepare('DELETE FROM login_attempts WHERE key=?').run(key);
      // A profile may have been disabled while the asynchronous PIN check was running.
      const freshProfile=profile(selected.id),freshSecret=db.prepare('SELECT hash FROM profile_secrets WHERE id=?').get(selected.id);
      if(!session(req)){res.status(401).json({success:false,error:'Entre novamente para continuar.'});return;}
      if(!freshProfile||freshSecret?.hash!==secret.hash){res.status(403).json({success:false,error:'O acesso ao perfil mudou. Selecione o perfil novamente.'});return;}
      selected=freshProfile;
      if(!String(secret.salt).startsWith('argon2id$')){const upgraded=hashPassword(pin);db.prepare('UPDATE profile_secrets SET salt=?,hash=? WHERE id=?').run(upgraded.salt,upgraded.hash,selected.id);}
    }
    // Rotate on profile switch so changes cannot be attributed using an old session.
    issueSession(req,res,selected.id);security.store.event('PROFILE_SELECTED',req,selected.id);res.json({success:true,profile:selected});
  }));
  router.put('/api/team/me',requireLogin,requireProfile,async(req:any,res)=>{
    try{const data=await updateOwnProfile(db,req.naganoProfile,req.body,hashPassword,()=>!!session(req));
      if(!session(req)){res.status(401).json({success:false,error:'Entre novamente para continuar.'});return;}
      if(req.body.pin)db.prepare('DELETE FROM team_sessions WHERE profile_id=? AND token_hash<>?').run(data.id,req.naganoSession.token_hash);
      activity(actorOf(req)!,'EDITAR','PROFILE',data.id,'Dados pessoais do perfil atualizados.');res.json({success:true,data:profiles().find(p=>p.id===data.id)});
    }catch(error){res.status((error as any).status||400).json({success:false,error:(error as Error).message});}
  });
  router.get('/api/team/permission-audit',requireLogin,requireProfile,admin,(_req,res)=>res.json({success:true,data:profiles().map(p=>({id:p.id,name:p.name,active:p.active,role:p.role,financial:canPerform(p,'finance','view')||canPerform(p,'payables','view'),alterCosts:canPerform(p,'costs','edit'),deleteOrder:canPerform(p,'work_orders','delete'),alterStock:canPerform(p,'inventory','edit'),restoreBackup:p.role==='ADMIN',permissions:p.permissions}))}));
  router.get('/api/team/profiles',requireLogin,requireProfile,admin,(_req,res)=>res.json({success:true,data:profiles()}));
  router.put('/api/team/profiles/:id',requireLogin,requireProfile,admin,security.guard(async(req:any,res)=>{
    const body=req.body;
    if(typeof body.name!=='string'||!body.name.trim()||body.name.length>100||!roles.includes(body.role)||!/^#[a-f0-9]{6}$/i.test(body.color)||typeof body.active!=='boolean'){res.status(400).json({success:false,error:'Informe nome, função e cor válidos.'});return;}
    if(profiles().some(p=>p.id!==req.params.id&&p.name.toLocaleLowerCase()===body.name.trim().toLocaleLowerCase())){res.status(400).json({success:false,error:'Já existe um perfil com esse nome.'});return;}
    const previous=profiles().find(p=>p.id===req.params.id);
    security.limited(req,'profile-save',60);
    if(!previous)await security.captcha(req,'register',!!security.config.siteKey);
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():previous?.email||'';
    if(security.config.enabled&&(!previous||email!==previous.email)&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200)){res.status(400).json({success:false,error:'Informe o e-mail para confirmar o perfil.'});return;}
    if(security.config.production&&((!body.pin&&!previous?.hasPin)||body.removePin)){res.status(400).json({success:false,error:'Perfis precisam de PIN individual em produção.'});return;}
    if(body.modules!==undefined&&(!Array.isArray(body.modules)||body.modules.some((key:any)=>!allModules.includes(key))||(!body.modules.length&&body.role!=='ADMIN'))){res.status(400).json({success:false,error:'Selecione pelo menos uma aba válida para o perfil.'});return;}
    if(body.pin!==undefined&&body.pin!==''&&(typeof body.pin!=='string'||!/^\d{4,12}$/.test(body.pin))){res.status(400).json({success:false,error:'O PIN deve ter de 4 a 12 números.'});return;}
    if(previous?.role==='ADMIN'&&previous.active&&(!body.active||body.role!=='ADMIN')&&!profiles().some(p=>p.id!==previous.id&&p.active&&p.role==='ADMIN')){res.status(400).json({success:false,error:'Mantenha um administrador ativo.'});return;}
    let avatar=previous?.avatar;
    try{if(body.avatar!==undefined)avatar=validateImageData(body.avatar,'avatar');}catch(error){res.status(400).json({success:false,error:(error as Error).message});return;}
    const data:TeamProfile={...previous,id:req.params.id,name:body.name.trim(),role:body.role,color:body.color,active:body.active,avatar,email,canViewCosts:body.canViewCosts===true,permissions:body.role==='ADMIN'?defaultPermissions('ADMIN'):body.permissions!==undefined?validatePermissions(body.permissions):previous?.permissions??defaultPermissions(body.role,body.modules??defaultModules(body.role)),modules:body.role==='ADMIN'?[...allModules]:body.modules??previous?.modules??(previous?[...allModules]:defaultModules(body.role))};
    if(!previous||email!==previous.email)security.inviteProfile(req,data.id,email);
    if(body.pin){const secret=hashPassword(body.pin);db.prepare('INSERT OR REPLACE INTO profile_secrets VALUES(?,?,?)').run(data.id,secret.salt,secret.hash);}
    else if(body.removePin===true)db.prepare('DELETE FROM profile_secrets WHERE id=?').run(data.id);
    if(body.pin||body.removePin===true)db.prepare('DELETE FROM login_attempts WHERE key=?').run(digest('profile:'+data.id));
    if(body.pin||body.removePin===true||!data.active)db.prepare('DELETE FROM team_sessions WHERE profile_id=? AND token_hash<>?').run(data.id,req.naganoSession.token_hash);
    db.prepare('INSERT OR REPLACE INTO team_profiles VALUES(?,?)').run(data.id,JSON.stringify(data));
    activity(actorOf(req)!,previous?'EDITAR':'CRIAR','PROFILE',data.id,`Perfil ${data.name} ${previous?'atualizado':'cadastrado'}.`);
    res.json({success:true,data:profiles().find(p=>p.id===data.id)});
  }));
  router.get('/api/team/activity',requireLogin,requireProfile,(req,res)=>{
    const after=Math.max(0,Number(req.query.after)||0);
    const rows= after ? db.prepare('SELECT id,payload FROM team_activity WHERE id>? ORDER BY id LIMIT 200').all(after) : db.prepare('SELECT id,payload FROM team_activity ORDER BY id DESC LIMIT 100').all().reverse();
    const visible=(entry:Activity)=>entry.entity==='WORK_ORDER'?canReadOrders((req as any).naganoProfile):entry.entity==='QUOTATION'?canAccess((req as any).naganoProfile,'quotations'):entry.entity==='THIRD_PARTY'?canAccess((req as any).naganoProfile,'third_parties'):entry.entity==='PROFILE'?(req as any).naganoProfile.role==='ADMIN':canAccess((req as any).naganoProfile,'activity');
    res.json({success:true,data:rows.map(row=>({...JSON.parse(String(row.payload)),id:Number(row.id)})).filter(visible),cursor:rows.length?Number(rows[rows.length-1].id):after});
  });
  router.post('/api/team/activity',requireLogin,requireProfile,(req:any,res)=>{
    const {action,entity,entityId,details}=req.body;
    if(![action,entity,entityId,details].every(v=>typeof v==='string'&&v.length<=2000)){res.status(400).json({success:false,error:'Registro inválido.'});return;}
    res.json({success:true,data:activity(actorOf(req)!,action,entity,entityId,details)});
  });
  return {router,requireLogin,requireProfile,admin,activity,profiles,security,close:()=>{security.close();db.close();}};
}
