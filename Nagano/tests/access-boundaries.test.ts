import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {protectServerFiles,serveClientFiles} from '../server/clientFiles';

test('browser file routes do not expose the backend bundle, source maps, credentials or databases',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'nagano-static-test-'));mkdirSync(path.join(dir,'assets'));writeFileSync(path.join(dir,'assets/app.js'),'console.log("client")');writeFileSync(path.join(dir,'index.html'),'<!doctype html><title>Cliente Nagano</title>');writeFileSync(path.join(dir,'server.cjs'),'INTERNAL_SECRET_TEST');
  const app=express();app.use(protectServerFiles);serveClientFiles(app,dir);const server=app.listen(0);await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address() as any).port}`;
  try{
    for(const url of ['/server.cjs','/%73erver.cjs','/server.cjs.map','/server/bootstrapCredentials.ts','/@fs/any/server/bootstrapCredentials.ts','/data/team.sqlite','/team.sqlite-wal']){const response=await fetch(base+url);assert.equal(response.status,404,url);assert.doesNotMatch(await response.text(),/INTERNAL_SECRET_TEST/);}
    assert.equal((await fetch(base+'/assets/app.js')).status,200);assert.match(await(await fetch(base+'/settings')).text(),/Cliente Nagano/);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(tmpdir())+path.sep));rmSync(resolved,{recursive:true,force:true});}
});
