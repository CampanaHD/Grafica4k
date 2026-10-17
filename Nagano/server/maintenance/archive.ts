import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGzip,createGunzip} from 'node:zlib';
import {inside,privateDir,hashFile,removeWork} from './files';
const magic=Buffer.from('NAGANO-BACKUP-2\n');
export type BackupManifest={version:2;schemaVersion:1;id:string;createdAt:string;reason:string;actor?:{profileId:string;name:string};databases:any;files:{path:string;size:number;checksum:string}[]};
export async function packArchive(folder:string,manifest:BackupManifest,target:string,key:Buffer){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),header=Buffer.concat([magic,iv]);cipher.setAAD(header);fs.writeFileSync(target,header,{flag:'wx',mode:0o600});
 async function* entries(){const json=Buffer.from(JSON.stringify(manifest)),length=Buffer.alloc(4);length.writeUInt32BE(json.length);yield length;yield json;for(const file of manifest.files)for await(const chunk of fs.createReadStream(path.join(folder,file.path)))yield chunk;}
 try{await pipeline(Readable.from(entries()),createGzip(),cipher,fs.createWriteStream(target,{flags:'a'}));fs.appendFileSync(target,cipher.getAuthTag());const fd=fs.openSync(target,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return hashFile(target);}catch(e){fs.rmSync(target,{force:true});throw e;}
}
/** Only authenticated ciphertext is extracted, and only into a new, isolated directory. */
export async function unpackArchive(archive:string,destination:string,key:Buffer,workRoot:string){
 inside(workRoot,destination);if(fs.existsSync(destination))throw new Error('Destino temporário já existe.');privateDir(destination);const decoded=destination+'.decoded',raw=destination+'.raw';
 try{const fd=fs.openSync(archive,'r'),size=fs.fstatSync(fd).size,header=Buffer.alloc(magic.length+12),tag=Buffer.alloc(16);try{if(size<header.length+16)throw new Error('Backup incompleto.');fs.readSync(fd,header,0,header.length,0);fs.readSync(fd,tag,0,16,size-16);}finally{fs.closeSync(fd);}if(!header.subarray(0,magic.length).equals(magic))throw new Error('Formato de backup não reconhecido.');
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,header.subarray(magic.length));decipher.setAAD(header);decipher.setAuthTag(tag);
 await pipeline(fs.createReadStream(archive,{start:header.length,end:size-17}),decipher,fs.createWriteStream(decoded,{flags:'wx',mode:0o600}));
 // Bound expansion to avoid decompression bombs, including files from an untrusted upload.
 let expanded=0;const gunzip=createGunzip();gunzip.on('data',chunk=>{expanded+=chunk.length;if(expanded>10*1024**3)gunzip.destroy(new Error('Backup excede o limite de restauração.'));});
 await pipeline(fs.createReadStream(decoded),gunzip,fs.createWriteStream(raw,{flags:'wx',mode:0o600}));
 const input=fs.openSync(raw,'r');let offset=4;let manifest:BackupManifest;try{const length=Buffer.alloc(4);if(fs.readSync(input,length,0,4,0)!==4)throw new Error('Manifesto incompleto.');const n=length.readUInt32BE();if(n<2||n>16*1024*1024)throw new Error('Manifesto inválido.');const json=Buffer.alloc(n);if(fs.readSync(input,json,0,n,offset)!==n)throw new Error('Manifesto incompleto.');offset+=n;manifest=JSON.parse(json.toString('utf8'));if(manifest.version!==2||manifest.schemaVersion!==1||!Array.isArray(manifest.files)||manifest.files.length>200000)throw new Error('Versão ou estrutura incompatível.');
 const names=new Set<string>(),buffer=Buffer.alloc(1024*1024);for(const file of manifest.files){if(typeof file.path!=='string'||file.path.includes('\\')||!/^((data|application)\/)/.test(file.path)||file.path.split('/').some(s=>!s||s==='.'||s==='..'||s.includes(':'))||names.has(file.path)||!Number.isSafeInteger(file.size)||file.size<0||!/^([a-f0-9]{64})$/.test(file.checksum))throw new Error('Arquivo inválido no backup.');names.add(file.path);const out=inside(destination,path.join(destination,file.path));privateDir(path.dirname(out));const output=fs.openSync(out,'wx',0o600);try{let left=file.size;while(left){const count=fs.readSync(input,buffer,0,Math.min(left,buffer.length),offset);if(!count)throw new Error('Conteúdo incompleto.');fs.writeSync(output,buffer,0,count);left-=count;offset+=count;}}finally{fs.closeSync(output);}if(hashFile(out)!==file.checksum)throw new Error('Checksum de arquivo divergente.');}
 if(offset!==fs.statSync(raw).size)throw new Error('Conteúdo excedente no backup.');}finally{fs.closeSync(input);}return manifest!;
 }catch(e){removeWork(workRoot,destination);throw e;}finally{for(const f of [decoded,raw])if(fs.existsSync(f))fs.rmSync(inside(workRoot,f),{force:true});}
}
