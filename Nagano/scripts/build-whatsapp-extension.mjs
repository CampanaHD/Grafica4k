import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
await build({entryPoints:[fileURLToPath(new URL('browser-extension/nagano-whatsapp/whatsappContentSource.js',root))],outfile:fileURLToPath(new URL('browser-extension/nagano-whatsapp/whatsappContent.js',root)),bundle:true,format:'iife',target:'chrome110',legalComments:'none'});
