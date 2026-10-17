import {BackupSettings} from './BackupSettings';
import {FinishCompositionCatalog,FinishCompositionEditor} from './FinishCompositionEditor';
import {SecurityAdmin} from './SecurityPanel';
import { GraphicProductsSettings } from './GraphicProductsSettings';
import { MessageTemplatesSettings } from './MessageTemplatesSettings';
import { FuturaImportPanel } from './FuturaImportPanel';
import { QuotationRetentionSettings } from './QuotationRetentionSettings';
import { TeamProfiles } from './TeamProfiles';
import React, { useEffect, useState } from 'react';
import { MaterialRulesFields } from './MaterialRulesFields';
import { MaterialSizesSettings } from './MaterialSizesSettings';
import { VisualServiceFormFields } from './VisualServiceFormFields';
import { FuturaVisualProductsSettings } from './FuturaVisualProductsSettings';
import { validateMaterial, sortDiscountTiers } from '../utils/materialValidation';
import {
  CompanySettings,
  Material,
  Service,
  FinishOption,
  RollOption,
  BudgetGeneralSettings,
  Quotation
} from '../types';
import {
  Settings,
  MessageSquare,
  Users,
  Printer,
  Building,
  Layers,
  Wrench,
  Plus,
  Trash2,
  CheckCircle2,
  Copy,
  Clock,
  DollarSign,
  AlertTriangle,
  FileText,
  Edit2,
  Calendar,
  ShieldAlert,
  Percent,
  CreditCard,
  X,
  Check,
  Package
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

interface SettingsModuleProps {
  inventoryMode?: boolean;
  currentRole: import('../types').UserRole;
  onReloadMaterials: () => Promise<void>;
  onRetentionChanged: () => Promise<void>;
  company: CompanySettings;
  materials: Material[];
  services: Service[];
  finishes: FinishOption[];
  budgetSettings: BudgetGeneralSettings;
  quotations: Quotation[];
  onSaveCompany: (settings: CompanySettings) => void | Promise<void>;
  onSaveMaterials: (materials: Material[]) => Promise<void>;
  onSaveServices: (services: Service[]) => Promise<void>;
  onSaveFinishes: (finishes: FinishOption[]) => void | Promise<void>;
  onSaveBudgetSettings: (settings: BudgetGeneralSettings) => void | Promise<void>;
}

export const SettingsModule: React.FC<SettingsModuleProps> = ({
  currentRole,
  inventoryMode=false,
  onReloadMaterials,
  onRetentionChanged,
  company,
  materials,
  services,
  finishes,
  budgetSettings,
  quotations,
  onSaveCompany,
  onSaveMaterials,
  onSaveServices,
  onSaveFinishes,
  onSaveBudgetSettings
}) => {
  const [topTab, setTopTab] = useState<'COMPANY' | 'BUDGET' | 'MESSAGES' | 'TEAM' | 'SECURITY'>('BUDGET');
  const [budgetTab, setBudgetTab] = useState<
    'GRAPHIC_PRODUCTS' | 'ROLLS' | 'MATERIALS' | 'SERVICES' | 'FINISHES' | 'DEADLINES' | 'MARGINS' | 'PAYMENTS'
  >(inventoryMode?'MATERIALS':'SERVICES');

  const [companyForm, setCompanyForm] = useState<CompanySettings>({ ...company });
  const [budgetForm, setBudgetForm] = useState<BudgetGeneralSettings>({ ...budgetSettings });
  const [materialsList, setMaterialsList] = useState<Material[]>([...materials]);
  const [futuraRevision, setFuturaRevision] = useState(0);
  useEffect(() => { setMaterialsList([...materials]); }, [materials]);
  const [servicesList, setServicesList] = useState<Service[]>([...services]);
  useEffect(()=>setServicesList([...services]),[services]);
  const [finishesList, setFinishesList] = useState<FinishOption[]>([...finishes]);
  useEffect(()=>setFinishesList([...finishes]),[finishes]);

  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [alertMsg, setAlertMsg] = useState('');

  // Modals
  const [editingRoll, setEditingRoll] = useState<{ materialId: string; roll: RollOption } | null>(null);
  const [isRollModalOpen, setIsRollModalOpen] = useState(false);

  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);

  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);

  const [editingFinish, setEditingFinish] = useState<FinishOption | null>(null);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);

  // Helper notice
  const notifySuccess = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(''), 3500);
  };

  const notifyAlert = (msg: string) => {
    setAlertMsg(msg);
    setTimeout(() => setAlertMsg(''), 5000);
  };

  // Safe Deletion Checker
  const isEntityUsedInQuotations = (idOrName: string) => {
    const term = idOrName.toLowerCase();
    return quotations.some(
      (q) =>
        q.materialId === idOrName ||
        q.serviceId === idOrName ||
        q.items?.some(item=>item.finishings?.some(f=>f.finishingId===idOrName)) ||
        (q.materialName || '').toLowerCase().includes(term) ||
        (q.serviceName || '').toLowerCase().includes(term) ||
        (q.calculationSnapshot && String(q.calculationSnapshot.recommendedRollWidthCm) === idOrName)
    );
  };

  // Save Company
  const handleSaveCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try{await onSaveCompany(companyForm);}catch(e){notifyAlert((e as Error).message);return;}
    notifySuccess('Dados da empresa salvos com sucesso!');
  };

  // Save Budget General Settings
  const handleSaveBudgetSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try{await onSaveBudgetSettings(budgetForm);}catch(e){notifyAlert((e as Error).message);return;}
    notifySuccess('Configurações de orçamentos e prazos salvas com sucesso!');
  };

  // ==================== ROLL HANDLERS ====================
  const handleOpenNewRoll = () => {
    const firstMat = materialsList[0];
    setEditingRoll({
      materialId: firstMat ? firstMat.id : '',
      roll: {
        id: `roll_${Date.now()}`,
        name: 'Nova Bobina',
        widthCm: 120,
        usableWidthCm: 116,
        lengthM: 50,
        costPerSqm: firstMat ? firstMat.costPerSqm : 20,
        costPerLinm: firstMat ? (firstMat.costPerSqm * 120) / 100 : 24,
        sellingPriceSqm: firstMat ? firstMat.sellingPriceSqm : 50,
        edgeSafetyCm: 2,
        defaultWastePct: 5,
        supplier: firstMat ? firstMat.supplier : 'Fornecedor',
        stockQty: 50,
        minStock: 10,
        active: true,
        notes: ''
      }
    });
    setIsRollModalOpen(true);
  };

  const persistMaterials = async (updated: Material[]) => {
    try {
      await onSaveMaterials(updated);
      setMaterialsList(updated);
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Falha ao salvar materiais.');
      return false;
    }
  };

  const handleSaveRoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoll) return;

    const { materialId, roll } = editingRoll;
    if (roll.widthCm <= 0) {
      alert('Informe uma largura válida maior que zero para a bobina.');
      return;
    }

    const updatedMaterials = materialsList.map((m) => {
      if (m.id === materialId) {
        const rollIndex = m.availableRolls.findIndex((r) => r.id === roll.id);
        let newRolls = [...m.availableRolls];
        if (rollIndex >= 0) {
          newRolls[rollIndex] = roll;
        } else {
          newRolls.push(roll);
        }
        return { ...m, availableRolls: newRolls, allowedRollWidths: Array.from(new Set([...(m.allowedRollWidths ?? []).map(w => w < 10 ? w * 100 : w), roll.widthCm])) };
      }
      return m;
    });

    if (!await persistMaterials(updatedMaterials)) return;
    setIsRollModalOpen(false);
    setEditingRoll(null);
    notifySuccess('Configuração de bobina salva!');
  };

  const handleDeleteRoll = async (materialId: string, rollId: string) => {
    if (isEntityUsedInQuotations(rollId)) {
      // Soft-deactivate
      const updated = materialsList.map((m) => {
        if (m.id === materialId) {
          return {
            ...m,
            availableRolls: m.availableRolls.map((r) => (r.id === rollId ? { ...r, active: false } : r))
          };
        }
        return m;
      });
      if (!await persistMaterials(updated)) return;
      notifyAlert('Este registro não pode ser excluído porque já foi utilizado em um orçamento. Ele foi desativado.');
      return;
    }

    const updated = materialsList.map((m) => {
      if (m.id === materialId) {
        return {
          ...m,
          availableRolls: m.availableRolls.filter((r) => r.id !== rollId)
        };
      }
      return m;
    });
    if (!await persistMaterials(updated)) return;
    notifySuccess('Bobina removida com sucesso!');
  };

  const handleToggleRollStatus = async (materialId: string, rollId: string) => {
    const updated = materialsList.map((m) => {
      if (m.id === materialId) {
        return {
          ...m,
          availableRolls: m.availableRolls.map((r) => (r.id === rollId ? { ...r, active: !r.active } : r))
        };
      }
      return m;
    });
    if (!await persistMaterials(updated)) return;
  };

  // ==================== MATERIAL HANDLERS ====================
  const handleOpenNewMaterial = () => {
    setEditingMaterial({
      id: `mat_${Date.now()}`,
      name: '',
      controlType: 'ROLL',
      calculationUnit: 'M2',
      allowedRollWidths: [1.6],
      allowRotation: true,
      autoFindLowestCost: true,
      allowManualRollOverride: true,
      volumeDiscountEnabled: false,
      discountTiers: [],
      category: 'Lonas',
      supplier: 'SignSupply',
      unit: 'm²',
      description: 'Descrição do material',
      costPerSqm: 0,
      costPerLinm: 0,
      sellingPriceSqm: 0,
      salePrice: 0,
      minimumCharge: 0,
      expectedWastePct: 5.0,
      defaultReinforcementCm: 0,
      defaultHemCm: 0,
      defaultRodPocketCm: 0.0,
      defaultBleedCm: 0,
      defaultEdgeSafetyCm: 0,
      active: true,
      availableRolls: []
    });
    setIsMaterialModalOpen(true);
  };

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;

    const validation = validateMaterial(editingMaterial, materialsList);
    if (!validation.valid) {
      alert(validation.errors.join('\n'));
      return;
    }

    const idx = materialsList.findIndex((m) => m.id === editingMaterial.id);
    let updated = [...materialsList];
    if (idx >= 0) {
      updated[idx] = { ...editingMaterial, discountTiers: sortDiscountTiers(editingMaterial.discountTiers) };
    } else {
      updated.push({ ...editingMaterial, discountTiers: sortDiscountTiers(editingMaterial.discountTiers) });
    }

    if (!await persistMaterials(updated)) return;
    setIsMaterialModalOpen(false);
    setEditingMaterial(null);
    notifySuccess('Material salvo com sucesso!');
  };

  const handleDeleteMaterial = async (materialId: string) => {
    if (isEntityUsedInQuotations(materialId)) {
      const updated = materialsList.map((m) => (m.id === materialId ? { ...m, active: false } : m));
      if (!await persistMaterials(updated)) return;
      notifyAlert('Este registro não pode ser excluído porque já foi utilizado em um orçamento. Ele foi desativado.');
      return;
    }

    const updated = materialsList.filter((m) => m.id !== materialId);
    if (!await persistMaterials(updated)) return;
    notifySuccess('Material excluído com sucesso!');
  };

  // ==================== SERVICE HANDLERS ====================
  const handleOpenNewService = () => {
    setEditingService({
      id: `srv_${Date.now()}`,
      name: 'Novo serviço de Comunicação Visual',
      serviceGroup: 'VISUAL_COMMUNICATION',
      category: 'Comunicação Visual',
      description: 'Descrição do serviço',
      pricingMethod: 'PER_SQM',
      defaultMaterialId: materialsList.find(m=>!m.futuraImportId&&m.active)?.id || '',
      allowedMaterialIds: materialsList.filter(m=>!m.futuraImportId&&m.active).slice(0,1).map(m=>m.id),
      basePrice: 65.0,
      setupFee: 15.0,
      minimumCharge: 35.0,
      hourlyRate: 0,
      productionDeadlineDays: 3,
      artworkDeadlineDays: 1,
      requiresArtwork: true,
      requiresApproval: true,
      allowsInstallation: true,
      customerNotes: 'Considerar prazo após aprovação do layout.',
      active: true
    });
    setIsServiceModalOpen(true);
  };

  const persistServices=async(updated:Service[])=>{try{await onSaveServices(updated);setServicesList(updated);return true;}catch(error){notifyAlert((error as Error).message);return false;}};
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService) return;

    if ((editingService.basePrice || 0) < 0 || editingService.minimumCharge < 0) {
      alert('Os valores não podem ser negativos.');
      return;
    }

    if(editingService.serviceGroup!=='GRAPHIC_PRODUCTS'&&(editingService.pricingMethod==='HOURLY'?editingService.hourlyRate:editingService.basePrice)===undefined){notifyAlert('Informe o preço do serviço.');return;}
    const idx = servicesList.findIndex((s) => s.id === editingService.id);
    let updated = [...servicesList];
    if (idx >= 0) {
      updated[idx] = editingService;
    } else {
      updated.push(editingService);
    }

    if(editingService.serviceGroup!=='GRAPHIC_PRODUCTS'&&editingService.allowedMaterialIds?.length===0){notifyAlert('Selecione pelo menos um material para este serviço.');return;}
    if(!await persistServices(updated))return;
    setIsServiceModalOpen(false);
    setEditingService(null);
    notifySuccess('Serviço salvo com sucesso!');
  };

  const handleDeleteService = async (serviceId: string) => {
    if (isEntityUsedInQuotations(serviceId)) {
      const updated = servicesList.map((s) => (s.id === serviceId ? { ...s, active: false } : s));
      if(!await persistServices(updated))return;
      notifyAlert('Este registro não pode ser excluído porque já foi utilizado em um orçamento. Ele foi desativado.');
      return;
    }

    const updated = servicesList.filter((s) => s.id !== serviceId);
    if(!await persistServices(updated))return;
    notifySuccess('Serviço excluído com sucesso!');
  };

  // ==================== FINISH HANDLERS ====================
  const handleOpenNewFinish = () => {
    setEditingFinish({
      id: `fin_${Date.now()}`,
      name: '',
      components: [],
      category: 'Acabamentos',
      description: 'Descrição do acabamento',
      costType: 'PER_UNIT',
      unitCost: 0,
      unitPrice: 0,
      minimumCharge: 0,
      productionTimeMinutes: 5,
      additionalDeadlineDays: 0,
      active: true
    });
    setIsFinishModalOpen(true);
  };

  const handleSaveFinish = async (value:FinishOption) => {
    const updated=finishesList.some(f=>f.id===value.id)?finishesList.map(f=>f.id===value.id?value:f):[...finishesList,value];
    await onSaveFinishes(updated);setIsFinishModalOpen(false);setEditingFinish(null);notifySuccess('Acabamento salvo com a composição de materiais.');
  };

  const handleDeleteFinish = async (finishId: string) => {
    if (isEntityUsedInQuotations(finishId)) {
      const updated = finishesList.map((f) => (f.id === finishId ? { ...f, active: false } : f));
      setFinishesList(updated);
      try{await onSaveFinishes(updated);}catch(e){notifyAlert((e as Error).message);return;}
      notifyAlert('Este registro não pode ser excluído porque já foi utilizado em um orçamento. Ele foi desativado.');
      return;
    }

    const updated = finishesList.filter((f) => f.id !== finishId);
    setFinishesList(updated);
    try{await onSaveFinishes(updated);}catch(e){notifyAlert((e as Error).message);return;}
    notifySuccess('Acabamento excluído com sucesso!');
  };

  const importAction=(group:import('../types/graphicProduct').ServiceGroup)=><FuturaImportPanel defaultGroup={group} currentRole={currentRole} onChanged={async()=>{await onReloadMaterials();setFuturaRevision(n=>n+1);}}/>;
  return (
    <div className="space-y-6">
      {/* HEADER */}
      {!inventoryMode&&<div className="module-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Settings className="w-5 h-5 text-indigo-600" />
            <span>Configurações do sistema</span>
          </h1>
          <p className="text-xs text-slate-500">
            Configure bobinas, chapas, materiais, serviços de Comunicação Visual e Gráfica, acabamentos e condições de venda.
          </p>
        </div>
      </div>

      }
      {/* NOTIFICATION BANNERS */}
      {saveSuccessMsg && (
        <div className="p-3 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold flex items-center space-x-2 border border-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {alertMsg && (
        <div className="p-3 bg-amber-100 text-amber-900 rounded-lg text-xs font-bold flex items-center space-x-2 border border-amber-300">
          <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0" />
          <span>{alertMsg}</span>
        </div>
      )}

      {/* TOP LEVEL NAVIGATION TABS */}
      {!inventoryMode&&<div className="flex border-b border-slate-200 gap-6 text-xs font-bold overflow-x-auto">
        <button
          onClick={() => setTopTab('BUDGET')}
          className={`pb-3 border-b-2 flex items-center space-x-2 ${
            topTab === 'BUDGET' ? 'border-indigo-600 text-indigo-600 font-extrabold' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Configuração de Orçamentos & Regras</span>
        </button>
        <button
          onClick={() => setTopTab('COMPANY')}
          className={`pb-3 border-b-2 flex items-center space-x-2 ${
            topTab === 'COMPANY' ? 'border-indigo-600 text-indigo-600 font-extrabold' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Dados da Empresa & Impressos</span>
        </button>
        <button onClick={() => setTopTab('MESSAGES')} className={`pb-3 border-b-2 whitespace-nowrap flex items-center gap-2 ${topTab === 'MESSAGES' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><MessageSquare className="w-4 h-4"/><span>Mensagens do WhatsApp</span></button>
        {currentRole==='ADMIN'&&<button onClick={()=>setTopTab('SECURITY')} className={`pb-3 border-b-2 whitespace-nowrap flex items-center gap-2 ${topTab==='SECURITY'?'border-indigo-600 text-indigo-600':'border-transparent text-slate-500'}`}><ShieldAlert className="w-4 h-4"/><span>Segurança</span></button>}
        {currentRole==='ADMIN'&&<button onClick={()=>setTopTab('TEAM')} className={`pb-3 border-b-2 whitespace-nowrap flex items-center gap-2 ${topTab==='TEAM'?'border-indigo-600 text-indigo-600':'border-transparent text-slate-500'}`}><Users className="w-4 h-4"/><span>Usuários e permissões</span></button>}
      </div>

      }
      {topTab === 'MESSAGES' && <MessageTemplatesSettings company={company}/>}
      {topTab==='TEAM'&&currentRole==='ADMIN'&&<TeamProfiles/>}
      {topTab==='SECURITY'&&currentRole==='ADMIN'&&<><SecurityAdmin/><BackupSettings/></>}

      {/* TOP TAB 1: COMPANY DATA */}
      {topTab === 'COMPANY' && (
        <form onSubmit={handleSaveCompanySubmit} className="space-y-4 text-xs max-w-3xl bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 border-b pb-2 flex items-center space-x-2">
            <Building className="w-4 h-4 text-indigo-600" />
            <span>Dados Cadastrais da Gráfica</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Razão Social</label>
              <input
                type="text"
                value={companyForm.companyName}
                onChange={(e) => setCompanyForm({ ...companyForm, companyName: e.target.value })}
                className="w-full border border-slate-300 rounded p-2"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Nome Fantasia</label>
              <input
                type="text"
                value={companyForm.tradingName}
                onChange={(e) => setCompanyForm({ ...companyForm, tradingName: e.target.value })}
                className="w-full border border-slate-300 rounded p-2"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">CNPJ / CPF</label>
              <input
                type="text"
                value={companyForm.cnpjCpf}
                onChange={(e) => setCompanyForm({ ...companyForm, cnpjCpf: e.target.value })}
                className="w-full border border-slate-300 rounded p-2 font-mono"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Inscrição Estadual (I.E)</label>
              <input
                type="text"
                value={companyForm.stateRegistration}
                onChange={(e) => setCompanyForm({ ...companyForm, stateRegistration: e.target.value })}
                className="w-full border border-slate-300 rounded p-2 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Telefone Principal</label>
              <input
                type="text"
                value={companyForm.telephone}
                onChange={(e) => setCompanyForm({ ...companyForm, telephone: e.target.value })}
                className="w-full border border-slate-300 rounded p-2"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">WhatsApp Atendimento</label>
              <input
                type="text"
                value={companyForm.whatsapp}
                onChange={(e) => setCompanyForm({ ...companyForm, whatsapp: e.target.value })}
                className="w-full border border-slate-300 rounded p-2"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Email Oficial</label>
              <input
                type="email"
                value={companyForm.email}
                onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                className="w-full border border-slate-300 rounded p-2"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
            <span className="font-bold text-slate-800 uppercase text-xxs block">Endereço Comercial</span>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Rua / Av"
                value={companyForm.street}
                onChange={(e) => setCompanyForm({ ...companyForm, street: e.target.value })}
                className="col-span-2 border rounded p-1.5"
              />
              <input
                type="text"
                placeholder="Número"
                value={companyForm.number}
                onChange={(e) => setCompanyForm({ ...companyForm, number: e.target.value })}
                className="border rounded p-1.5"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Bairro"
                value={companyForm.neighborhood}
                onChange={(e) => setCompanyForm({ ...companyForm, neighborhood: e.target.value })}
                className="border rounded p-1.5"
              />
              <input
                type="text"
                placeholder="Cidade"
                value={companyForm.city}
                onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })}
                className="border rounded p-1.5"
              />
              <input
                type="text"
                placeholder="UF"
                value={companyForm.state}
                onChange={(e) => setCompanyForm({ ...companyForm, state: e.target.value })}
                className="border rounded p-1.5"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Chave PIX Oficial</label>
            <input
              type="text"
              value={companyForm.pixKey}
              onChange={(e) => setCompanyForm({ ...companyForm, pixKey: e.target.value })}
              className="w-full border border-slate-300 rounded p-2 font-mono"
            />
          </div>

          <button
            type="submit"
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm"
          >
            Salvar Dados da Empresa
          </button>
        </form>
      )}

      {/* TOP TAB 2: BUDGET CONFIGURATION WORKSPACE */}
      {topTab === 'BUDGET' && (
        <div className="space-y-6">
          {inventoryMode?<div className="erp-tabs"><button className={budgetTab==='MATERIALS'?'is-active':''} onClick={()=>setBudgetTab('MATERIALS')}>Materiais de impressão</button><button className={budgetTab==='ROLLS'?'is-active':''} onClick={()=>setBudgetTab('ROLLS')}>Bobinas e chapas: medidas</button></div>:<div className="bg-slate-100 p-1.5 rounded-xl flex flex-wrap gap-1 text-xs font-bold border border-slate-200">
            <button onClick={() => setBudgetTab('GRAPHIC_PRODUCTS')} className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 ${budgetTab === 'GRAPHIC_PRODUCTS' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600'}`}><Printer className="w-4 h-4"/><span>Gráfica</span></button>
            <button
              onClick={() => setBudgetTab('SERVICES')}
              className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
                budgetTab === 'SERVICES' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Comunicação Visual</span>
            </button>

            <button
              onClick={() => setBudgetTab('FINISHES')}
              className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
                budgetTab === 'FINISHES' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wrench className="w-4 h-4 text-indigo-600" />
              <span>Acabamentos</span>
            </button>

            <button
              onClick={() => setBudgetTab('DEADLINES')}
              className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
                budgetTab === 'DEADLINES' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-4 h-4 text-indigo-600" />
              <span>Prazos & Calendário</span>
            </button>

            <button
              onClick={() => setBudgetTab('MARGINS')}
              className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
                budgetTab === 'MARGINS' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Percent className="w-4 h-4 text-indigo-600" />
              <span>Margens e Adicionais</span>
            </button>

            <button
              onClick={() => setBudgetTab('PAYMENTS')}
              className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
                budgetTab === 'PAYMENTS' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CreditCard className="w-4 h-4 text-indigo-600" />
              <span>Formas de Pagamento</span>
            </button>
          </div>}

          {budgetTab === 'DEADLINES' && <QuotationRetentionSettings currentRole={currentRole} onChanged={onRetentionChanged} />}
          {/* SECTION 1: ROLLS & MEASUREMENTS */}
          {budgetTab === 'GRAPHIC_PRODUCTS' && <GraphicProductsSettings refreshVersion={futuraRevision} legacyServices={servicesList} actions={<>{importAction('GRAPHIC_PRODUCTS')}</>} />}
          {!inventoryMode&&['MATERIALS','ROLLS'].includes(budgetTab)&&<p className="erp-card text-sm text-slate-500">Os materiais e suas medidas agora ficam em Estoque → Materiais → Materiais de impressão.</p>}
          {inventoryMode&&budgetTab === 'ROLLS' && <MaterialSizesSettings materials={materialsList} onCreateMaterial={handleOpenNewMaterial} onSave={async updated=>{if(!await persistMaterials(updated))throw new Error('Não foi possível salvar as medidas.');}} />}
          {/* SECTION 2: MATERIALS */}
          {inventoryMode&&budgetTab === 'MATERIALS' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Cadastro e Gestão de Materiais</h2>
                  <p className="text-xxs text-slate-500">Lonas, Adesivos, Papéis, Rígidos, Sublimação, etc.</p>
                </div>
                <button
                  onClick={handleOpenNewMaterial}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs flex items-center space-x-1 shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Material</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {materialsList.filter(mat=>!mat.futuraImportId).map((mat) => (
                  <div key={mat.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between border-b pb-2">
                      <div>
                        <span className="text-xxs font-bold uppercase text-indigo-600 tracking-wider">
                          {mat.category}
                        </span>
                        <h3 className="font-bold text-slate-900 text-sm">{mat.name}</h3>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-xxs font-bold ${
                          mat.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {mat.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>

                    <div className="text-xxs text-slate-600 space-y-1 font-mono">
                      <p>Fornecedor: {mat.supplier}</p>
                      <p>Tipo: {mat.controlType==='SHEET'?'Chapa':mat.controlType==='UNIT'?'Unidade':'Bobina'}</p>
                      <p>Perda Padrão: {mat.expectedWastePct}%</p>
                    </div>

                    <div className="pt-2 border-t flex items-center justify-between text-xs">
                      <span className="text-xxs text-slate-500 font-bold">
                        {mat.controlType==='SHEET'?(mat.availableSheets??[]).length:(mat.allowedRollWidths??mat.availableRolls??[]).length} medida(s) cadastrada(s)
                      </span>
                      <div className="space-x-1">
                        <button
                          onClick={() => {
                            setEditingMaterial(mat);
                            setIsMaterialModalOpen(true);
                          }}
                          className="px-2 py-1 text-indigo-600 hover:bg-indigo-50 font-bold rounded text-xxs"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeleteMaterial(mat.id)}
                          className="px-2 py-1 text-rose-600 hover:bg-rose-50 font-bold rounded text-xxs"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 3: SERVICES */}
          {budgetTab === 'SERVICES' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Comunicação Visual</h2>
                  <p className="text-xxs text-slate-500">
                    Serviços oferecidos, prazos de produção, forma de cobrança e regras de arte.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2"><button type="button" className="nagano-button primary" onClick={handleOpenNewService}><Plus size={16}/>Novo Serviço</button>{importAction('VISUAL_COMMUNICATION')}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {servicesList.filter(srv=>srv.serviceGroup!=='GRAPHIC_PRODUCTS').map((srv) => (
                  <div key={srv.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between border-b pb-2">
                      <div>
                        <span className="text-xxs font-bold uppercase text-indigo-600">{srv.category}</span>
                        <h3 className="font-bold text-slate-900 text-sm">{srv.name}</h3>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-xxs font-bold ${
                          srv.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {srv.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>

                    <p className="text-xxs text-slate-600">{srv.description || 'Sem descrição cadastrada'}</p>

                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg text-xxs font-mono text-slate-800">
                      <div>Cobrança: <strong>{{PER_SQM:'m²',PER_LINM:'Metro linear',PER_UNIT:'Unidade',FIXED:'Fixo',HOURLY:'Hora',POR_AREA_CONSUMIDA_BOBINA:'m² consumido'}[srv.pricingMethod]??srv.pricingMethod}</strong></div>
                      <div>Preço do serviço: <strong>{(srv.pricingMethod==='HOURLY'?srv.hourlyRate:srv.basePrice)===undefined?'Não cadastrado':(srv.pricingMethod==='HOURLY'?srv.hourlyRate:srv.basePrice).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></div>
                      <div>Cobrança Mínima: <strong>R$ {srv.minimumCharge}</strong></div>
                      <div>Prazo Produção: <strong>{srv.productionDeadlineDays || 3} dias úteis</strong></div>
                    </div>

                    <div className="pt-2 flex items-center justify-between text-xs">
                      <span className="text-xxs text-slate-500">
                        Arte: {srv.requiresArtwork ? 'Exige Criação' : 'Apenas Impressão'}
                      </span>
                      <div className="space-x-1">
                        <button
                          onClick={() => {
                            setEditingService(srv);
                            setIsServiceModalOpen(true);
                          }}
                          className="px-2 py-1 text-indigo-600 hover:bg-indigo-50 font-bold rounded text-xxs"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeleteService(srv.id)}
                          className="px-2 py-1 text-rose-600 hover:bg-rose-50 font-bold rounded text-xxs"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <FuturaVisualProductsSettings materials={materialsList} refreshVersion={futuraRevision} onDelete={id=>void handleDeleteMaterial(id)} />
            </div>
          )}

          {/* SECTION 4: FINISHES */}
          {budgetTab==='FINISHES'&&<FinishCompositionCatalog finishes={finishesList} onNew={handleOpenNewFinish} onEdit={f=>{setEditingFinish(f);setIsFinishModalOpen(true);}} onDelete={id=>void handleDeleteFinish(id)}/>}

          {/* SECTION 5: DEADLINES */}
          {budgetTab === 'DEADLINES' && (
            <form onSubmit={handleSaveBudgetSettingsSubmit} className="space-y-6 max-w-3xl bg-white p-6 rounded-2xl border border-slate-200 shadow-xs text-xs">
              <div>
                <h2 className="text-sm font-bold text-slate-900 border-b pb-2 flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  <span>Configuração de Prazos Globais & Regras de Produção</span>
                </h2>
                <p className="text-xxs text-slate-500 mt-1">
                  Cálculo automático: Prazo Serviço + Prazo Criação Arte + Prazo Acabamentos + Prazo Instalação
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Prazo Padrão de Validade do Orçamento (Dias)</label>
                  <input
                    type="number"
                    value={budgetForm.defaultValidityDays}
                    onChange={(e) => setBudgetForm({ ...budgetForm, defaultValidityDays: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded p-2 font-mono"
                    min={1}
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Prazo Padrão de Produção (Dias Úteis)</label>
                  <input
                    type="number"
                    value={budgetForm.defaultProductionDays}
                    onChange={(e) => setBudgetForm({ ...budgetForm, defaultProductionDays: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded p-2 font-mono"
                    min={1}
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-800 text-xs block">Dias de Não Produção (Finais de Semana / Feriados)</span>
                <p className="text-xxs text-slate-500">
                  Dias marcados não entram na contagem de prazos em dias úteis.
                </p>

                <div className="flex items-center space-x-4 pt-1 font-bold text-slate-700">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={budgetForm.nonWorkingDays.includes('SABADO')}
                      onChange={(e) => {
                        const days = e.target.checked
                          ? [...budgetForm.nonWorkingDays, 'SABADO']
                          : budgetForm.nonWorkingDays.filter((d) => d !== 'SABADO');
                        setBudgetForm({ ...budgetForm, nonWorkingDays: days });
                      }}
                      className="rounded text-indigo-600"
                    />
                    <span>Sábado</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={budgetForm.nonWorkingDays.includes('DOMINGO')}
                      onChange={(e) => {
                        const days = e.target.checked
                          ? [...budgetForm.nonWorkingDays, 'DOMINGO']
                          : budgetForm.nonWorkingDays.filter((d) => d !== 'DOMINGO');
                        setBudgetForm({ ...budgetForm, nonWorkingDays: days });
                      }}
                      className="rounded text-indigo-600"
                    />
                    <span>Domingo</span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm"
              >
                Salvar Configurações de Prazos
              </button>
            </form>
          )}

          {/* SECTION 6: MARGINS & ADICIONAIS */}
          {budgetTab === 'MARGINS' && (
            <form onSubmit={handleSaveBudgetSettingsSubmit} className="space-y-6 max-w-3xl bg-white p-6 rounded-2xl border border-slate-200 shadow-xs text-xs">
              <div>
                <h2 className="text-sm font-bold text-slate-900 border-b pb-2 flex items-center space-x-2">
                  <Percent className="w-4 h-4 text-indigo-600" />
                  <span>Margens de Lucro, Taxas Padrão & Regras do Pedido</span>
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Margem Padrão de Venda (%)</label>
                  <input
                    type="number"
                    value={budgetForm.defaultMarkupPct}
                    onChange={(e) => setBudgetForm({ ...budgetForm, defaultMarkupPct: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded p-2 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Taxa de Urgência (%)</label>
                  <input
                    type="number"
                    value={budgetForm.urgencyMarkupPct}
                    onChange={(e) => setBudgetForm({ ...budgetForm, urgencyMarkupPct: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded p-2 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Valor Mínimo do Pedido (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={budgetForm.minOrderValue}
                    onChange={(e) => setBudgetForm({ ...budgetForm, minOrderValue: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded p-2 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Desconto Máximo Permitido (%)</label>
                  <input
                    type="number"
                    value={budgetForm.maxDiscountPct}
                    onChange={(e) => setBudgetForm({ ...budgetForm, maxDiscountPct: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded p-2 font-mono"
                  />
                </div>
              </div>

              <div className="p-4 bg-indigo-50/50 border border-indigo-200 rounded-xl space-y-3">
                <span className="font-bold text-indigo-950 text-xs block">
                  Regra de Verificação de Estoque de Bobina
                </span>
                <select
                  value={budgetForm.stockCheckRule}
                  onChange={(e) => setBudgetForm({ ...budgetForm, stockCheckRule: e.target.value as any })}
                  className="w-full border border-slate-300 rounded p-2 text-xs bg-white"
                >
                  <option value="ALLOW_ALWAYS">Permitir orçamento normalmente mesmo se sem estoque em metros</option>
                  <option value="IGNORE_OUT_OF_STOCK">Ignorar bobinas com estoque zero no cálculo</option>
                  <option value="SHOW_ALERT">Permitir orçamento com Alerta de Compra Necessária</option>
                </select>
              </div>

              <button
                type="submit"
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm"
              >
                Salvar Margens e Adicionais
              </button>
            </form>
          )}

          {/* SECTION 7: PAYMENT TERMS */}
          {budgetTab === 'PAYMENTS' && (
            <div className="space-y-4 max-w-3xl bg-white p-6 rounded-2xl border border-slate-200 shadow-xs text-xs">
              <h2 className="text-sm font-bold text-slate-900 border-b pb-2 flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                <span>Formas e Condições de Pagamento Configuráveis</span>
              </h2>

              <div className="space-y-2">
                {budgetForm.paymentTermsOptions.map((term, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={term}
                      onChange={(e) => {
                        const updated = [...budgetForm.paymentTermsOptions];
                        updated[index] = e.target.value;
                        setBudgetForm({ ...budgetForm, paymentTermsOptions: updated });
                      }}
                      className="w-full border border-slate-300 rounded p-2"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const updated = budgetForm.paymentTermsOptions.filter((_, i) => i !== index);
                        setBudgetForm({ ...budgetForm, paymentTermsOptions: updated });
                      }}
                      className="p-2 text-rose-600 hover:bg-rose-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setBudgetForm({
                    ...budgetForm,
                    paymentTermsOptions: [...budgetForm.paymentTermsOptions, 'Nova Condição de Pagamento']
                  })
                }
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 rounded text-xs flex items-center space-x-1"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Forma de Pagamento</span>
              </button>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleSaveBudgetSettingsSubmit}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Salvar Formas de Pagamento
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== ROLL EDIT MODAL ==================== */}
      {isRollModalOpen && editingRoll && (
        <div className="nagano-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 text-xs border border-slate-200">
            <div className="nagano-dialog-heading flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Editar Configuração de Bobina</h3>
              <button onClick={() => setIsRollModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRoll} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Material Relacionado</label>
                <select
                  value={editingRoll.materialId}
                  onChange={(e) => setEditingRoll({ ...editingRoll, materialId: e.target.value })}
                  className="w-full border border-slate-300 rounded p-2"
                >
                  {materialsList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Largura Total (cm)</label>
                  <input
                    type="number"
                    value={editingRoll.roll.widthCm}
                    onChange={(e) => {
                      const w = Number(e.target.value);
                      setEditingRoll({
                        ...editingRoll,
                        roll: {
                          ...editingRoll.roll,
                          widthCm: w,
                          usableWidthCm: Math.max(0, w - (editingRoll.roll.edgeSafetyCm || 4))
                        }
                      });
                    }}
                    className="w-full border border-slate-300 rounded p-2 font-mono font-bold"
                    min={1}
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Largura Útil (cm)</label>
                  <input
                    type="number"
                    value={editingRoll.roll.usableWidthCm || editingRoll.roll.widthCm - 4}
                    onChange={(e) =>
                      setEditingRoll({
                        ...editingRoll,
                        roll: { ...editingRoll.roll, usableWidthCm: Number(e.target.value) }
                      })
                    }
                    className="w-full border border-slate-300 rounded p-2 font-mono text-emerald-800 font-bold"
                    min={1}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Custo Linear (R$/m)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingRoll.roll.costPerLinm}
                    onChange={(e) =>
                      setEditingRoll({
                        ...editingRoll,
                        roll: { ...editingRoll.roll, costPerLinm: Number(e.target.value) }
                      })
                    }
                    className="w-full border border-slate-300 rounded p-2 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Custo Área (R$/m²)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingRoll.roll.costPerSqm}
                    onChange={(e) =>
                      setEditingRoll({
                        ...editingRoll,
                        roll: { ...editingRoll.roll, costPerSqm: Number(e.target.value) }
                      })
                    }
                    className="w-full border border-slate-300 rounded p-2 font-mono"
                  />
                </div>
              </div>

              <p className="text-slate-500">Larguras são configurações. O estoque físico é cadastrado separadamente.</p>

              <div className="pt-3 flex justify-end space-x-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsRollModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded text-slate-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold"
                >
                  Salvar Bobina
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MATERIAL EDIT MODAL ==================== */}
      {isMaterialModalOpen && editingMaterial && (
        <div className="nagano-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 text-xs border border-slate-200">
            <div className="nagano-dialog-heading flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Editar Material</h3>
              <button onClick={() => setIsMaterialModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMaterial} className="space-y-3 max-h-[75vh] overflow-y-auto pr-2">
              <MaterialRulesFields commercial={false} showSizes={false} material={editingMaterial} onChange={setEditingMaterial} />
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nome do Material</label>
                <input
                  type="text"
                  value={editingMaterial.name}
                  onChange={(e) => setEditingMaterial({ ...editingMaterial, name: e.target.value })}
                  className="w-full border border-slate-300 rounded p-2 font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Categoria</label>
                  <input
                    type="text"
                    value={editingMaterial.category}
                    onChange={(e) => setEditingMaterial({ ...editingMaterial, category: e.target.value })}
                    className="w-full border border-slate-300 rounded p-2"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Fornecedor</label>
                  <input
                    type="text"
                    value={editingMaterial.supplier}
                    onChange={(e) => setEditingMaterial({ ...editingMaterial, supplier: e.target.value })}
                    className="w-full border border-slate-300 rounded p-2"
                  />
                </div>
              </div>

              <p className="text-sm text-slate-500">Os preços são cadastrados nos serviços de Comunicação Visual ou Gráfica. Cadastre as medidas em Bobinas e chapas.</p>
              <div className="pt-3 flex justify-end space-x-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsMaterialModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded text-slate-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold"
                >
                  Salvar Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== SERVICE EDIT MODAL ==================== */}
      {isServiceModalOpen && editingService && (
        <div className="nagano-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 text-xs border border-slate-200">
            <div className="nagano-dialog-heading flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Editar serviço</h3>
              <button onClick={() => setIsServiceModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveService} className="space-y-4 max-h-[75vh] overflow-y-auto pr-2">
              <VisualServiceFormFields service={editingService} materials={materialsList} onChange={setEditingService} />
              <div className="flex justify-end gap-2 pt-3 border-t"><button type="button" className="nagano-button secondary" onClick={()=>setIsServiceModalOpen(false)}>Cancelar</button><button className="nagano-button primary">Salvar serviço</button></div>
            </form>
          </div>
        </div>
      )}

      {isFinishModalOpen&&editingFinish&&<FinishCompositionEditor finish={editingFinish} onClose={()=>{setIsFinishModalOpen(false);setEditingFinish(null);}} onSave={handleSaveFinish}/>}

    </div>
  );
};





