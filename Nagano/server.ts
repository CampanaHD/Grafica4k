import {validateEnvironment} from './server/environment';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createMaintenance} from './server/maintenance/manager';
import {applyPendingOperation} from './server/maintenance/offline';
async function main(){
 validateEnvironment();
 if(process.env.NAGANO_WORKER==='1'){
  const maintenance=createMaintenance();
  await applyPendingOperation(maintenance);
  await maintenance.ensureStartupBackup();
  const {startServer}=await import('./server/application');
  await startServer(maintenance);return;
 }
 const lock=path.join(path.dirname(path.resolve(process.env.PRINTSHOP_DATA_DIR||'data')),'.nagano-process.lock');
 if(fs.existsSync(lock)){let alive=false;try{const pid=Number(fs.readFileSync(lock,'utf8'));process.kill(pid,0);alive=true;}catch{}if(alive)throw new Error('O Nagano já está em execução. Abra o endereço do sistema.');fs.unlinkSync(lock);}
 fs.mkdirSync(path.dirname(lock),{recursive:true});fs.writeFileSync(lock,String(process.pid),{flag:'wx',mode:0o600});
 let child:ReturnType<typeof spawn>,stopping=false;
 const release=()=>{try{if(fs.readFileSync(lock,'utf8')===String(process.pid))fs.unlinkSync(lock);}catch{}};
 const launch=()=>{child=spawn(process.execPath,[...process.execArgv,process.argv[1]],{cwd:process.cwd(),env:{...process.env,NAGANO_WORKER:'1'},stdio:['inherit','inherit','inherit','ipc'],windowsHide:true});child.on('exit',(code)=>{if(code===77&&!stopping){launch();return;}release();process.exitCode=code||0;});};
 for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{stopping=true;child?.kill(signal);});process.on('exit',release);launch();
}
main().catch(()=>{console.error('Não foi possível iniciar o Nagano. Verifique o relatório de manutenção, a configuração e os logs privados.');process.exitCode=1;});
