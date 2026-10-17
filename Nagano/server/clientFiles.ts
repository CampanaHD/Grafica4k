import express,{type Express,type RequestHandler} from 'express';
import path from 'node:path';

/** Backend bundles, credentials and databases must never be served as browser files. */
export const protectServerFiles:RequestHandler=(req,res,next)=>{
  let name:string;
  try{name=decodeURIComponent(req.path).replace(/\\/g,'/');}catch{res.sendStatus(400);return;}
  if(/(^|\/)server(?:\/|\.ts$|\.cjs(?:\.map)?$)/i.test(name)||/bootstrapCredentials|(^|\/)(?:data|data-backups|backups[^/]*|work|tests|scripts|deploy)\/|(^|\/)\.(?!vite\/)|\.(?:sqlite|db)(?:-(?:wal|shm))?$|\.(?:map|ngb|cjs|key|pem)$/i.test(name)){res.sendStatus(404);return;}
  next();
};
export function serveClientFiles(app:Express,root:string){
  for(const folder of ['assets','brand','extensions','quotation'])app.use(`/${folder}`,express.static(path.join(root,folder),{dotfiles:'deny'}));
  app.get('*',(_req,res)=>res.sendFile(path.join(root,'index.html')));
}
