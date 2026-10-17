import {createHash} from 'node:crypto';
import {verifyPassword} from './security/passwords';
import type {DatabaseSync} from 'node:sqlite';
import type {TeamProfile} from '../src/types/team';
import {validateImageData} from './imageData';
export async function updateOwnProfile(db:DatabaseSync,profile:TeamProfile,body:any,hashPassword:(value:string)=>{salt:string;hash:string},sessionValid=()=>true) {
  const fail=(message:string,status=400)=>{throw Object.assign(new Error(message),{status});};
  const clean=(key:string,max:number,fallback='')=>{const value=body[key]??profile[key]??fallback;if(typeof value!=='string'||value.length>max)fail('Dados pessoais inválidos.');return value.trim();};
  const name=clean('name',100),phone=clean('phone',40),email=clean('email',200),jobTitle=clean('jobTitle',100),username=clean('username',100);
  if(!name)fail('Informe seu nome.');
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Informe um e-mail válido.');
  const others=db.prepare('SELECT payload FROM team_profiles WHERE id<>?').all(profile.id).map(row=>JSON.parse(String(row.payload)));
  if(others.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase()||username&&p.username?.toLocaleLowerCase()===username.toLocaleLowerCase()))fail('Nome ou usuário já utilizado por outro perfil.');
  if(body.preferences!==undefined&&(typeof body.preferences?.reduceMotion!=='boolean'))fail('Preferência inválida.');
  const avatar=body.avatar===undefined?profile.avatar:validateImageData(body.avatar,'avatar');
  if(body.pin!==undefined&&(typeof body.pin!=='string'||!/^\d{4,12}$/.test(body.pin)))fail('A senha do perfil deve ter de 4 a 12 números.');
  const secret=db.prepare('SELECT salt,hash FROM profile_secrets WHERE id=?').get(profile.id);
  if(body.pin&&secret){
    const key=createHash('sha256').update('profile:'+profile.id).digest('hex'),attempt=db.prepare('SELECT count,until_at FROM login_attempts WHERE key=?').get(key);
    if(attempt&&Number(attempt.until_at)>Date.now()&&Number(attempt.count)>=8)fail('Muitas tentativas. Aguarde 15 minutos.',429);
    const current=typeof body.currentPin==='string'&&body.currentPin.length<=12?body.currentPin:'';
    if(!await verifyPassword(current,{salt:secret.salt,hash:secret.hash})){db.prepare('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)').run(key,attempt&&Number(attempt.until_at)>Date.now()?Number(attempt.count)+1:1,Date.now()+15*60000);fail('Senha / PIN atual incorreto.',403);}
    db.prepare('DELETE FROM login_attempts WHERE key=?').run(key);
    if(db.prepare('SELECT hash FROM profile_secrets WHERE id=?').get(profile.id)?.hash!==secret.hash)fail('A senha foi alterada em outra sessão. Tente novamente.',409);
  }
  // Re-read after credential validation; never accept roles, modules or IDs from this form.
  const stored=db.prepare('SELECT payload FROM team_profiles WHERE id=?').get(profile.id);
  const latest=stored?JSON.parse(String(stored.payload)):undefined;
  if(!sessionValid())fail('Entre novamente para continuar.',401);
  if(!latest?.active)fail('Perfil indisponível.',403);
  const data:TeamProfile={...latest,name,phone,email,jobTitle,username,avatar,preferences:{...latest.preferences,...(body.preferences?{reduceMotion:body.preferences.reduceMotion}:{})}};
  if(body.pin){const hashed=hashPassword(body.pin);db.prepare('INSERT OR REPLACE INTO profile_secrets VALUES(?,?,?)').run(profile.id,hashed.salt,hashed.hash);}
  db.prepare('UPDATE team_profiles SET payload=? WHERE id=?').run(JSON.stringify(data),profile.id);
  return data;
}
