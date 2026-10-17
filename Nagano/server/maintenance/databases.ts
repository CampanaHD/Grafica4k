import {DatabaseSync} from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const required:Record<string,string[]>={'team.sqlite':['account','team_profiles','profile_secrets'],'operations.sqlite':['work_orders','erp_stock_items','erp_clients','erp_payments','erp_settings'],'quotations.sqlite':['quotations','quotation_approved_versions'],'materials.sqlite':['materials','metadata'],'visual-services.sqlite':['service_catalog'],'graphic-products.sqlite':['graphic_products'],'futura.sqlite':['futura_imports']};
export const identifier=(name:string)=>'"'+name.replace(/"/g,'""')+'"';
export function inspectDatabase(file:string){
 const db=new DatabaseSync(file,{readOnly:true});try{if(db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok')throw new Error('Banco com falha de integridade: '+path.basename(file));const tables:any={};
 for(const row of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){const name=String(row.name),hashes:string[]=[];for(const data of db.prepare('SELECT * FROM '+identifier(name)).iterate())hashes.push(crypto.createHash('sha256').update(JSON.stringify(data,(_k,v)=>typeof v==='bigint'?String(v):v)).digest('hex'));hashes.sort();tables[name]={count:hashes.length,checksum:crypto.createHash('sha256').update(hashes.join('')).digest('hex')};}
 for(const name of required[path.basename(file)]||[])if(!tables[name])throw new Error('Tabela crítica ausente: '+name);
 if(path.basename(file)==='team.sqlite'){if(tables.account?.count!==1||!db.prepare('SELECT payload FROM team_profiles').all().some(r=>{const p=JSON.parse(String(r.payload));return p.active&&p.role==='ADMIN';}))throw new Error('Backup sem conta administrativa ativa.');}
 return tables;}finally{db.close();}
}
export function inspectData(dir:string,complete=true){const result:any={};for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.sqlite')).sort())result[file]=inspectDatabase(path.join(dir,file));if(complete)for(const file of Object.keys(required))if(!result[file])throw new Error('Banco essencial ausente: '+file);return result;}
export function validateAttachmentReferences(dataDir:string){const file=path.join(dataDir,'operations.sqlite');if(!fs.existsSync(file))return;const db=new DatabaseSync(file,{readOnly:true});try{if(!db.prepare("SELECT name FROM sqlite_master WHERE name='erp_attachments'").get())return;for(const row of db.prepare('SELECT payload FROM erp_attachments').all()){const a=JSON.parse(String(row.payload));if(!/^[a-f0-9-]{36}$/i.test(a.id)||!['png','pdf'].includes(a.extension)||!fs.existsSync(path.join(dataDir,'erp-attachments',a.id+'.'+a.extension)))throw new Error('Anexo cadastrado não encontrado. Confira os arquivos antes da manutenção.');}}finally{db.close();}}
export function snapshotDatabase(source:string,target:string){const db=new DatabaseSync(source,{readOnly:true});try{db.exec("VACUUM INTO '"+target.replace(/'/g,"''")+"'");}finally{db.close();}return inspectDatabase(target);}
