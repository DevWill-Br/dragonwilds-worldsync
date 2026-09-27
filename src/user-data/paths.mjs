import path from 'node:path';
import {readFileSync} from 'node:fs';
const layout=JSON.parse(readFileSync(new URL('./layout.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
export function userDataPaths(localAppData=process.env.LOCALAPPDATA){
 if(!localAppData||!path.isAbsolute(localAppData))throw Error('USER_DATA_UNAVAILABLE');
 const root=path.join(localAppData,layout.folder);
 return {root,...Object.fromEntries(['profiles','state','preferences','backups'].map(k=>[k,path.join(root,layout[k])]))};
}
export const inside=(file,root)=>{const relative=path.relative(root,file);return relative===''||(!relative.startsWith('..')&&!path.isAbsolute(relative));};
