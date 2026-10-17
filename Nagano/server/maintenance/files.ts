import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const hashFile=(file:string)=>{const hash=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.alloc(1024*1024);try{let n:number;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,n));return hash.digest('hex');}finally{fs.closeSync(fd);}};
export function inside(root:string,file:string){const relative=path.relative(path.resolve(root),path.resolve(file));if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Caminho fora do diretório permitido.');return file;}
export function walk(root:string,skip=(relative:string)=>false):string[]{if(!fs.existsSync(root))return [];const files:string[]=[];const visit=(dir:string)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name),relative=path.relative(root,file).replace(/\\/g,'/');if(skip(relative))continue;if(e.isSymbolicLink())throw new Error('Link de arquivo não permitido na área de dados.');if(e.isDirectory())visit(file);else if(e.isFile())files.push(file);}};visit(root);return files.sort();}
export function privateDir(dir:string){fs.mkdirSync(dir,{recursive:true,mode:0o700});}
export function atomicJson(file:string,data:any){privateDir(path.dirname(file));const tmp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2),{mode:0o600,flag:'wx'});const fd=fs.openSync(tmp,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);}
export const readJson=(file:string,fallback:any)=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fallback;
export function removeWork(root:string,file:string){inside(root,file);if(fs.lstatSync(file).isSymbolicLink())throw new Error('Diretório temporário inválido.');fs.rmSync(file,{recursive:true,force:true});}
export function copyFile(source:string,dest:string){privateDir(path.dirname(dest));fs.copyFileSync(source,dest);fs.chmodSync(dest,0o600);}
