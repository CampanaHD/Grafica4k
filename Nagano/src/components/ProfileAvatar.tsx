import React from 'react';
import type {TeamProfile} from '../types/team';
export function ProfileAvatar({profile,className=''}:{profile:Pick<TeamProfile,'name'|'color'|'avatar'>;className?:string}){
  return <span style={{backgroundColor:profile.color,color:'white'}} className={`inline-grid place-items-center overflow-hidden shrink-0 font-bold ${className}`}>{profile.avatar?<img src={profile.avatar} alt={`Foto de ${profile.name}`} className="w-full h-full object-cover"/>:profile.name.trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase()||'?'}</span>;
}

