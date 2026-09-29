import path from 'node:path';
export const JOURNAL_REPLACE_BUSY='JOURNAL_REPLACE_BUSY';
export function journalReplaceFailure(j,journal){
 if(j?.failureCode!==undefined)return j.failureCode===JOURNAL_REPLACE_BUSY&&j.failure===JOURNAL_REPLACE_BUSY;
 if(typeof j?.failure!=='string'||typeof journal!=='string')return false;
 const m=/^(EPERM|EBUSY): (?:operation not permitted|resource busy or locked), rename '([^'\r\n]+)' -> '([^'\r\n]+)'$/.exec(j.failure);
 if(!m)return false;
 const target=path.win32.resolve(journal);
 if(path.win32.basename(target).toLowerCase()!=='lifecycle.json'||!path.win32.isAbsolute(m[2])||!path.win32.isAbsolute(m[3]))return false;
 if(m[3].toLowerCase()!==target.toLowerCase())return false;
 const prefix=target+'.';
 return m[2].slice(0,prefix.length).toLowerCase()===prefix.toLowerCase()&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/i.test(m[2].slice(prefix.length));
}
