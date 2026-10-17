import type {WorkOrder} from '../../src/types';
import {numberToWordsPt} from '../../src/utils/numberToWordsPt';
import {convertQuantity,quantityRound,payableState} from '../../src/utils/erpMath';
import {fail,numeric,text,cents,validDate,today,type ErpStore} from './store';
import type {createInventory} from './inventory';
export function createFinance(store:ErpStore,inventory:ReturnType<typeof createInventory>){
  const {db,get,list,put,transaction,audit,id}=store;
  const getOrder=(orderId:string):WorkOrder=>{const row=db.prepare('SELECT payload,revision FROM work_orders WHERE id=?').get(orderId);return row?{...JSON.parse(String(row.payload)),revision:Number(row.revision)}:fail('Ordem de serviço não encontrada.',404);};
  const writeOrder=(order:WorkOrder)=>{const saved={...order,revision:(order.revision||0)+1};db.prepare('UPDATE work_orders SET payload=?,revision=? WHERE id=?').run(JSON.stringify(saved),saved.revision,saved.id);return saved;};
  const settlement=(order:WorkOrder,actor:any,method:string)=>{
    if(cents(order.amountPaid)<cents(order.totalAmount)||!order.totalAmount)return null;
    const plan=get('job_plans',order.id),key=`final:${order.id}:${plan?.version||1}:${cents(order.totalAmount)}`,existing=get('receipts',key);if(existing)return existing;
    const number=`REC-${new Date().getFullYear()}-${String(Number(db.prepare('SELECT COUNT(*) AS n FROM erp_receipts').get()!.n)+1).padStart(5,'0')}`;
    const customer=get('clients',order.customerId);
    const entries=list('payments').filter(p=>p.workOrderId===order.id).reverse();
    const observations=entries.map(p=>`${p.date||p.paymentDate}: R$ ${Number(p.amount).toFixed(2).replace('.',',')} · ${p.method||p.paymentMethod}`).join('\n');
    const receipt=put('receipts',{id:key,number,kind:'FINAL_SETTLEMENT',workOrderId:order.id,workOrderNumber:order.number,customerId:order.customerId,customerName:order.customerName,cpfCnpj:customer?.cpfCnpj||'',amount:order.totalAmount,amountInWords:numberToWordsPt(order.totalAmount),paymentMethod:method,paymentDate:today(),referringTo:`Quitação integral da Ordem de Serviço ${order.number} (${order.serviceName}). Inclui todos os pagamentos registrados.`,observations,issuerName:actor.name,createdAt:new Date().toISOString()});audit(actor,'QUITACAO','RECIBO',receipt.id,number);return receipt;
  };
  const recordDelta=(previous:WorkOrder|undefined,next:WorkOrder,actor:any)=>{
    const delta=cents(next.amountPaid)-cents(previous?.amountPaid||0);if(delta<0)fail('Use um estorno financeiro documentado para reduzir pagamentos.',409);
    if(delta>0){const payment={id:id(),workOrderId:next.id,workOrderNumber:next.number,quotationId:next.quotationId,customerId:next.customerId,customerName:next.customerName,date:today(),method:next.paymentMethod||'PIX',condition:'A_VISTA',installments:[],amount:delta/100,paymentMethod:next.paymentMethod||'Não informado',paymentDate:today(),receivedBy:actor.name,actor,createdAt:new Date().toISOString(),notes:previous?'Recebimento registrado na OS.':'Entrada na aprovação.'};put('payments',payment);audit(actor,'RECEBIMENTO','PAGAMENTO',payment.id,`${next.number}: ${payment.amount}`);}
    settlement(next,actor,next.paymentMethod||'Não informado');
  };
  const payment=(orderId:string,body:any,actor:any)=>transaction(()=>{
    const key=text(body.idempotencyKey,'identificação da operação',150,true),old=db.prepare('SELECT entity,result FROM erp_idempotency WHERE key=?').get(key);if(old){if(old.entity!==orderId)fail('Identificação de pagamento já utilizada.',409);return JSON.parse(String(old.result));}
    const order=getOrder(orderId);if(order.revision!==body.revision)fail('A OS foi alterada. Atualize antes de registrar o pagamento.',409);if(order.productionStatus==='CANCELADO')fail('Não registre pagamentos em uma OS cancelada.');
    const amount=cents(body.amount);if(amount<=0||amount>cents(order.remainingBalance))fail('O pagamento deve ser maior que zero e não pode superar o saldo.');
    const method=text(body.method,'forma de pagamento',150,true),next={...order,amountPaid:(cents(order.amountPaid)+amount)/100,remainingBalance:(cents(order.remainingBalance)-amount)/100,updatedBy:actor,paymentStatus:amount===cents(order.remainingBalance)?'Pago':'Pagamento parcial'};
    const row={id:id(),workOrderId:order.id,workOrderNumber:order.number,quotationId:order.quotationId,customerId:order.customerId,customerName:order.customerName,date:today(),method,condition:'A_VISTA',installments:[],amount:amount/100,paymentMethod:method,paymentDate:today(),receivedBy:actor.name,actor,createdAt:new Date().toISOString(),notes:text(body.notes,'observação',2000)};put('payments',row);
    const saved=writeOrder(next),receipt=settlement(saved,actor,method),result={order:saved,payment:row,receipt};db.prepare('INSERT INTO erp_idempotency VALUES(?,?,?)').run(key,orderId,JSON.stringify(result));audit(actor,'RECEBIMENTO','PAGAMENTO',row.id,`${order.number}: ${amount/100}`);return result;
  });
  const supplier=(body:any,actor:any)=>transaction(()=>{store.revision('suppliers',body);const email=text(body.email,'e-mail',200);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('E-mail inválido.');const saved=put('suppliers',{id:text(body.id,'identificação',150,true),legalName:text(body.legalName,'razão social',200),name:text(body.name,'nome fantasia',150,true),document:text(body.document,'CPF/CNPJ',30),phone:text(body.phone,'telefone',40),whatsapp:text(body.whatsapp,'WhatsApp',40),email,address:text(body.address,'endereço',600),materials:text(body.materials,'materiais fornecidos',2000),notes:text(body.notes,'observações',5000),active:body.active!==false});audit(actor,'FORNECEDOR','CADASTRO',saved.id,saved.name);return saved;});
  const payable=(body:any,actor:any)=>transaction(()=>{
    const previous=store.revision('payables',body);if(previous?.status==='PAID')fail('Uma conta paga não pode ser editada.');if(previous?.purchaseId)fail('A conta vinculada à compra deve manter os valores da compra.');
    if(body.attachmentId&&!get('attachments',body.attachmentId))fail('Anexo não encontrado.');
    if(body.supplierId&&!get('suppliers',body.supplierId))fail('Fornecedor não encontrado.');
    const saved=put('payables',{id:text(body.id,'identificação',150,true),description:text(body.description,'descrição',300,true),supplierId:text(body.supplierId,'fornecedor',150),category:text(body.category||'Despesas operacionais','categoria'),amount:cents(body.amount)/100,dueDate:validDate(body.dueDate),paymentMethod:text(body.paymentMethod,'forma de pagamento',150),installment:1,installments:1,notes:text(body.notes,'observações',5000),attachmentId:body.attachmentId||previous?.attachmentId,segment:['GRAPHIC_PRODUCTS','VISUAL_COMMUNICATION'].includes(body.segment)?body.segment:'COMPANY',status:'PENDING',createdAt:previous?.createdAt||new Date().toISOString()});audit(actor,'CONTA_A_PAGAR','FINANCEIRO',saved.id,saved.description);return saved;
  });
  const billAction=(billId:string,body:any,actor:any)=>transaction(()=>{
    const previous=get('payables',billId)||fail('Conta não encontrada.',404);if(previous.revision!==body.revision)fail('Esta conta foi alterada. Atualize a lista.',409);
    if(!['PAID','CANCELLED'].includes(body.status)||previous.status!=='PENDING')fail('A conta já foi paga ou cancelada.');
    if(body.status==='CANCELLED'&&previous.purchaseId)fail('Cancele a compra para cancelar suas parcelas pendentes.');
    const saved=put('payables',{...previous,status:body.status,paidAt:body.status==='PAID'?validDate(body.paidAt||today()):undefined,paidBy:body.status==='PAID'?actor:undefined});audit(actor,body.status==='PAID'?'CONTA_PAGA':'CONTA_CANCELADA','FINANCEIRO',billId,previous.description);return saved;
  });
  const purchase=(body:any,actor:any)=>transaction(()=>{
    const previous=store.revision('purchases',body);if(previous)fail('Compras registradas são imutáveis; cancele e registre outra para manter o histórico.');
    if(!get('suppliers',body.supplierId)?.active)fail('Selecione um fornecedor ativo.');if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>200)fail('Adicione os materiais da compra.');
    let total=0;const lines=body.lines.map((row:any)=>{const stock=inventory.item(row.itemId),quantity=numeric(row.quantity,'quantidade',.000001),unitCost=numeric(row.unitCost,'custo unitário'),unit=row.unit||stock.unit;let amount:number;
      if(['bobina','rolo'].includes(unit)){if(!Number.isInteger(quantity)||quantity>1000)fail('Informe uma quantidade inteira de bobinas, até 1.000.');const width=numeric(row.rollWidthM,'largura da bobina',.001,100),length=numeric(row.rollLengthM,'comprimento da bobina',.001,1e6);amount=quantity*length*inventory.lotFactor(stock,{widthM:width} as any);}
      else amount=convertQuantity(quantity,unit,stock.unit);
      const lineTotal=Math.round(quantity*unitCost*100);total+=lineTotal;return {itemId:stock.id,quantity,unit,unitCost,stockQuantity:quantityRound(amount),total:lineTotal/100,rollWidthM:row.rollWidthM,rollLengthM:row.rollLengthM};
    });
    const freight=cents(body.freight||0);total+=freight;const installments=numeric(body.installments||1,'parcelas',1,60);if(!Number.isInteger(installments))fail('Parcelas devem ser inteiras.');const dueDate=validDate(body.dueDate);
    const saved=put('purchases',{id:text(body.id,'identificação',150,true),supplierId:body.supplierId,description:text(body.description,'descrição',300,true),lines,total:total/100,freight:freight/100,installments,dueDate,paymentMethod:text(body.paymentMethod,'forma de pagamento'),category:text(body.category||'Materiais','categoria'),segment:['GRAPHIC_PRODUCTS','VISUAL_COMMUNICATION'].includes(body.segment)?body.segment:'COMPANY',notes:text(body.notes,'observações',5000),status:'OPEN',createdAt:new Date().toISOString()});
    let remaining=total;for(let n=1;n<=installments;n++){const amount=n===installments?remaining:Math.floor(total/installments);remaining-=amount;const day=new Date(dueDate+'T12:00:00Z'),originalDay=day.getUTCDate();day.setUTCDate(1);day.setUTCMonth(day.getUTCMonth()+n-1);const last=new Date(Date.UTC(day.getUTCFullYear(),day.getUTCMonth()+1,0)).getUTCDate();day.setUTCDate(Math.min(originalDay,last));put('payables',{id:`purchase:${saved.id}:${n}`,purchaseId:saved.id,description:`${saved.description} · ${n}/${installments}`,supplierId:saved.supplierId,category:saved.category,segment:saved.segment,amount:amount/100,dueDate:day.toISOString().slice(0,10),installment:n,installments,paymentMethod:saved.paymentMethod,notes:saved.notes,status:'PENDING',createdAt:saved.createdAt});}
    audit(actor,'COMPRA','COMPRAS',saved.id,saved.description);return saved;
  });
  const receivePurchase=(purchaseId:string,body:any,actor:any)=>transaction(()=>{
    const row=get('purchases',purchaseId)||fail('Compra não encontrada.',404);if(row.revision!==body.revision||row.status!=='OPEN')fail('Compra alterada, recebida ou cancelada. Atualize a lista.',409);
    let freightRemaining=cents(row.freight);const subtotal=cents(row.total)-freightRemaining;
    row.lines.forEach((line:any,index:number)=>{const freight=index===row.lines.length-1?freightRemaining:Math.floor(cents(row.freight)*(subtotal?cents(line.total)/subtotal:1/row.lines.length));freightRemaining-=freight;inventory.receive(line.itemId,line.stockQuantity,(cents(line.total)+freight)/100,actor,row.id,{freight:freight/100});
      if(['bobina','rolo'].includes(line.unit))for(let n=0;n<line.quantity;n++)inventory.addRoll({itemId:line.itemId,widthM:line.rollWidthM,initialLengthM:line.rollLengthM,code:`${row.id.slice(0,8)}-${index+1}-${n+1}`,purchaseId:row.id},actor,false);
    });
    const saved=put('purchases',{...row,status:'RECEIVED',receivedAt:new Date().toISOString(),receivedBy:actor});audit(actor,'RECEBIMENTO_COMPRA','COMPRAS',row.id,row.description);return saved;
  });
  const cancelPurchase=(purchaseId:string,body:any,actor:any)=>transaction(()=>{const row=get('purchases',purchaseId)||fail('Compra não encontrada.',404);if(row.revision!==body.revision||row.status!=='OPEN')fail('Somente compras abertas podem ser canceladas.');if(list('payables').some(b=>b.purchaseId===row.id&&b.status==='PAID'))fail('A compra possui pagamento. Registre o tratamento financeiro antes de cancelar.');for(const bill of list('payables').filter(b=>b.purchaseId===row.id))put('payables',{...bill,status:'CANCELLED'});const saved=put('purchases',{...row,status:'CANCELLED'});audit(actor,'CANCELAR_COMPRA','COMPRAS',row.id,text(body.reason,'motivo',1000,true));return saved;});
  const bills=()=>list('payables').map(b=>({...b,displayStatus:payableState(b,today())}));
  return {getOrder,writeOrder,recordDelta,payment,settlement,supplier,payable,billAction,purchase,receivePurchase,cancelPurchase,bills};
}
