import type {StockUnit,CompositionComponent} from '../types/erp';
export const quantityRound=(n:number)=>Math.round((n+Number.EPSILON)*1e6)/1e6;
const units:Record<StockUnit,[string,number]>={un:['count',1],metro:['length',1],cm:['length',.01],'m²':['area',1],'cm²':['area',.0001],bobina:['roll',1],rolo:['roll',1],chapa:['sheet',1],litro:['volume',1],ml:['volume',.001],kg:['mass',1],grama:['mass',.001],caixa:['box',1],pacote:['package',1]};
export const stockUnits=Object.keys(units) as StockUnit[];
export function normalizeUnit(value:string):StockUnit{const aliases:Record<string,StockUnit>={unidade:'un',unidades:'un',und:'un',m:'metro',metros:'metro',centimetro:'cm',centimetros:'cm',m2:'m²',metroquadrado:'m²',metrosquadrados:'m²',cm2:'cm²',centimetroquadrado:'cm²',centimetrosquadrados:'cm²',l:'litro',litros:'litro',g:'grama',gramas:'grama',quilo:'kg',quilos:'kg',rolos:'rolo',bobinas:'bobina',chapas:'chapa'};const key=String(value).normalize('NFD').replace(/[\u0300-\u036f\s_.]/g,'').toLowerCase();const result=aliases[key]||key as StockUnit;if(!units[result])throw new Error('Unidade de estoque inválida.');return result;}
export function convertQuantity(value:number,from:StockUnit|string,to:StockUnit|string){from=normalizeUnit(from);to=normalizeUnit(to);if(!Number.isFinite(value)||units[from][0]!==units[to][0])throw new Error(`Unidades incompatíveis: ${from} e ${to}.`);return quantityRound(value*units[from][1]/units[to][1]);}
export function baseUnit(unit:StockUnit|string):StockUnit{const normalized=normalizeUnit(unit);return ({length:'metro',area:'m²',volume:'litro',mass:'kg',count:'un',roll:'bobina',sheet:'chapa',box:'caixa',package:'pacote'} as const)[units[normalized][0]];}
export function stockAvailability(stock:{stock:number;reserved:number;unit:string},quantity=0,unit=stock.unit){const base=baseUnit(stock.unit),physical=convertQuantity(stock.stock,stock.unit,base),reserved=convertQuantity(stock.reserved,stock.unit,base),available=quantityRound(physical-reserved),required=convertQuantity(quantity,unit,base);return {baseUnit:base,physical,reserved,available,required,converted:convertQuantity(required,base,stock.unit),ok:Math.round(available*1e6)>=Math.round(required*1e6)};}
/** Restricted arithmetic parser: no JavaScript execution, property access or functions. */
export function arithmetic(source:string,variables:Record<string,number>={},calculator=false):number{
  if(typeof source!=='string'||source.length>250)throw new Error('Expressão inválida.');
  const input=source.replace(/,/g,'.').replace(/×/g,'*').replace(/÷/g,'/');
  const tokens=input.match(/(?:\d+(?:\.\d*)?|\.\d+)|[A-Za-z][A-Za-z0-9_]*|[+*/()%\-]/g)||[];
  if(tokens.join('')!==input.replace(/\s/g,''))throw new Error('Use apenas números, operações e variáveis permitidas.');
  let at=0;
  type Value={n:number;p?:boolean};
  const primary=():Value=>{const token=tokens[at++];let value:Value;
    if(token==='+'||token==='-'){value=primary();value={n:token==='-'?-value.n:value.n};}
    else if(token==='('){value=sum();if(tokens[at++]!==')')throw new Error('Confira os parênteses.');}
    else if(token&&/^\d|^\./.test(token))value={n:Number(token)};
    else if(token&&Object.hasOwn(variables,token))value={n:variables[token]};
    else throw new Error('Número ou variável inválida.');
    if(tokens[at]==='%'){if(!calculator)throw new Error('Use o campo perda para percentuais.');at++;value={n:value.n/100,p:true};}return value;};
  const product=():Value=>{let value=primary();while(['*','/'].includes(tokens[at])){const op=tokens[at++],right=primary();if(op==='/'&&right.n===0)throw new Error('Não é possível dividir por zero.');value={n:op==='*'?value.n*right.n:value.n/right.n};}return value;};
  const sum=():Value=>{let value=product();while(['+','-'].includes(tokens[at])){const op=tokens[at++],right=product(),n=calculator&&right.p?value.n*right.n:right.n;value={n:op==='+'?value.n+n:value.n-n};}return value;};
  const result=sum().n;if(at!==tokens.length||!Number.isFinite(result)||Math.abs(result)>1e12)throw new Error('Resultado inválido ou muito grande.');return quantityRound(result);
}
export function componentQuantity(component:CompositionComponent,dimensions:{width:number;height:number;quantity:number;rollArea:number;rollLength:number}){
  const {width,height,quantity,rollArea,rollLength}=dimensions,area=width*height,perimeter=2*(width+height);
  const bases={UNIT:quantity,AREA:area*quantity,PERIMETER:perimeter*quantity,WIDTH:width*quantity,HEIGHT:height*quantity,ROLL_AREA:rollArea,ROLL_LENGTH:rollLength};
  let n=component.formula==='EXPRESSION'?arithmetic(component.expression||'',{width,height,quantity,area,perimeter,rollArea,rollLength})*component.quantity:bases[component.formula]*component.quantity;
  if(['AREA','ROLL_AREA'].includes(component.formula))n=convertQuantity(n,'m²',component.unit);
  else if(['PERIMETER','WIDTH','HEIGHT','ROLL_LENGTH'].includes(component.formula))n=convertQuantity(n,'metro',component.unit);
  if(!Number.isFinite(n)||n<0||component.lossPct<0||component.lossPct>1000)throw new Error('Consumo ou perda inválidos.');return quantityRound(n*(1+component.lossPct/100));
}
export function payableState(bill:{status:string;dueDate:string},today:string){if(bill.status==='PAID')return 'PAID';if(bill.status==='CANCELLED')return 'CANCELLED';const days=(Date.parse(bill.dueDate+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000;return days<0?'OVERDUE':days<=7?'NEAR_DUE':'PENDING';}
