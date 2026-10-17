import path from 'node:path';
export function validateEnvironment(env=process.env){
 const mode=env.APP_ENV||(env.NODE_ENV==='production'?'production':'development');if(!['development','staging','production'].includes(mode))throw new Error('APP_ENV inválido. Use development, staging ou production.');
 if(['staging','production'].includes(mode)){if(env.NODE_ENV!=='production')throw new Error('Homologação e produção exigem NODE_ENV=production.');for(const name of ['PRINTSHOP_DATA_DIR','BACKUP_DIR'])if(!env[name]||!path.isAbsolute(env[name]!))throw new Error('Configure '+name+' como caminho absoluto em armazenamento persistente.');if(!env.BACKUP_KEY_FILE&&!env.BACKUP_ENCRYPTION_KEY)throw new Error('Configure a chave persistente dos backups antes da publicação.');}
 if(mode!=='development'&&env.DATABASE_URL&&!env.DATABASE_URL.startsWith('sqlite:'))throw new Error('Esta versão utiliza SQLite centralizado em PRINTSHOP_DATA_DIR. Não configure uma URL PostgreSQL sem uma migração específica.');return {mode,database:'sqlite',centralized:true};
}
