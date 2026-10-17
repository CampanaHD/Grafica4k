import {convertQuantity,normalizeUnit,quantityRound} from './erpMath';
export type RollCostInput={totalPaid:number;lengthM:number};
export function supportsLinearCost(unit:string){return ['m²','cm²','metro','cm'].includes(normalizeUnit(unit));}
export function stockQuantityPerLinearMeter(unit:string,widthM?:number){
 const normalized=normalizeUnit(unit);if(['m²','cm²'].includes(normalized)){if(!Number.isFinite(widthM)||widthM!<=0||widthM!>100)throw new Error('Informe a boca da bobina em metros para converter o custo para o estoque em área.');return convertQuantity(widthM!,'m²',normalized);}
 if(['metro','cm'].includes(normalized))return convertQuantity(1,'metro',normalized);
 throw new Error('Custo por metro linear requer estoque em metro, cm, m² ou cm².');
}
export function calculateRollCost(input:RollCostInput,unit:string,widthM?:number){
 if(typeof input.totalPaid!=='number'||!Number.isFinite(input.totalPaid)||input.totalPaid<0||input.totalPaid>1e9)throw new Error('Informe o valor total pago na bobina.');
 if(typeof input.lengthM!=='number'||!Number.isFinite(input.lengthM)||input.lengthM<=0||input.lengthM>1e6)throw new Error('Informe um comprimento da bobina maior que zero.');
 const factor=stockQuantityPerLinearMeter(unit,widthM),linearCost=input.totalPaid/input.lengthM;
 return {linearCost:quantityRound(linearCost),stockUnitCost:quantityRound(linearCost/factor),stockQuantity:quantityRound(input.lengthM*factor)};
}
export function stockCostPerLinearMeter(stock:{unit:string;averageCost:number;costReferenceWidthM?:number}){return quantityRound(stock.averageCost*stockQuantityPerLinearMeter(stock.unit,stock.costReferenceWidthM));}
