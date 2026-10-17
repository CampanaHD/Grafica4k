import nodemailer from 'nodemailer';
import type {SecurityConfig} from './config';
export interface SecurityMail {to:string;subject:string;text:string}
export type MailSender=(message:SecurityMail)=>Promise<void>;
export function smtpSender(config:SecurityConfig):MailSender{
  const transport=nodemailer.createTransport({host:config.smtpHost,port:config.smtpPort,secure:config.smtpPort===465,requireTLS:true,auth:{user:config.smtpUser,pass:config.smtpPassword},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false});
  return async message=>{if(!config.smtpUser||!config.smtpPassword)throw new Error('MAIL_NOT_CONFIGURED');await transport.sendMail({...message,from:{name:'Nagano Comunicação Visual',address:config.mailFrom}});};
}
export function securityMessage(subject:string,body:string){return {subject:`Nagano — ${subject}`,text:`Nagano Comunicação Visual\n\n${body}\n\nSe você não solicitou esta ação, revise a segurança da sua conta. Nunca compartilhe senhas ou códigos.\nEsta é uma mensagem automática de segurança.`};}
