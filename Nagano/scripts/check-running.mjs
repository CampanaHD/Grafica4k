import 'dotenv/config';
import {spawn} from 'node:child_process';

// Exit codes are consumed by INICIAR.cmd: 0=reuse, 1=start, 2=occupied/error.
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535){
  console.error('A porta configurada no arquivo .env nao e valida.');process.exitCode=2;
}else{
  const url=`http://localhost:${port}`;
  let state='occupied';
  try{
    const response=await fetch(`${url}/api/health`,{signal:AbortSignal.timeout(2500),redirect:'manual'});
    const data=response.ok?await response.json():null;
    if(data?.status==='ok'&&data?.system==='Print Shop Management System - Brazilian Print Shop')state='running';
  }catch(error){
    const causes=[error?.code,error?.cause?.code,...(error?.cause?.errors||[]).map(item=>item.code)];
    if(causes.includes('ECONNREFUSED'))state='closed';
  }
  if(state==='running'){
    console.log(`O sistema Nagano ja esta aberto. Acesse ${url}`);
    if(!process.argv.includes('--check-only')){
      // URL is constructed only from a validated numeric local port, never shell input.
      try{
        const command=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open';
        const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];
        const opener=spawn(command,args,{detached:true,stdio:'ignore',windowsHide:true});
        opener.once('error',()=>console.log(`Abra ${url} no seu navegador.`));opener.unref();
      }catch{console.log(`Abra ${url} no seu navegador.`);}
    }
    process.exitCode=0;
  }else if(state==='closed'){
    console.log(`Iniciando Nagano. Abra ${url} no navegador.`);process.exitCode=1;
  }else{
    console.error(`A porta ${port} esta ocupada ou o programa ainda esta carregando. Aguarde e tente novamente. Nenhum programa foi encerrado.`);process.exitCode=2;
  }
}
