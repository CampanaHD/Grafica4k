import crypto from 'node:crypto';
import {promisify} from 'node:util';
const params={memory:65536,passes:3,parallelism:1,tagLength:32};
const native=crypto as any;
// Salt carries the algorithm version; existing scrypt verifiers remain readable.
export function hashPassword(password:string,salt?:string){
  if(!native.argon2Sync)throw new Error('Atualize o Node.js para 24.13 ou superior.');
  const nonce=salt?.startsWith('argon2id$')?salt.split('$')[1]:crypto.randomBytes(24).toString('hex');
  return {salt:`argon2id$${nonce}`,hash:native.argon2Sync('argon2id',{...params,message:password,nonce:Buffer.from(nonce,'hex')}).toString('hex')};
}
let running=0;
export async function verifyPassword(value:string,secret:{salt:unknown;hash:unknown}){
  if(running>=4)throw Object.assign(new Error('Muitas solicitações. Tente novamente em instantes.'),{status:429});
  running++;
  try{
    const salt=String(secret.salt),expected=Buffer.from(String(secret.hash),'hex');
    const actual:Buffer=salt.startsWith('argon2id$')
      ?await new Promise((resolve,reject)=>native.argon2('argon2id',{...params,message:value,nonce:Buffer.from(salt.split('$')[1],'hex')},(e:any,b:Buffer)=>e?reject(e):resolve(b)))
      :await(promisify(crypto.scrypt) as any)(value,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
    return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
  }finally{running--;}
}
export function passwordProblem(password:unknown){
  if(typeof password!=='string'||password.length<12||password.length>200)return 'Use uma senha ou frase com 12 a 200 caracteres.';
  const normalized=password.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(new Set(password).size<5||/^(.)\1+$/.test(password)||['123456789012','password1234','senha12345678','qwerty12345678','administrador','graficanagano'].includes(normalized))return 'Escolha uma senha menos previsível ou uma frase mais longa.';
  return '';
}
