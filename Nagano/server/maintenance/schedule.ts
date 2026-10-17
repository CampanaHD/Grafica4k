const parts=(date:Date)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
export function nextBackupDate(after:number,day=0,hour=3,minute=0){
 const p=parts(new Date(after)),base=Date.UTC(+p.year,+p.month-1,+p.day);for(let n=0;n<=8;n++){const local=new Date(base+n*86400000);if(local.getUTCDay()!==day)continue;const target=local.getTime()+hour*3600000+minute*60000;let utc=target;for(let i=0;i<3;i++){const v=parts(new Date(utc)),asUTC=Date.UTC(+v.year,+v.month-1,+v.day,+v.hour,+v.minute,+v.second);utc+=target-asUTC;}if(utc>after)return new Date(utc).toISOString();}throw new Error('Não foi possível calcular a agenda.');
}
export function retainedBackupIds(rows:any[],policy:{weekly:number;monthly:number;quarterly:number}){
 const valid=rows.filter(r=>r.status==='VALID').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),keep=new Set<string>();if(valid[0])keep.add(valid[0].id);
 for(const row of valid)if(row.reason!=='SCHEDULED')keep.add(row.id);
 for(const [kind,limit] of [['weekly',policy.weekly],['monthly',policy.monthly],['quarterly',policy.quarterly]] as const){const buckets=new Set<string>();for(const row of valid.filter(r=>r.reason==='SCHEDULED')){const p=parts(new Date(row.createdAt)),d=new Date(Date.UTC(+p.year,+p.month-1,+p.day));d.setUTCDate(d.getUTCDate()-d.getUTCDay());const key=kind==='weekly'?d.toISOString().slice(0,10):kind==='monthly'?`${p.year}-${p.month}`:`${p.year}-${Math.floor((+p.month-1)/3)}`;if(buckets.size<limit&&!buckets.has(key)){buckets.add(key);keep.add(row.id);}}}
 return keep;
}
