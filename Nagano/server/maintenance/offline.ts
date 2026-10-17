import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {type Maintenance} from './manager';
import {identifier,inspectData,validateAttachmentReferences} from './databases';
import {inside,privateDir,walk,copyFile,atomicJson,readJson,removeWork} from './files';
export function resetStagedData(dataDir:string,actor:any){
 const before=inspectData(dataDir),coordinator=path.join(dataDir,'.reset-transaction.sqlite'),db=new DatabaseSync(coordinator);db.exec('PRAGMA journal_mode=DELETE;PRAGMA synchronous=FULL;');
 const files=Object.keys(before).sort(),aliases=new Map<string,string>();
 try{files.forEach((file,n)=>{const name='db'+n;db.prepare('ATTACH DATABASE ? AS '+name).run(path.join(dataDir,file));db.exec(`PRAGMA ${name}.journal_mode=DELETE;PRAGMA ${name}.synchronous=FULL;`);aliases.set(file,name);});
 db.exec('BEGIN IMMEDIATE');try{for(const file of files){const schema=aliases.get(file)!;for(const table of Object.keys(before[file])){
 const target=schema+'.'+identifier(table);
 if(file==='team.sqlite'){if(['team_sessions','security_sessions','security_tokens','security_challenges','team_activity'].includes(table))db.exec('DELETE FROM '+target);continue;}
 if(file==='operations.sqlite'&&table==='erp_migrations')continue;
 if(file==='operations.sqlite'&&table==='erp_settings'){db.exec(`DELETE FROM ${target} WHERE id NOT IN ('company','budget','notion','whatsapp','messages')`);db.prepare(`INSERT OR REPLACE INTO ${target}(id,payload,revision) VALUES('finishes',?,1)`).run(JSON.stringify({id:'finishes',value:[]}));continue;}
 if(file==='materials.sqlite'&&table==='metadata'){db.prepare(`INSERT OR REPLACE INTO ${target}(key,value) VALUES('initialized','1')`).run();continue;}
 if(file==='visual-services.sqlite'&&table==='service_catalog'){db.exec('DELETE FROM '+target);db.prepare(`INSERT INTO ${target}(id,payload) VALUES(1,'[]')`).run();continue;}
 if(file==='quotations.sqlite'&&table==='quotation_retention')continue;
 db.exec('DELETE FROM '+target);
 }}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 }finally{db.close();for(const suffix of ['', '-journal'])if(fs.existsSync(coordinator+suffix))fs.unlinkSync(coordinator+suffix);}
 // Keep configuration files by explicit name. Operational files remain in the safety backup/recovery directory.
 const preserve=new Set(['whatsapp-config.json','whatsapp_config.json','notion-config.json','notion_config.json','security-config.json','runtime.json']);
 for(const file of walk(dataDir)){const rel=path.relative(dataDir,file).replace(/\\/g,'/');if(file.endsWith('.sqlite')||preserve.has(rel))continue;fs.unlinkSync(inside(dataDir,file));}
 const runtime=readJson(path.join(dataDir,'runtime.json'),{});atomicJson(path.join(dataDir,'runtime.json'),{...runtime,dataEpoch:crypto.randomUUID(),resetAt:new Date().toISOString(),legacyImportDisabled:true});
 const after=inspectData(dataDir);
 for(const table of ['account','team_profiles','profile_secrets','account_security','security_profile_email'])if(JSON.stringify(before['team.sqlite']?.[table])!==JSON.stringify(after['team.sqlite']?.[table]))throw new Error('O reset alteraria usuários ou configurações de segurança.');
 for(const [file,tables] of Object.entries(after))for(const [table,info] of Object.entries(tables as any) as any){if(file==='team.sqlite'||file==='materials.sqlite'&&table==='metadata'||file==='visual-services.sqlite'&&table==='service_catalog'||file==='operations.sqlite'&&['erp_settings','erp_migrations'].includes(table)||file==='quotations.sqlite'&&table==='quotation_retention')continue;if(info.count)throw new Error('Restaram dados operacionais: '+table);}
 return {before,after,actor};
}
function revokeRestoredSessions(dataDir:string){const file=path.join(dataDir,'team.sqlite'),db=new DatabaseSync(file);try{db.exec('BEGIN IMMEDIATE');for(const table of ['team_sessions','security_sessions','security_tokens','security_challenges'])if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))db.exec('DELETE FROM '+identifier(table));db.exec('COMMIT');}finally{db.close();}}
export async function applyPendingOperation(m:Maintenance){
 const journalFile=path.join(m.backupDir,'swap-journal.json'),existing=readJson(journalFile,null);
 const recover=(journal:any)=>{for(const file of [journal.oldDir,journal.newDir])inside(path.dirname(m.dataDir),file);if(journal.phase==='COMMITTED'){if(fs.existsSync(m.intentFile))fs.unlinkSync(m.intentFile);return;}if(fs.existsSync(journal.oldDir)){if(fs.existsSync(m.dataDir)){const failed=journal.newDir+'-failed-'+crypto.randomUUID();fs.renameSync(m.dataDir,failed);}fs.renameSync(journal.oldDir,m.dataDir);}if(journal.oldEnv&&fs.existsSync(journal.oldEnv))copyFile(journal.oldEnv,path.join(m.root,'.env'));};
 if(existing){recover(existing);fs.renameSync(journalFile,journalFile+'.recovered-'+Date.now());m.event('MAINTENANCE_RECOVERY',{}, {result:existing.phase==='COMMITTED'?'COMMITTED':'ROLLED_BACK'});if(existing.phase==='COMMITTED')return;}
 if(!fs.existsSync(m.intentFile))return;
 const signed=readJson(m.intentFile,null),expected=crypto.createHmac('sha256',m.key).update(signed.serialized||'').digest('hex');if(typeof signed.signature!=='string'||!/^[a-f0-9]{64}$/.test(signed.signature)||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signed.signature.padEnd(expected.length).slice(0,expected.length))))throw new Error('Assinatura da manutenção inválida.');const intent=JSON.parse(signed.serialized);if(!['RESET','RESTORE'].includes(intent.kind))throw new Error('Operação de manutenção inválida.');
 const recovered=await m.stageRestore(intent.kind==='RESET'?intent.safetyBackupId:intent.restoreBackupId),parent=path.dirname(m.dataDir),tag=crypto.randomUUID(),newDir=path.join(parent,'.nagano-stage-'+tag),oldDir=path.join(parent,'.nagano-recovery',tag,'data');privateDir(newDir);privateDir(path.dirname(oldDir));
 const journal:any={kind:intent.kind,oldDir,newDir,phase:'PREPARED',safetyBackupId:intent.safetyBackupId};
 try{for(const file of walk(path.join(recovered.target,'data')))copyFile(file,path.join(newDir,path.relative(path.join(recovered.target,'data'),file)));
 const summary=intent.kind==='RESET'?resetStagedData(newDir,intent.actor):undefined;if(intent.kind==='RESTORE'){revokeRestoredSessions(newDir);atomicJson(path.join(newDir,'runtime.json'),{...readJson(path.join(newDir,'runtime.json'),{}),dataEpoch:crypto.randomUUID(),restoredAt:new Date().toISOString(),legacyImportDisabled:true});}
 inspectData(newDir);validateAttachmentReferences(newDir);
 if(intent.kind==='RESTORE'&&fs.existsSync(path.join(recovered.target,'application','.env'))){const oldEnv=path.join(parent,'.nagano-recovery',tag,'env.private');if(fs.existsSync(path.join(m.root,'.env')))copyFile(path.join(m.root,'.env'),oldEnv);journal.oldEnv=oldEnv;}
 atomicJson(journalFile,journal);fs.renameSync(m.dataDir,oldDir);journal.phase='OLD_MOVED';atomicJson(journalFile,journal);fs.renameSync(newDir,m.dataDir);journal.phase='NEW_ACTIVE';atomicJson(journalFile,journal);
 // Deployment paths, domain, proxy and backup key remain those of this server. Secrets are recoverable in the encrypted archive.
 inspectData(m.dataDir);validateAttachmentReferences(m.dataDir);m.event(intent.kind+'_COMPLETED',intent.actor,{backupId:intent.safetyBackupId,counts:summary?{before:summary.before,after:summary.after}:undefined});journal.phase='COMMITTED';atomicJson(journalFile,journal);fs.unlinkSync(m.intentFile);fs.renameSync(journalFile,journalFile+'.completed-'+Date.now());
 }catch(e){if(fs.existsSync(journalFile))recover(journal);if(fs.existsSync(m.intentFile))fs.renameSync(m.intentFile,m.intentFile+'.failed-'+Date.now());m.event('MAINTENANCE_FAILED',intent.actor,{operation:intent.kind,result:'ROLLED_BACK'});throw e;}
 finally{if(fs.existsSync(recovered.target))removeWork(m.workDir,recovered.target);}
}
