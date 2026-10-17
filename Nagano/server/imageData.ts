import {inflateSync,deflateSync} from 'node:zlib';
const crc=(bytes:Buffer)=>{let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;};
const chunk=(type:string,data:Buffer)=>{const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,data])),out.length-4);return out;};
/** Validate complete raster content, cap decompression and strip metadata before storage. */
export function validateImageData(value:unknown,kind:'avatar'|'pix'):string|undefined {
  if(value===''||value===null)return undefined;
  const maxBytes=kind==='avatar'?300000:1000000,maxSide=kind==='avatar'?512:1600;
  if(typeof value!=='string'||value.length>Math.ceil(maxBytes*4/3)+30||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw new Error('Escolha uma imagem PNG, JPG ou WebP pelo campo de upload.');
  const encoded=value.slice('data:image/png;base64,'.length),bytes=Buffer.from(encoded,'base64');
  if(bytes.length<45||bytes.length>maxBytes||bytes.toString('base64')!==encoded||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR'||bytes.subarray(-8,-4).toString('ascii')!=='IEND')throw new Error('A imagem não é válida. Selecione outro arquivo.');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(!width||!height||width>maxSide||height>maxSide)throw new Error('A imagem excede o tamanho permitido. Use o campo de upload para ajustá-la.');
  try{
    const kept:Buffer[]=[],compressed:Buffer[]=[];let at=8,ended=false,idat=false,idatEnded=false,palette=false,paletteEntries=0,transparency=false;
    const header=bytes.subarray(16,29),depth=header[8],color=header[9],channels=({0:1,2:3,3:1,4:2,6:4} as Record<number,number>)[color];
    if(!channels||!({0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]} as Record<number,number[]>)[color].includes(depth)||header[10]!==0||header[11]!==0||header[12]!==0)throw new Error();
    while(at<bytes.length){
      if(at+12>bytes.length)throw new Error();const length=bytes.readUInt32BE(at),end=at+12+length;if(end>bytes.length)throw new Error();
      const type=bytes.toString('ascii',at+4,at+8),data=bytes.subarray(at+8,end-4);
      if(!/^[A-Za-z]{4}$/.test(type)||crc(bytes.subarray(at+4,end-4))!==bytes.readUInt32BE(end-4))throw new Error();
      if(at===8&&(type!=='IHDR'||length!==13))throw new Error();
      if(type==='IHDR'){if(at!==8)throw new Error();kept.push(chunk(type,data));}
      else if(type==='PLTE'){if(idat||palette||[0,4].includes(color)||!length||length%3||length>768||color===3&&length/3>2**depth)throw new Error();palette=true;paletteEntries=length/3;kept.push(chunk(type,data));}
      else if(type==='tRNS'){if(idat||transparency||![0,2,3].includes(color)||color===0&&length!==2||color===2&&length!==6||color===3&&(!palette||!length||length>paletteEntries))throw new Error();transparency=true;kept.push(chunk(type,data));}
      else if(type==='IDAT'){if(idatEnded||color===3&&!palette)throw new Error();idat=true;compressed.push(data);}
      else if(type==='IEND'){if(!idat||length||end!==bytes.length)throw new Error();ended=true;break;}
      else {if(type[0]===type[0].toUpperCase())throw new Error();if(idat)idatEnded=true;}
      at=end;
    }
    if(!ended)throw new Error();const row=Math.ceil(width*channels*depth/8)+1,expected=row*height;
    const pixels=inflateSync(Buffer.concat(compressed),{maxOutputLength:expected});if(pixels.length!==expected)throw new Error();
    for(let y=0;y<height;y++)if(pixels[y*row]>4)throw new Error();
    const sanitized=Buffer.concat([bytes.subarray(0,8),...kept,chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
    if(sanitized.length>maxBytes)throw new Error();return 'data:image/png;base64,'+sanitized.toString('base64');
  }catch{throw new Error('A imagem não é válida. Selecione outro arquivo.');}
}
