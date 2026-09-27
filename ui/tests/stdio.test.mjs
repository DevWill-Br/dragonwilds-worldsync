import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {repoRoot} from '../../src/lifecycle/files.mjs';
for(const transport of ['node','powershell']) test(transport+' forwards sequential interactive commands and JSON responses',async()=>{
 const root=path.join(repoRoot,'tests/.scratch/ui','stdio-'+randomUUID());await mkdir(root,{recursive:true});
 const cli=path.join(root,'fixture.mjs');const host=path.join(root,'host.mjs');const ps=path.join(root,'host.ps1');
 await writeFile(cli,`import {createInterface} from 'node:readline';console.log('Isolated real Sandbox supervisor. Commands: fixture');for await(const line of createInterface({input:process.stdin})){if(line==='exit')break;console.log(JSON.stringify({received:line}));}`);
 await writeFile(host,`import {spawn} from 'node:child_process';import {once} from 'node:events';const c=spawn(process.execPath,[${JSON.stringify(cli)}],{windowsHide:true,stdio:'inherit'});await once(c,'exit');`);
 await writeFile(ps,`& node '${host.replaceAll("'","''")}'\nexit $LASTEXITCODE`);
 const p=spawn(transport==='node'?process.execPath:'powershell.exe',transport==='node'?[host]:['-NoProfile','-ExecutionPolicy','Bypass','-File',ps],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 p.stderr.on('data',()=>{});
 let completed=false;
 const result=new Promise((resolve,reject)=>{
  p.once('error',reject);
  const lines=[];const commands=['assume','start-server','stop-server','publish'];createInterface({input:p.stdout}).on('line',line=>{if(line.includes('supervisor. Commands:'))p.stdin.write(commands[0]+'\n');else{try{lines.push(JSON.parse(line).received);if(lines.length<commands.length)p.stdin.write(commands[lines.length]+'\n');else p.stdin.end('exit\n');}catch{}}});
  p.once('exit',code=>{completed=true;code===0?resolve(lines):reject(Error('FIXTURE_FAILED: '+JSON.stringify(lines)));});
 });
 const timer=setTimeout(()=>{if(!completed)p.kill();},15000); // only this synthetic fixture
 try{assert.deepEqual(await result,['assume','start-server','stop-server','publish']);}finally{clearTimeout(timer);}
});
