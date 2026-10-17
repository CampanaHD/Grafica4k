export interface SecurityConfig {enabled:boolean;production:boolean;origin:string;smtpHost:string;smtpPort:number;smtpUser:string;smtpPassword:string;mailFrom:string;siteKey:string;captchaSecret:string;captchaHostnames:string[]}
export function securityConfig(env=process.env):SecurityConfig{
  const production=env.NODE_ENV==='production',enabled=env.SECURITY_EMAIL_REQUIRED==='true';
  const raw=env.APP_PUBLIC_URL||'',url=raw?new URL(raw):undefined;
  if(url&&(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!['https:','http:'].includes(url.protocol)))throw new Error('APP_PUBLIC_URL deve conter apenas a origem do sistema.');
  if(url?.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('O endereço público deve utilizar HTTPS.');
  const config={enabled,production,origin:url?.origin||'',smtpHost:env.SMTP_HOST||'smtp.gmail.com',smtpPort:Number(env.SMTP_PORT||465),smtpUser:env.SMTP_USER||'',smtpPassword:env.SMTP_PASSWORD||'',mailFrom:env.SMTP_FROM||env.SMTP_USER||'',siteKey:env.TURNSTILE_SITE_KEY||'',captchaSecret:env.TURNSTILE_SECRET_KEY||'',captchaHostnames:(env.TURNSTILE_HOSTNAMES||url?.hostname||'').split(',').map(x=>x.trim()).filter(Boolean)};
  if(![465,587].includes(config.smtpPort))throw new Error('SMTP_PORT deve ser 465 ou 587 com TLS.');
  if(enabled&&(!config.origin||!config.smtpUser||!config.smtpPassword||!config.mailFrom))throw new Error('Configure APP_PUBLIC_URL e SMTP antes de ativar SECURITY_EMAIL_REQUIRED.');
  if(!!config.siteKey!==!!config.captchaSecret)throw new Error('Configure as duas chaves do Turnstile.');
  if(config.siteKey&&!config.captchaHostnames.length)throw new Error('Configure os domínios permitidos do Turnstile.');
  if(production&&(!enabled||!config.origin.startsWith('https://')||!config.siteKey))throw new Error('Produção exige HTTPS, confirmação por e-mail e Turnstile configurados. Consulte LEIA-ME-SEGURANCA.md.');
  if(production&&/^[123]x0{10}/.test(config.siteKey))throw new Error('Use chaves reais do Turnstile em produção.');
  return config;
}
