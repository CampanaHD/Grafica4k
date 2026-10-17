import React,{useEffect,useRef,useState} from 'react';
import {ImagePlus,Trash2} from 'lucide-react';
async function prepareImage(file:File,kind:'avatar'|'pix'){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Selecione uma imagem PNG, JPG ou WebP.');
  if(file.size>5*1024*1024)throw new Error('Escolha uma imagem de até 5 MB.');
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=url;await image.decode();
    if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>24000000)throw new Error('A imagem é muito grande. Escolha uma versão menor.');
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');if(!context)throw new Error('Não foi possível preparar a imagem.');
    let longest=kind==='avatar'?256:Math.min(1024,Math.max(image.naturalWidth,image.naturalHeight));
    for(let attempt=0;attempt<6;attempt++){
      const ratio=longest/Math.max(image.naturalWidth,image.naturalHeight);
      canvas.width=kind==='avatar'?longest:Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=kind==='avatar'?longest:Math.max(1,Math.round(image.naturalHeight*ratio));
      context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);
      if(kind==='avatar'){const side=Math.min(image.naturalWidth,image.naturalHeight);context.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,canvas.width,canvas.height);}
      else context.drawImage(image,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/png'),size=(data.length-'data:image/png;base64,'.length)*3/4;
      if(size<=(kind==='avatar'?300000:1000000))return data;
      longest=Math.floor(longest*.8);
    }
    throw new Error('Não foi possível ajustar essa imagem. Escolha um arquivo menor.');
  }catch(error){throw error instanceof Error&&error.message?error:new Error('Não foi possível abrir a imagem. Escolha outro arquivo.');}
  finally{URL.revokeObjectURL(url);}
}
export function ImageUploadField({label,kind,value,onChange,onBusyChange}:{label:string;kind:'avatar'|'pix';value?:string;onChange:(value:string)=>void;onBusyChange?:(busy:boolean)=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),request=useRef(0),field=useRef<HTMLInputElement>(null),notifyBusy=useRef(onBusyChange);notifyBusy.current=onBusyChange;
  useEffect(()=>()=>{request.current++;notifyBusy.current?.(false);},[]);
  return <section className="border border-slate-200 bg-slate-50 rounded-xl p-4 space-y-3"><h3 className="text-sm font-semibold text-slate-800">{label}</h3><div className="flex flex-wrap gap-4 items-center">{value?<img src={value} alt={kind==='avatar'?'Prévia da foto do perfil':'QR Code do PIX cadastrado'} className={kind==='avatar'?'w-20 h-20 object-cover rounded-2xl bg-white border':'w-36 h-36 object-contain bg-white border p-2 rounded-xl'}/>:<div className={`grid place-items-center border border-dashed border-slate-300 text-slate-400 bg-white ${kind==='avatar'?'w-20 h-20 rounded-2xl':'w-36 h-36 rounded-xl'}`}><ImagePlus size={26}/></div>}<div className="space-y-2"><p className="text-xs text-slate-500 max-w-xs">{kind==='avatar'?'Escolha uma foto para identificar a pessoa na entrada e durante o trabalho.':'Envie a imagem do QR Code fornecida pelo prestador.'}<br/>PNG, JPG ou WebP · até 5 MB</p><input ref={field} type="file" accept="image/png,image/jpeg,image/webp" aria-label={label} className="sr-only" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;const id=++request.current;setBusy(true);notifyBusy.current?.(true);setError('');try{const result=await prepareImage(file,kind);if(id===request.current)onChange(result);}catch(error){if(id===request.current)setError((error as Error).message);}finally{if(id===request.current){setBusy(false);notifyBusy.current?.(false);}}}}/><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className="nagano-button secondary" onClick={()=>field.current?.click()}><ImagePlus size={15}/>{busy?'Preparando…':kind==='avatar'?'Selecionar foto':'Enviar QR Code'}</button>{value&&<button type="button" disabled={busy} className="text-xs text-rose-700 flex gap-1 items-center px-2" onClick={()=>{onChange('');setError('');}}><Trash2 size={14}/>{kind==='avatar'?'Remover foto':'Remover QR Code'}</button>}</div></div></div>{error&&<p role="alert" className="text-xs text-rose-700">{error}</p>}</section>;
}

