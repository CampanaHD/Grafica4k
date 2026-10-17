import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
import {createAuthSystem,hashPassword} from '../server/auth';
import {createTeamOperations} from '../server/teamOperations';
import {createQuotationsRouter} from '../server/quotationsApi';
import {validateImageData} from '../server/imageData';

function pngData(side=8){
  const crc=(bytes:Buffer)=>{let n=0xffffffff;for(const byte of bytes){n^=byte;for(let bit=0;bit<8;bit++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};
  const chunk=(type:string,data:Buffer)=>{const name=Buffer.from(type),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length,0);name.copy(result,4);data.copy(result,8);result.writeUInt32BE(crc(Buffer.concat([name,data])),data.length+8);return result;};
  const header=Buffer.alloc(13);header.writeUInt32BE(side,0);header.writeUInt32BE(side,4);header[8]=8;header[9]=6;
  const pixels=Buffer.alloc((side*4+1)*side);for(let y=0;y<side;y++)for(let x=0;x<side;x++){const at=y*(side*4+1)+1+x*4;pixels[at]=45;pixels[at+1]=85;pixels[at+2]=210;pixels[at+3]=255;}
  const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
  return 'data:image/png;base64,'+png.toString('base64');
}
test('profile and PIX image validation accepts bounded PNGs and rejects active or oversized uploads',()=>{
  const image=pngData();assert.equal(validateImageData(image,'avatar'),image);assert.equal(validateImageData(image,'pix'),image);assert.equal(validateImageData('','avatar'),undefined);
  assert.throws(()=>validateImageData('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=','avatar'));
  assert.throws(()=>validateImageData('https://outro-site.invalid/foto.png','avatar'));
  assert.throws(()=>validateImageData('data:image/png;base64,AAAA','pix'));
  assert.throws(()=>validateImageData(pngData(513),'avatar'));
  assert.throws(()=>validateImageData('data:image/png;base64,'+'A'.repeat(1400000),'pix'));
});
test('third-party totals use the latest approved services, persist PIX images and allow deactivation without losing history',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'nagano-partner-directory-')),initial={email:'qa@teste.local',...hashPassword('Teste-diretorio!')};
  const app=express();app.use(express.json({limit:'10mb'}));const auth=createAuthSystem(dir,initial);app.use(auth.router);app.use('/api',(req,res,next)=>auth.requireLogin(req,res,()=>auth.requireProfile(req,res,next)));
  let ops:ReturnType<typeof createTeamOperations>;
  const quotes=createQuotationsRouter(()=>undefined,dir,()=>undefined,undefined,{getThirdParty:id=>ops.getThirdParty(id),onSaved:(q,a)=>ops.quotationSaved(q,a)});
  ops=createTeamOperations(auth.activity,quotes.get,dir,quotes.getApproved);app.use(ops.router);app.use(quotes.router);
  const server=app.listen(0);await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}`;let cookie='';
  const call=async(url:string,method='GET',body?:unknown)=>{const response=await fetch(base+url,{method,headers:{Cookie:cookie,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie')!.split(';')[0];return{status:response.status,data:await response.json()};};
  const image=pngData(),partner=(id:string)=>({id,name:id==='a'?'Ana':'Bruno',services:['Adesivação','Remoção'],phone:'11999999999',pixKey:'PIX-INTERNO',pixHolder:'Prestador',pixQrCode:image,notes:'Observação',active:true,totalProvided:999999});
  const draft=(id:string,value:number,provider='a')=>({id,customerId:'cliente',customerName:'Cliente de teste',status:'ORCAMENTO',items:[],outsourcedServices:[{id:'servico',thirdPartyId:provider,services:['Adesivação'],value}]});
  const totals=async()=>Object.fromEntries((await call('/api/third-parties')).data.data.map((p:any)=>[p.id,p]));
  try{
    await call('/api/auth/login','POST',{email:initial.email,password:'Teste-diretorio!'});await call('/api/auth/profile','POST',{profileId:'administrator'});
    const photoProfile={id:'balcao',name:'Balcão',role:'SALES',color:'#3158ed',active:true,modules:['quotations'],avatar:image};
    let profile=(await call('/api/team/profiles/balcao','PUT',photoProfile)).data.data;assert.equal(profile.avatar,image);
    assert.equal((await call('/api/team/profiles/balcao','PUT',{...photoProfile,avatar:'data:image/svg+xml;base64,PHN2Zz4='})).status,400);
    const restartedAuth=createAuthSystem(dir,initial);assert.equal(restartedAuth.profiles().find(p=>p.id==='balcao')?.avatar,image);restartedAuth.close();
    for(const id of ['a','b'])assert.equal((await call('/api/third-parties/'+id,'PUT',partner(id))).status,200);
    assert.equal((await totals()).a.totalProvided,0);
    assert.equal((await call('/api/third-parties/a','PUT',{...(await totals()).a,pixQrCode:'data:image/png;base64,AAAA'})).status,400);
    let q=(await call('/api/quotations/q1','PUT',draft('q1',100))).data.data;assert.equal((await totals()).a.totalProvided,0);
    q=(await call('/api/quotations/q1/approve','POST',{revision:q.revision,workOrderId:'os1'})).data.data;
    let a=(await totals()).a;assert.equal(a.totalProvided,100);assert.equal(a.approvedQuotationCount,1);assert.equal(a.pixQrCode,image);
    let order=(await call('/api/work-orders/os1','PUT',{quotationId:q.id,productionStatus:'PRODUCAO_ARTES',amountPaid:0,serviceName:'Adesivação'})).data.data;
    q=(await call('/api/quotations/q1/reopen','POST',{revision:q.revision,reason:'Alterar serviço'})).data.data;
    q=(await call('/api/quotations/q1','PUT',{...q,outsourcedServices:[{...q.outsourcedServices[0],value:200}]})).data.data;
    assert.equal((await totals()).a.totalProvided,100);
    q=(await call('/api/quotations/q1/approve','POST',{revision:q.revision})).data.data;assert.equal((await totals()).a.totalProvided,200);
    let q2=(await call('/api/quotations/q2','PUT',draft('q2',300))).data.data;
    q2=(await call('/api/quotations/q2/approve','POST',{revision:q2.revision})).data.data;assert.equal((await totals()).a.totalProvided,500);assert.equal((await totals()).a.approvedQuotationCount,2);
    q2=(await call('/api/quotations/q2/reopen','POST',{revision:q2.revision,reason:'Outro prestador'})).data.data;
    q2=(await call('/api/quotations/q2','PUT',{...q2,outsourcedServices:[{...q2.outsourcedServices[0],thirdPartyId:'b',value:400}]})).data.data;
    assert.equal((await totals()).a.totalProvided,500);assert.equal((await totals()).b.totalProvided,0);
    q2=(await call('/api/quotations/q2/approve','POST',{revision:q2.revision})).data.data;assert.equal((await totals()).a.totalProvided,200);assert.equal((await totals()).b.totalProvided,400);
    const history=(await call('/api/third-parties/a/history')).data.data;assert.equal(history.length,4);assert.equal(history.filter((entry:any)=>entry.includedInTotal).length,1);
    a=(await totals()).a;await call('/api/third-parties/a','PUT',{...a,active:false});a=(await totals()).a;assert.equal(a.active,false);assert.equal(a.totalProvided,200);assert.equal((await call('/api/third-parties/a/history')).data.data.length,4);
    assert.equal((await call('/api/quotations/invalid','PUT',draft('invalid',10))).status,400);
    await call('/api/third-parties/a','PUT',{...a,active:true});assert.equal((await totals()).a.active,true);
    order=(await call('/api/work-orders')).data.data.find((o:any)=>o.id==='os1');
    assert.equal((await call('/api/work-orders/os1','PUT',{...order,productionStatus:'CANCELADO'})).status,200);assert.equal((await totals()).a.totalProvided,0);
    await call('/api/auth/profile','POST',{profileId:'balcao'});
    const minimal=(await call('/api/third-parties')).data.data[0];assert.equal(minimal.pixQrCode,undefined);assert.equal(minimal.pixKey,undefined);assert.equal(minimal.totalProvided,undefined);assert.equal((await call('/api/third-parties/b/history')).status,403);
    await call('/api/auth/profile','POST',{profileId:'administrator'});
    await call('/api/team/profiles/balcao','PUT',{...photoProfile,avatar:''});assert.equal((await call('/api/team/profiles')).data.data.find((p:any)=>p.id==='balcao').avatar,undefined);
    const b=(await totals()).b;await call('/api/third-parties/b','PUT',{...b,pixQrCode:''});assert.equal((await totals()).b.pixQrCode,undefined);
  }finally{await new Promise<void>(r=>server.close(()=>r()));quotes.close();ops.close();auth.close();const target=path.resolve(dir);assert.ok(target.startsWith(path.resolve(tmpdir())+path.sep));rmSync(target,{recursive:true,force:true});}
});

