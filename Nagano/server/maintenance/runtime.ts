import fs from 'node:fs';
import path from 'node:path';
let busyCheck=()=>false;
export const isMaintenanceBusy=()=>busyCheck();
export const setMaintenanceBusyCheck=(check:()=>boolean)=>{busyCheck=check;};
export function legacyImportDisabled(dataDir=process.env.PRINTSHOP_DATA_DIR||path.resolve('data')){const file=path.join(dataDir,'runtime.json');return fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).legacyImportDisabled===true;}
