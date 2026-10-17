import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {createMaintenance} from '../server/maintenance/manager';
import {applyPendingOperation} from '../server/maintenance/offline';
import {inspectData} from '../server/maintenance/databases';
import {removeWork} from '../server/maintenance/files';
const [command,id,phrase,backupConfirmation]=process.argv.slice(2);
async function main(){const m=createMaintenance();try{
 const lock=path.join(path.dirname(m.dataDir),'.nagano-process.lock');if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock,'utf8'));let alive=false;try{process.kill(pid,0);alive=true;}catch{}if(alive)throw new Error('Pare o serviço Nagano antes de usar a manutenção offline.');}
 const actor={profileId:'offline-administrator',name:'Administrador local',at:new Date().toISOString()};
 if(command==='backup'){console.log(JSON.stringify(await m.createBackup('MANUAL_OFFLINE',actor)));return;}
 if(command==='test'){console.log(JSON.stringify(await m.validate(id,actor)));return;}
 if(command==='import'){console.log(JSON.stringify(await m.importBackup(path.resolve(id),actor)));return;}
 if(command==='inspect'){console.log(JSON.stringify({databases:inspectData(m.dataDir),backups:m.publicState(),keyFile:process.env.BACKUP_ENCRYPTION_KEY?'Variável de ambiente':m.keyFile}));return;}
 if(command==='extract'){const stage=await m.stageRestore(id);const output=path.resolve(phrase||'');if(!phrase||fs.existsSync(output))throw new Error('Informe um diretório novo para extrair o backup.');fs.cpSync(stage.target,output,{recursive:true,errorOnExist:true,force:false});removeWork(m.workDir,stage.target);console.log(JSON.stringify({extracted:true,destination:output}));return;}
 if(command==='restore'||command==='reset'){
 const expected=command==='reset'?'RESETAR BASE':'RESTAURAR BACKUP';if(phrase!==expected||backupConfirmation!==id)throw new Error('Confirme a frase e repita o identificador de backup validado.');await m.validate(id,actor);const safety=await m.createBackup(command==='reset'?'PRE_RESET':'PRE_RESTORE',actor);m.queue({kind:command==='reset'?'RESET':'RESTORE',safetyBackupId:safety.id,restoreBackupId:command==='restore'?id:undefined,actor});await applyPendingOperation(m);console.log(JSON.stringify({success:true,operation:command,safetyBackupId:safety.id}));return;
 }
 throw new Error('Comandos: backup | test <id> | import <arquivo.ngb> | inspect | extract <id> <pasta-nova> | restore <id> "RESTAURAR BACKUP" <id> | reset <id> "RESETAR BASE" <id>.');
 }finally{m.close();}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
