import React,{useEffect,useState} from 'react';
import type {Material} from '../types';
import {futuraApi,ImportedFutura} from '../services/futuraApi';
import {SpecificationDetails} from './SpecificationDetails';
import {formatCurrency} from '../utils/formatters';
export function FuturaVisualProductsSettings({materials,refreshVersion,onDelete}:{materials:Material[];refreshVersion:number;onDelete:(id:string)=>void}){
 const [imports,setImports]=useState<ImportedFutura[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;futuraApi.list().then(data=>{if(active)setImports(data.filter(p=>p.serviceGroup==='VISUAL_COMMUNICATION'));}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[refreshVersion,materials]);
 const current=imports.filter(item=>materials.some(m=>m.id===item.targetId));if(!current.length&&!error)return null;
 return <section className="space-y-3"><h3 className="font-bold text-slate-900">Produtos prontos de Comunicação Visual</h3>{error&&<p role="alert" className="text-rose-700">{error}</p>}<div className="grid md:grid-cols-2 gap-4">{current.map(item=><article key={item.id} className="p-4 bg-white border rounded-xl space-y-3"><div className="flex justify-between gap-3"><h4 className="font-semibold">{item.product.name}</h4><span className="text-xs text-slate-500">{item.active?'Ativo':'Inativo'}</span></div><SpecificationDetails entries={item.product.configuration}/><p className="text-sm text-indigo-700">Lote de {item.product.quantity.toLocaleString('pt-BR')} · Venda: {formatCurrency(item.salePriceCents/100)}</p><button className="text-sm text-rose-700" onClick={()=>onDelete(item.targetId)}>Excluir produto</button></article>)}</div></section>;
}
