import React from 'react';
import { specificationDetails } from '../utils/quotationMessage';
export function SpecificationDetails({value,entries}:{value?:string;entries?:Record<string,string>}) {
 const rows=entries?Object.entries(entries).map(([label,value])=>({label,value})):specificationDetails(value);
 if(!rows.length)return null;
 return <dl className="specification-details">{rows.map((row,index)=><div key={index}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>;
}
