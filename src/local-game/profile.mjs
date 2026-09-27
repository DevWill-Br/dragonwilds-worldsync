import {userDataPaths} from '../user-data/paths.mjs';
import path from 'node:path';
import os from 'node:os';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {cloudOrigin} from '../lifecycle/cloud.mjs';
import {repoRoot,noLinks,atomicJson} from '../lifecycle/files.mjs';
import {GameIO} from './host.mjs';
export const profileDirectory=userDataPaths().profiles;
export const endpoint='https://dragonwilds-worldsync-api.contactforwillbr.workers.dev';
export function validateProfile(p){
 if(!p||p.mode!=='local-game'||!/^[a-z0-9-]{1,40}$/.test(p.profile??'')||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(p.worldId??'')||p.worldId==='worldsynctest')throw new Error('INVALID_LOCAL_GAME_PROFILE');
 if(Object.keys(p).some(k=>/token|password|ownerid|secret/i.test(k)))throw new Error('SECRET_IN_PROFILE_REJECTED');
 if(typeof p.displayName!=='string'||!p.displayName.trim()||p.displayName.length>80)throw new Error('INVALID_DISPLAY_NAME');
 if(!path.isAbsolute(p.saveRoot??'')||path.basename(p.fileName??'')!==p.fileName||!/^.+\.sav$/i.test(p.fileName)||/[<>:"/\\|?*\x00-\x1f]/.test(p.fileName))throw new Error('INVALID_SAVE_PATH');
 if(!/^[a-f0-9-]{36}$/.test(p.machineId??'')||typeof p.autoLaunch!=='boolean')throw new Error('INVALID_LOCAL_GAME_PROFILE');
 cloudOrigin(p.cloudUrl);return p;
}
export async function profiles(){const valid=[];for(const n of await readdir(profileDirectory).catch(()=>[])){if(!/^[a-z0-9-]{1,40}\.local\.json$/.test(n))continue;const name=n.replace('.local.json','');try{await loadProfile(name);valid.push(name);}catch{}}return valid;}
export async function loadProfile(name){if(!/^[a-z0-9-]{1,40}$/.test(name??''))throw new Error('INVALID_LOCAL_GAME_PROFILE');const file=path.join(profileDirectory,name+'.local.json');await noLinks(file);const p=validateProfile(JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,'')));if(p.profile!==name)throw Error('INVALID_LOCAL_GAME_PROFILE');return p;}
export async function setupProfile(values,{io=new GameIO()}={}){
 const discovery=await io.call('Discover');
 const p=validateProfile({mode:'local-game',profile:values.profile,worldId:values.worldId,displayName:values.displayName,saveRoot:discovery.root,fileName:values.fileName,autoLaunch:values.autoLaunch!==false,host:os.hostname(),machineId:randomUUID(),cloudUrl:endpoint});
 await io.assertStopped();await noLinks(profileDirectory);await mkdir(profileDirectory,{recursive:true});
 await writeFile(path.join(profileDirectory,p.profile+'.local.json'),JSON.stringify(p,null,2),{flag:'wx'});return p;
}
export async function saveOptions(name,autoLaunch){const p=await loadProfile(name);if(typeof autoLaunch!=='boolean')throw new Error('INVALID_OPTIONS');p.autoLaunch=autoLaunch;await atomicJson(path.join(profileDirectory,name+'.local.json'),p);return p;}
