import React,{useEffect,useState} from 'react';
import {initializeBusiness} from '../services/businessData';
export function BusinessDataBoundary({children}:{children:React.ReactNode}){
  const [ready,setReady]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let active=true;void initializeBusiness().then(()=>{if(active)setReady(true);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
  if(!ready)return <div className="p-8 text-slate-600">{error||'Conectando os cadastros ao servidor…'}{error&&<button className="ml-3 underline" onClick={()=>location.reload()}>Tentar novamente</button>}</div>;
  return <>{children}</>;
}
