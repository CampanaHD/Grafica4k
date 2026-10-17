import type {RequestHandler} from 'express';
export function securityHeaders(production=process.env.NODE_ENV==='production',origin=process.env.APP_PUBLIC_URL||''):RequestHandler{
  return(req,res,next)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('X-Frame-Options','DENY');
    const scripts=production?"'self' https://challenges.cloudflare.com":"'self' 'unsafe-inline' https://challenges.cloudflare.com";
    res.setHeader('Content-Security-Policy',`default-src 'self'; script-src ${scripts}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
    if(production){res.setHeader('Strict-Transport-Security','max-age=31536000');if(!req.secure){if(!origin.startsWith('https://')){res.status(503).send('Configure o endereço HTTPS do sistema.');return;}if(req.method!=='GET'&&req.method!=='HEAD'){res.status(403).json({success:false,error:'Use uma conexão HTTPS para continuar.'});return;}const target=new URL(origin);target.pathname=req.path;target.search=req.originalUrl.includes('?')?req.originalUrl.slice(req.originalUrl.indexOf('?')):'';res.redirect(308,target.href);return;}}
    next();
  };
}
