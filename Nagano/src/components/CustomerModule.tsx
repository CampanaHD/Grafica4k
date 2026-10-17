import { DialogHeader } from './DialogHeader';
import { customerServiceRecency } from '../utils/productionFlow';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {createPortal} from 'react-dom';
import {
  Customer,
  CustomerType,
  CustomerObservation,
  CustomerAuditLog,
  CustomerAddress,
  ObservationCategory,
  Quotation,
  WorkOrder,
  Receipt,
  PaymentRecord,
  UserRole
} from '../types';
import { formatCurrency, formatDate, formatCpfCnpj, formatPhone } from '../utils/formatters';
import { validateCPF, validateCNPJ } from '../utils/validators';
import { normalizeBrazilianPhone } from '../utils/whatsappUtils';
import { storage } from '../services/storage';
import { whatsappClient } from '../services/whatsappClient';
import { getMessageTemplates } from '../services/messageTemplates';
import {activeProfile} from '../services/teamApi';
import {canAccess} from '../utils/profileAccess';
import { WhatsAppMessagePreview } from './WhatsAppMessagePreview';
import { prepareMessage, pickupBalance } from '../utils/messageTemplates';
import {
  Users,
  Plus,
  Search,
  UserCheck,
  Building,
  Phone,
  Mail,
  MapPin,
  History,
  FileText,
  Receipt as ReceiptIcon,
  X,
  Edit3,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  Send,
  Clock,
  DollarSign,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Lock,
  Eye,
  AlertCircle,
  Archive,
  Ban,
  CheckCircle,
  Briefcase
} from 'lucide-react';

interface CustomerModuleProps {
  customers: Customer[];
  quotations: Quotation[];
  workOrders: WorkOrder[];
  receipts: Receipt[];
  currentUserRole?: UserRole;
  onSaveCustomer: (customer: Customer) => void | Promise<void>;
  onNewQuotationForCustomer?: (customer: Customer) => void;
}

export const CustomerModule: React.FC<CustomerModuleProps> = ({
  customers,
  quotations,
  workOrders,
  receipts,
  currentUserRole = 'ADMIN',
  onSaveCustomer,
  onNewQuotationForCustomer
}) => {
  // Main State
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INDIVIDUAL' | 'COMPANY'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [cityFilter, setCityFilter] = useState<string>('ALL');
  const [pendingBalanceFilter, setPendingBalanceFilter] = useState<'ALL' | 'PENDING' | 'CLEARED'>('ALL');
  const [recencyFilter, setRecencyFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'updatedAt' | 'totalPurchased' | 'pendingBalance' | 'daysWithoutService'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Selected Views & Modals
  const [selectedProfileCustomer, setSelectedProfileCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [whatsAppModalCustomer, setWhatsAppModalCustomer] = useState<Customer | null>(null);
  const [inactivatingCustomer, setInactivatingCustomer] = useState<Customer | null>(null);
  const [inactivationReason, setInactivationReason] = useState('');

  // Duplicate Prevention State
  const [duplicateWarning, setDuplicateWarning] = useState<{
    matches: { customer: Customer; field: string; value: string }[];
    pendingCustomer: Customer;
  } | null>(null);

  // Observations State
  const [observations, setObservations] = useState<CustomerObservation[]>(() =>
    storage.getCustomerObservations()
  );
  const [auditLogs, setAuditLogs] = useState<CustomerAuditLog[]>(() =>
    storage.getCustomerAuditLogs()
  );

  // Extract unique cities for filter dropdown
  const uniqueCities = useMemo(() => {
    const cities = new Set<string>();
    customers.forEach((c) => {
      if (c.city) cities.add(c.city);
    });
    return Array.from(cities).sort();
  }, [customers]);

  // Permission Checks
  const canViewFinancials = canAccess(activeProfile,'finance');

  // Refresh Customer Auxiliary Data
  const reloadAuxiliaryData = () => {
    setObservations(storage.getCustomerObservations());
    setAuditLogs(storage.getCustomerAuditLogs());
  };

  // Filter & Sort Logic
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // Text Search
      const search = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !search ||
        c.name.toLowerCase().includes(search) ||
        (c.tradingName && c.tradingName.toLowerCase().includes(search)) ||
        c.cpfCnpj.replace(/\D/g, '').includes(search.replace(/\D/g, '')) ||
        c.cpfCnpj.includes(search) ||
        c.phone.includes(search) ||
        c.whatsapp.includes(search) ||
        c.email.toLowerCase().includes(search) ||
        (c.contactPerson && c.contactPerson.toLowerCase().includes(search)) ||
        c.city.toLowerCase().includes(search);

      // Type Filter
      const matchesType = typeFilter === 'ALL' || c.type === typeFilter;

      // Status Filter
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && c.active) ||
        (statusFilter === 'INACTIVE' && !c.active);

      // City Filter
      const matchesCity = cityFilter === 'ALL' || c.city === cityFilter;

      // Pending Balance Filter
      const pending = c.pendingBalance || 0;
      const matchesPending =
        pendingBalanceFilter === 'ALL' ||
        (pendingBalanceFilter === 'PENDING' && pending > 0) ||
        (pendingBalanceFilter === 'CLEARED' && pending <= 0);

      const days = customerServiceRecency(c.id, workOrders).days;
      const matchesRecency = recencyFilter === 'ALL' || (recencyFilter === 'NEVER' ? days === null : days !== null && days >= Number(recencyFilter));
      return matchesSearch && matchesType && matchesStatus && matchesCity && matchesPending && matchesRecency;
    }).sort((a, b) => {
      if (sortBy === 'daysWithoutService') {
        const daysA=customerServiceRecency(a.id,workOrders).days,daysB=customerServiceRecency(b.id,workOrders).days;
        if (daysA===null || daysB===null) return daysA===daysB ? a.name.localeCompare(b.name,'pt-BR') : daysA===null ? 1 : -1;
        return (sortOrder==='asc'?daysA-daysB:daysB-daysA) || a.name.localeCompare(b.name,'pt-BR');
      }
      let valA: any = a[sortBy] ?? '';
      let valB: any = b[sortBy] ?? '';

      if (sortBy === 'pendingBalance') {
        valA = a.pendingBalance || 0;
        valB = b.pendingBalance || 0;
      }

      if (typeof valA === 'string') {
        const comp = valA.localeCompare(valB, 'pt-BR');
        return sortOrder === 'asc' ? comp : -comp;
      }
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
  }, [customers, workOrders, searchTerm, typeFilter, statusFilter, cityFilter, pendingBalanceFilter, recencyFilter, sortBy, sortOrder]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage) || 1;
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredCustomers.slice(start, start + itemsPerPage);
  }, [filteredCustomers, currentPage]);

  // Summary Metrics
  const totalCustomersCount = customers.length;
  const activeCustomersCount = customers.filter((c) => c.active).length;
  const inactiveCustomersCount = customers.filter((c) => !c.active).length;
  const totalPurchasedSum = customers.reduce((acc, c) => acc + (c.totalPurchased || 0), 0);
  const totalPendingBalanceSum = customers.reduce((acc, c) => acc + (c.pendingBalance || 0), 0);

  // Handle Save (Create / Update) with Duplicate Detection & Audit Logging
  const processSaveCustomer = async (customerData: Customer, skipDuplicateCheck = false) => {
    const isEdit = customers.some((c) => c.id === customerData.id);
    const existingObj = customers.find((c) => c.id === customerData.id);

    // Normalize Phones
    const normPhone = normalizeBrazilianPhone(customerData.phone);
    const normWhatsapp = normalizeBrazilianPhone(customerData.whatsapp || customerData.phone);

    const finalCustomer: Customer = {
      ...customerData,
      phone: normPhone.valid ? normPhone.rawPhone : customerData.phone,
      normalizedPhone: normPhone.normalizedPhone,
      whatsapp: normWhatsapp.valid ? normWhatsapp.rawPhone : customerData.whatsapp,
      normalizedWhatsapp: normWhatsapp.normalizedPhone,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUserRole
    };

    // Duplicate Detection Check (if not editing or if ID is different)
    if (!skipDuplicateCheck) {
      const cleanCpfCnpj = finalCustomer.cpfCnpj.replace(/\D/g, '');
      const cleanPhone = finalCustomer.normalizedPhone;
      const cleanEmail = finalCustomer.email.toLowerCase().trim();

      const matches: { customer: Customer; field: string; value: string }[] = [];

      customers.forEach((c) => {
        if (c.id === finalCustomer.id) return; // ignore self

        if (cleanCpfCnpj && c.cpfCnpj.replace(/\D/g, '') === cleanCpfCnpj) {
          matches.push({ customer: c, field: 'CPF/CNPJ', value: c.cpfCnpj });
        }
        if (cleanEmail && c.email.toLowerCase().trim() === cleanEmail) {
          matches.push({ customer: c, field: 'E-mail', value: c.email });
        }
        if (cleanPhone && c.normalizedPhone === cleanPhone) {
          matches.push({ customer: c, field: 'Telefone', value: c.phone });
        }
      });

      if (matches.length > 0) {
        setDuplicateWarning({
          matches,
          pendingCustomer: finalCustomer
        });
        return;
      }
    }

    // Generate Audit Trail Logs for Changes
    if (isEdit && existingObj) {
      const changedFields: { field: string; oldVal: string; newVal: string }[] = [];

      if (existingObj.name !== finalCustomer.name) {
        changedFields.push({ field: 'Nome / Razão Social', oldVal: existingObj.name, newVal: finalCustomer.name });
      }
      if (existingObj.phone !== finalCustomer.phone) {
        changedFields.push({ field: 'Telefone', oldVal: existingObj.phone, newVal: finalCustomer.phone });
      }
      if (existingObj.whatsapp !== finalCustomer.whatsapp) {
        changedFields.push({ field: 'WhatsApp', oldVal: existingObj.whatsapp, newVal: finalCustomer.whatsapp });
      }
      if (existingObj.email !== finalCustomer.email) {
        changedFields.push({ field: 'E-mail', oldVal: existingObj.email, newVal: finalCustomer.email });
      }
      if (existingObj.street !== finalCustomer.street || existingObj.number !== finalCustomer.number || existingObj.city !== finalCustomer.city) {
        changedFields.push({
          field: 'Endereço',
          oldVal: `${existingObj.street}, ${existingObj.number} - ${existingObj.city}`,
          newVal: `${finalCustomer.street}, ${finalCustomer.number} - ${finalCustomer.city}`
        });
      }
      if (existingObj.notes !== finalCustomer.notes) {
        changedFields.push({ field: 'Observações Gerais', oldVal: existingObj.notes || 'Nenhuma', newVal: finalCustomer.notes || 'Nenhuma' });
      }
      if (existingObj.financialNotes !== finalCustomer.financialNotes) {
        changedFields.push({ field: 'Observações Financeiras', oldVal: existingObj.financialNotes || 'Nenhuma', newVal: finalCustomer.financialNotes || 'Nenhuma' });
      }

      changedFields.forEach((cf) => {
        storage.addCustomerAuditLog({
          customerId: finalCustomer.id,
          action: 'DADOS_ALTERADOS',
          changedField: cf.field,
          oldValue: cf.oldVal,
          newValue: cf.newVal,
          user: currentUserRole,
          reason: 'Edição de cadastro'
        });
      });
    } else {
      storage.addCustomerAuditLog({
        customerId: finalCustomer.id,
        action: 'CLIENTE_CRIADO',
        changedField: 'Cadastro',
        oldValue: '',
        newValue: `${finalCustomer.name} (${finalCustomer.cpfCnpj})`,
        user: currentUserRole,
        reason: 'Novo cadastro de cliente'
      });
    }

    // Call Parent Save Handler
    try{await onSaveCustomer(finalCustomer);}catch(e){alert((e as Error).message);return;}

    // Close Modals
    setIsAddModalOpen(false);
    setEditingCustomer(null);
    setDuplicateWarning(null);
    reloadAuxiliaryData();

    // If profile view open, update selected customer
    if (selectedProfileCustomer && selectedProfileCustomer.id === finalCustomer.id) {
      setSelectedProfileCustomer(finalCustomer);
    }
  };

  // Safe Inactivation / Reactivation Handler
  const handleToggleCustomerStatus = async (customer: Customer) => {
    if (!customer.active) {
      // Reactivate
      const reactivated = { ...customer, active: true, inactivatedReason: undefined };
      try{await onSaveCustomer(reactivated);}catch(e){alert((e as Error).message);return;}
      storage.addCustomerAuditLog({
        customerId: customer.id,
        action: 'REATIVADO',
        changedField: 'Status',
        oldValue: 'Inativo',
        newValue: 'Ativo',
        user: currentUserRole,
        reason: 'Reativação manual de cliente'
      });
      reloadAuxiliaryData();
      if (selectedProfileCustomer?.id === customer.id) setSelectedProfileCustomer(reactivated);
      return;
    }

    // Check if customer has history (OS, Quotes, Receipts, Payments)
    const custQuotes = quotations.filter((q) => q.customerId === customer.id);
    const custOS = workOrders.filter((os) => os.customerId === customer.id);
    const custReceipts = receipts.filter((r) => r.customerId === customer.id);

    setInactivatingCustomer(customer);
    setInactivationReason('');
  };

  const confirmInactivation = async () => {
    if (!inactivatingCustomer) return;

    const deactivated = {
      ...inactivatingCustomer,
      active: false,
      inactivatedReason: inactivationReason || 'Desativado pelo usuário autorizador'
    };

    try{await onSaveCustomer(deactivated);}catch(e){alert((e as Error).message);return;}
    storage.addCustomerAuditLog({
      customerId: inactivatingCustomer.id,
      action: 'DESATIVADO',
      changedField: 'Status',
      oldValue: 'Ativo',
      newValue: 'Inativo',
      user: currentUserRole,
      reason: inactivationReason || 'Desativação de cadastro'
    });

    setInactivatingCustomer(null);
    setInactivationReason('');
    reloadAuxiliaryData();
    if (selectedProfileCustomer?.id === deactivated.id) setSelectedProfileCustomer(deactivated);
  };

  // Observations Handler
  const handleAddObservation = (customerId: string, category: ObservationCategory, text: string, isImportantWarning: boolean, isInternal: boolean) => {
    if (!text.trim()) return;
    storage.addCustomerObservation({
      customerId,
      category,
      text: text.trim(),
      isImportantWarning,
      isInternal,
      createdBy: activeProfile?.name || currentUserRole,
      status: 'ACTIVE'
    });
    storage.addCustomerAuditLog({
      customerId,
      action: 'OBSERVACAO_ADICIONADA',
      changedField: `Observação [${category}]`,
      oldValue: '',
      newValue: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
      user: currentUserRole
    });
    reloadAuxiliaryData();
  };

  const handleArchiveObservation = (obsId: string, customerId: string) => {
    const list = storage.getCustomerObservations();
    const updated = list.map((item) => (item.id === obsId ? { ...item, status: 'ARCHIVED' as const } : item));
    storage.saveCustomerObservations(updated);
    storage.addCustomerAuditLog({
      customerId,
      action: 'OBSERVACAO_ARQUIVADA',
      changedField: 'Observação',
      oldValue: 'Ativo',
      newValue: 'Arquivado',
      user: currentUserRole
    });
    reloadAuxiliaryData();
  };

  return (
    <div className="space-y-6">
      {/* HEADER WITH SUMMARY CARDS */}
      <div className="module-heading flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Users className="w-6 h-6 text-indigo-600" />
            <span>Clientes</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Cadastros, contatos e histórico de cada relacionamento com a Nagano.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              setEditingCustomer(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Novo Cliente</span>
          </button>
        </div>
      </div>

      {/* METRIC BADGES BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col">
          <span className="text-xxs font-bold text-slate-500 uppercase">Total Cadastrado</span>
          <span className="text-lg font-bold text-slate-900 mt-0.5">{totalCustomersCount}</span>
        </div>
        <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200 shadow-2xs flex flex-col">
          <span className="text-xxs font-bold text-emerald-700 uppercase">Clientes Ativos</span>
          <span className="text-lg font-bold text-emerald-950 mt-0.5">{activeCustomersCount}</span>
        </div>
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col">
          <span className="text-xxs font-bold text-slate-500 uppercase">Clientes Inativos</span>
          <span className="text-lg font-bold text-slate-600 mt-0.5">{inactiveCustomersCount}</span>
        </div>
        <div className="bg-indigo-50/60 p-3 rounded-xl border border-indigo-200 shadow-2xs flex flex-col">
          <span className="text-xxs font-bold text-indigo-700 uppercase">Total em Vendas</span>
          <span className="text-sm font-mono font-bold text-indigo-950 mt-1">{canViewFinancials?formatCurrency(totalPurchasedSum):'—'}</span>
        </div>
        <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200 shadow-2xs flex flex-col">
          <span className="text-xxs font-bold text-amber-800 uppercase">Saldo Pendente Total</span>
          <span className="text-sm font-mono font-bold text-amber-950 mt-1">{canViewFinancials?formatCurrency(totalPendingBalanceSum):'—'}</span>
        </div>
      </div>

      {/* SEARCH, FILTER & TOOLBAR */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* SEARCH FIELD */}
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por Nome, Razão Social, CPF/CNPJ, Telefone, WhatsApp ou E-mail..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* TYPE FILTER */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full bg-white border border-slate-300 rounded-lg text-xs text-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="ALL">Todos os Tipos (PF/PJ)</option>
              <option value="COMPANY">Pessoa Jurídica (PJ)</option>
              <option value="INDIVIDUAL">Pessoa Física (PF)</option>
            </select>
          </div>

          {/* STATUS FILTER */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full bg-white border border-slate-300 rounded-lg text-xs text-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="ACTIVE">Apenas Ativos</option>
              <option value="INACTIVE">Apenas Inativos</option>
              <option value="ALL">Todos os Status</option>
            </select>
          </div>
        </div>

        {/* SECONDARY FILTERS & SORTING */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/60 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {/* CITY FILTER */}
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-500 font-medium">Cidade:</span>
              <select
                value={cityFilter}
                onChange={(e) => {
                  setCityFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-800"
              >
                <option value="ALL">Todas as Cidades</option>
                {uniqueCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            {/* PENDING BALANCE FILTER */}
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-500 font-medium">Financeiro:</span>
              <select
                value={pendingBalanceFilter}
                onChange={(e) => {
                  setPendingBalanceFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-800"
              >
                <option value="ALL">Todos os Saldos</option>
                <option value="PENDING">Com Saldo Pendente</option>
                <option value="CLEARED">Sem Pendências</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-slate-600">Sem serviços:
            <select aria-label="Filtrar clientes por tempo sem serviços" className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-800" value={recencyFilter} onChange={e=>{setRecencyFilter(e.target.value);setCurrentPage(1);if(e.target.value!=='ALL'){setSortBy('daysWithoutService');setSortOrder('desc');}}}>
              <option value="ALL">Todos os períodos</option><option value="30">30 dias ou mais</option><option value="60">60 dias ou mais</option><option value="90">90 dias ou mais</option><option value="NEVER">Sem serviço finalizado</option>
            </select>
          </label>
          {/* SORTING CONTROLS */}
          <div className="flex items-center space-x-2">
            <span className="text-slate-500 font-medium flex items-center">
              <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
              Ordenar por:
            </span>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value as any); setCurrentPage(1); if(e.target.value==='daysWithoutService')setSortOrder('desc'); }}
              className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-800"
            >
              <option value="updatedAt">Última Atualização</option>
              <option value="daysWithoutService">Mais tempo sem serviços</option>
              <option value="name">Nome / Razão Social</option>
              <option value="createdAt">Data de Cadastro</option>
              <option value="totalPurchased">Total Comprado</option>
              <option value="pendingBalance">Saldo Pendente</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="p-1 border border-slate-300 rounded bg-white hover:bg-slate-100 font-mono text-slate-700"
              title="Inverter Ordem"
            >
              {sortOrder === 'asc' ? '↑ ASC' : '↓ DESC'}
            </button>
          </div>
        </div>
      </div>

      {/* CUSTOMERS LIST TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="customer-list-table w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-xxs tracking-wider">
                <th className="py-3 px-4">Cliente / Razão Social</th>
                <th className="py-3 px-4">Tipo & Documento</th>
                <th className="py-3 px-4">Contatos</th>
                <th className="py-3 px-4">Cidade / UF</th>
                <th className="py-3 px-4">Sem novos serviços</th>
                <th className="py-3 px-4 text-right">Total Comprado</th>
                <th className="py-3 px-4 text-right">Saldo Pendente</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedCustomers.map((c) => {
                const normPhoneObj = normalizeBrazilianPhone(c.whatsapp || c.phone);
                const pending = c.pendingBalance || 0;
                const recency = customerServiceRecency(c.id, workOrders);

                return (
                  <tr key={c.id} className={`hover:bg-slate-50 transition ${!c.active ? 'bg-slate-50/60 opacity-75' : ''}`}>
                    {/* NAME */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 text-xs">{c.name}</div>
                      {c.tradingName && <div className="text-xxs text-slate-500 font-medium">{c.tradingName}</div>}
                      {c.contactPerson && (
                        <div className="text-xxs text-slate-400 mt-0.5">Contato: {c.contactPerson}</div>
                      )}
                    </td>

                    {/* TYPE & CPF/CNPJ */}
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-1 mb-1">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-xxs font-bold ${
                            c.type === 'COMPANY' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {c.type === 'COMPANY' ? 'PJ' : 'PF'}
                        </span>
                      </div>
                      <span className="font-mono text-slate-700">{c.cpfCnpj}</span>
                    </td>

                    {/* CONTACTS */}
                    <td className="py-3 px-4 space-y-1">
                      <div className="flex items-center space-x-1.5 text-slate-700">
                        <Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />
                        <span>{c.phone}</span>
                      </div>
                      {c.whatsapp && (
                        <div className="flex items-center space-x-1.5 text-slate-700">
                          <button
                            type="button"
                            onClick={() => setWhatsAppModalCustomer(c)}
                            className="inline-flex items-center space-x-1 text-emerald-600 hover:underline font-medium"
                            title="Enviar mensagem"
                          >
                            <MessageSquare className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                            <span>{c.whatsapp}</span>
                          </button>
                        </div>
                      )}
                      {c.email && <div className="text-xxs text-slate-400 truncate max-w-[160px]">{c.email}</div>}
                    </td>

                    {/* CITY */}
                    <td className="py-3 px-4">
                      <div className="text-slate-800 font-medium">{c.city}</div>
                      <div className="text-xxs text-slate-400">{c.state}</div>
                    </td>

                    <td className="py-3 px-4"><strong className="text-indigo-700">{recency.days === null ? 'Sem serviço finalizado' : `${recency.days} ${recency.days === 1 ? 'dia' : 'dias'}`}</strong>{recency.lastDeadline && <span className="block text-xxs text-slate-500">Desde {formatDate(recency.lastDeadline)}</span>}</td>
                    {/* TOTAL PURCHASED */}
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {canViewFinancials?formatCurrency(c.totalPurchased || 0):'—'}
                    </td>

                    {/* PENDING BALANCE */}
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      {!canViewFinancials?'—':pending > 0 ? (
                        <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          {formatCurrency(pending)}
                        </span>
                      ) : (
                        <span className="text-emerald-700">R$ 0,00</span>
                      )}
                    </td>

                    {/* STATUS */}
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xxs font-bold uppercase ${
                          c.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {c.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>

                    {/* ACTIONS */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          onClick={() => setSelectedProfileCustomer(c)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition"
                          title="Visualizar Perfil Completo"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingCustomer(c)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition"
                          title="Editar Cliente"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setWhatsAppModalCustomer(c)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition"
                          title="Enviar WhatsApp"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleCustomerStatus(c)}
                          className={`p-1.5 rounded transition ${
                            c.active ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={c.active ? 'Desativar Cliente' : 'Reativar Cliente'}
                        >
                          {c.active ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {paginatedCustomers.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 bg-slate-50/50">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="font-medium text-xs">Nenhum cliente encontrado com os filtros selecionados.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION FOOTER */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 gap-2">
          <div>
            Exibindo <span className="font-bold text-slate-900">{paginatedCustomers.length}</span> de{' '}
            <span className="font-bold text-slate-900">{filteredCustomers.length}</span> clientes encontrados
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 border border-slate-300 rounded bg-white disabled:opacity-40 hover:bg-slate-100"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-800">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 border border-slate-300 rounded bg-white disabled:opacity-40 hover:bg-slate-100"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL: EDIT / CREATE CUSTOMER */}
      {(isAddModalOpen || editingCustomer) && (
        <CustomerFormModal
          initialCustomer={editingCustomer}
          currentUserRole={currentUserRole}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingCustomer(null);
          }}
          onSave={(custData) => processSaveCustomer(custData)}
        />
      )}

      {/* MODAL: DUPLICATE WARNING */}
      {duplicateWarning && (
        <div className="nagano-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-amber-300">
            <div className="flex items-start space-x-3 text-amber-700">
              <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5 text-amber-600" />
              <div>
                <h3 className="font-bold text-base text-slate-900">Alerta de Possível Cliente Duplicado</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Já existe um cliente cadastrado com informações semelhantes. Verifique antes de continuar.
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2 text-xs">
              <span className="font-bold text-amber-900 block text-xxs uppercase tracking-wider">
                Registros Conflitantes Encontrados:
              </span>
              {duplicateWarning.matches.map((m, idx) => (
                <div key={idx} className="p-2 bg-white rounded border border-amber-200 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-900">{m.customer.name}</span>
                    <p className="text-xxs text-slate-500">
                      Coincidência por <strong className="text-slate-800">{m.field}</strong>: {m.value}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedProfileCustomer(m.customer);
                      setDuplicateWarning(null);
                      setIsAddModalOpen(false);
                      setEditingCustomer(null);
                    }}
                    className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xxs font-bold rounded"
                  >
                    Abrir Existente
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t text-xs">
              <button
                type="button"
                onClick={() => setDuplicateWarning(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => processSaveCustomer(duplicateWarning.pendingCustomer, true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold"
              >
                Continuar e Salvar Mesmo Assim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SAFE INACTIVATION PROMPT */}
      {inactivatingCustomer && (
        <div className="nagano-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-start space-x-3">
              <ShieldAlert className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-base text-slate-900">Desativação Segura de Cliente</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Este cliente possui histórico no sistema (orçamentos, ordens de serviço ou recibos) e não pode ser excluído permanentemente. Ele poderá ser desativado.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1">
              <p>
                <strong>Cliente:</strong> {inactivatingCustomer.name}
              </p>
              <p>
                <strong>Documento:</strong> {inactivatingCustomer.cpfCnpj}
              </p>
              <p className="text-xxs text-slate-500 pt-1">
                Ao desativar, o cliente não aparecerá como opção padrão para novos orçamentos, mas seu histórico permanecerá intacto em relatórios e documentos passados.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Motivo da desativação (Obrigatório para Auditoria):
              </label>
              <input
                type="text"
                placeholder="Ex: Cliente inativo / Alteração de razão social / Solicitou desligamento"
                value={inactivationReason}
                onChange={(e) => setInactivationReason(e.target.value)}
                className="w-full border border-slate-300 rounded p-2 text-xs"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t text-xs">
              <button
                type="button"
                onClick={() => setInactivatingCustomer(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmInactivation}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold"
              >
                Confirmar Desativação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: WHATSAPP COMPOSER */}
      {whatsAppModalCustomer && (
        <WhatsAppComposerModal
          customer={whatsAppModalCustomer}
          workOrders={workOrders}
          quotations={quotations}
          preferReactivation={recencyFilter !== 'ALL'}
          onClose={() => setWhatsAppModalCustomer(null)}
        />
      )}

      {/* FULL CUSTOMER PROFILE VIEW MODAL */}
      {selectedProfileCustomer && (
        <div inert={!!whatsAppModalCustomer}><CustomerProfileView
          customer={selectedProfileCustomer}
          quotations={quotations}
          workOrders={workOrders}
          receipts={receipts}
          observations={observations.filter((o) => o.customerId === selectedProfileCustomer.id)}
          auditLogs={auditLogs.filter((a) => a.customerId === selectedProfileCustomer.id)}
          currentUserRole={currentUserRole}
          onClose={() => setSelectedProfileCustomer(null)}
          onEdit={() => {
            setEditingCustomer(selectedProfileCustomer);
            setSelectedProfileCustomer(null);
          }}
          onToggleStatus={() => handleToggleCustomerStatus(selectedProfileCustomer)}
          onAddObservation={handleAddObservation}
          onArchiveObservation={handleArchiveObservation}
          onNewQuotation={() => {
            if (onNewQuotationForCustomer) onNewQuotationForCustomer(selectedProfileCustomer);
          }}
          onOpenWhatsApp={() => {
            setWhatsAppModalCustomer(selectedProfileCustomer);
          }}
        /></div>
      )}
    </div>
  );
};

/* =========================================================================
   COMPONENT: CUSTOMER FORM MODAL (EDIT / CREATE FULL-STACK FORM)
   ========================================================================= */

interface CustomerFormModalProps {
  initialCustomer: Customer | null;
  currentUserRole: UserRole;
  onClose: () => void;
  onSave: (customer: Customer) => void;
}

const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  initialCustomer,
  currentUserRole,
  onClose,
  onSave
}) => {
  const [activeTab, setActiveTab] = useState<'IDENT' | 'CONTACT' | 'ADDR' | 'NOTES'>('IDENT');

  // Form State
  const [type, setType] = useState<CustomerType>(initialCustomer?.type || 'COMPANY');
  const [name, setName] = useState(initialCustomer?.name || '');
  const [tradingName, setTradingName] = useState(initialCustomer?.tradingName || '');
  const [cpfCnpj, setCpfCnpj] = useState(initialCustomer?.cpfCnpj || '');
  const [stateRegistration, setStateRegistration] = useState(initialCustomer?.stateRegistration || '');
  const [municipalRegistration, setMunicipalRegistration] = useState(initialCustomer?.municipalRegistration || '');
  const [contactPerson, setContactPerson] = useState(initialCustomer?.contactPerson || '');

  // Contacts
  const [phone, setPhone] = useState(initialCustomer?.phone || '');
  const [whatsapp, setWhatsapp] = useState(initialCustomer?.whatsapp || '');
  const [secondaryPhone, setSecondaryPhone] = useState(initialCustomer?.secondaryPhone || '');
  const [email, setEmail] = useState(initialCustomer?.email || '');
  const [preferredContactMethod, setPreferredContactMethod] = useState<'WHATSAPP' | 'EMAIL' | 'PHONE' | 'SMS'>(
    initialCustomer?.preferredContactMethod || 'WHATSAPP'
  );

  // Communication Preferences
  const [allowWhatsapp, setAllowWhatsapp] = useState(initialCustomer?.allowWhatsapp ?? true);
  const [allowQuoteNotice, setAllowQuoteNotice] = useState(initialCustomer?.allowQuoteNotice ?? true);
  const [allowProductionNotice, setAllowProductionNotice] = useState(initialCustomer?.allowProductionNotice ?? true);
  const [allowPickupNotice, setAllowPickupNotice] = useState(initialCustomer?.allowPickupNotice ?? true);
  const [allowPaymentReminder, setAllowPaymentReminder] = useState(initialCustomer?.allowPaymentReminder ?? true);
  const [allowMarketing, setAllowMarketing] = useState(initialCustomer?.allowMarketing ?? false);

  // Address
  const [cep, setCep] = useState(initialCustomer?.cep || '');
  const [street, setStreet] = useState(initialCustomer?.street || '');
  const [number, setNumber] = useState(initialCustomer?.number || '');
  const [complement, setComplement] = useState(initialCustomer?.complement || '');
  const [neighborhood, setNeighborhood] = useState(initialCustomer?.neighborhood || '');
  const [city, setCity] = useState(initialCustomer?.city || 'São Paulo');
  const [state, setState] = useState(initialCustomer?.state || 'SP');
  const [landmark, setLandmark] = useState(initialCustomer?.landmark || '');
  const [deliveryInstructions, setDeliveryInstructions] = useState(initialCustomer?.deliveryInstructions || '');

  // Sectorial Notes
  const [notes, setNotes] = useState(initialCustomer?.notes || '');
  const [attendantNotes, setAttendantNotes] = useState(initialCustomer?.attendantNotes || '');
  const [artworkNotes, setArtworkNotes] = useState(initialCustomer?.artworkNotes || '');
  const [productionNotes, setProductionNotes] = useState(initialCustomer?.productionNotes || '');
  const [finishingNotes, setFinishingNotes] = useState(initialCustomer?.finishingNotes || '');
  const [financialNotes, setFinancialNotes] = useState(initialCustomer?.financialNotes || '');
  const [deliveryNotes, setDeliveryNotes] = useState(initialCustomer?.deliveryNotes || '');
  const [internalWarnings, setInternalWarnings] = useState(initialCustomer?.internalWarnings || '');

  // Validation
  const [docError, setDocError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const canEditFinancialNotes = canAccess(activeProfile,'finance');

  const handleCpfCnpjChange = (val: string) => {
    setCpfCnpj(val);
    setDocError('');
    const clean = val.replace(/\D/g, '');
    if (type === 'INDIVIDUAL' && clean.length === 11) {
      if (!validateCPF(clean)) setDocError('CPF inválido segundo algoritmo de verificação.');
    } else if (type === 'COMPANY' && clean.length === 14) {
      if (!validateCNPJ(clean)) setDocError('CNPJ inválido segundo algoritmo de verificação.');
    }
  };

  const handlePhoneBlur = () => {
    if (!phone.trim()) return;
    const norm = normalizeBrazilianPhone(phone);
    if (!norm.valid) {
      setPhoneError('O telefone informado é inválido ou está incompleto. Informe DDD e número.');
    } else {
      setPhoneError('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('Informe o nome completo do cliente.');
      setActiveTab('IDENT');
      return;
    }

    if (docError) {
      alert('Corrija o CPF/CNPJ antes de salvar.');
      setActiveTab('IDENT');
      return;
    }

    const normPhone = normalizeBrazilianPhone(phone);
    if (phone.trim() && !normPhone.valid) {
      alert(normPhone.error || 'O telefone informado é inválido.');
      setActiveTab('CONTACT');
      return;
    }

    const savedCustomer: Customer = {
      id: initialCustomer?.id || `cli_${Date.now()}`,
      type,
      name: name.trim(),
      tradingName: type === 'COMPANY' ? tradingName.trim() : undefined,
      cpfCnpj: formatCpfCnpj(cpfCnpj),
      stateRegistration: type === 'COMPANY' ? stateRegistration.trim() : undefined,
      municipalRegistration: type === 'COMPANY' ? municipalRegistration.trim() : undefined,
      contactPerson: contactPerson.trim(),
      phone: formatPhone(phone),
      normalizedPhone: normPhone.normalizedPhone,
      whatsapp: formatPhone(whatsapp || phone),
      normalizedWhatsapp: normalizeBrazilianPhone(whatsapp || phone).normalizedPhone,
      secondaryPhone: secondaryPhone ? formatPhone(secondaryPhone) : undefined,
      email: email.trim(),
      preferredContactMethod,
      allowWhatsapp,
      allowQuoteNotice,
      allowProductionNotice,
      allowPickupNotice,
      allowPaymentReminder,
      allowMarketing,
      cep: cep.trim(),
      street: street.trim(),
      number: number.trim(),
      complement: complement.trim(),
      neighborhood: neighborhood.trim(),
      city: city.trim(),
      state: state.trim(),
      landmark: landmark.trim(),
      deliveryInstructions: deliveryInstructions.trim(),
      notes: notes.trim(),
      attendantNotes: attendantNotes.trim(),
      artworkNotes: artworkNotes.trim(),
      productionNotes: productionNotes.trim(),
      finishingNotes: finishingNotes.trim(),
      financialNotes: canEditFinancialNotes ? financialNotes.trim() : initialCustomer?.financialNotes,
      deliveryNotes: deliveryNotes.trim(),
      internalWarnings: internalWarnings.trim(),
      active: initialCustomer ? initialCustomer.active : true,
      createdAt: initialCustomer?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: currentUserRole,
      totalPurchased: initialCustomer?.totalPurchased || 0,
      totalPaid: initialCustomer?.totalPaid || 0,
      pendingBalance: initialCustomer?.pendingBalance || 0,
      lastPurchaseDate: initialCustomer?.lastPurchaseDate
    };

    onSave(savedCustomer);
  };

  return (
    <div className="nagano-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full my-8 max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
        {/* MODAL HEADER */}
        <DialogHeader title={initialCustomer ? 'Editar cliente' : 'Cadastrar cliente'} subtitle="Organize os dados, os contatos e as preferências de atendimento." closeLabel="Fechar cadastro de cliente" onClose={onClose} />

        {/* MODAL FORM TABS */}
        <div className="nagano-dialog-tabs flex border-b border-slate-200 bg-slate-50 text-xs font-semibold overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('IDENT')}
            className={`flex-1 py-3 px-4 text-center border-b-2 transition ${
              activeTab === 'IDENT'
                ? 'border-indigo-600 text-indigo-600 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            1. Identificação
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('CONTACT')}
            className={`flex-1 py-3 px-4 text-center border-b-2 transition ${
              activeTab === 'CONTACT'
                ? 'border-indigo-600 text-indigo-600 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            2. Contatos & Notificações
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ADDR')}
            className={`flex-1 py-3 px-4 text-center border-b-2 transition ${
              activeTab === 'ADDR'
                ? 'border-indigo-600 text-indigo-600 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            3. Endereço
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('NOTES')}
            className={`flex-1 py-3 px-4 text-center border-b-2 transition ${
              activeTab === 'NOTES'
                ? 'border-indigo-600 text-indigo-600 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            4. Observações Setoriais
          </button>
        </div>

        {/* FORM CONTENT */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 text-xs space-y-4">
          {/* TAB 1: IDENTIFICATION */}
          {activeTab === 'IDENT' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-6 p-3 bg-slate-100 rounded-lg">
                <span className="font-bold text-slate-700">Tipo de Cliente:</span>
                <label className="flex items-center space-x-2 cursor-pointer font-bold text-slate-800">
                  <input
                    type="radio"
                    name="custType"
                    checked={type === 'COMPANY'}
                    onChange={() => setType('COMPANY')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Pessoa Jurídica (PJ / CNPJ)</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer font-bold text-slate-800">
                  <input
                    type="radio"
                    name="custType"
                    checked={type === 'INDIVIDUAL'}
                    onChange={() => setType('INDIVIDUAL')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Pessoa Física (PF / CPF)</span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">
                    {type === 'COMPANY' ? 'Razão Social *' : 'Nome Completo *'}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={type === 'COMPANY' ? 'Ex: Grafica e Editora LTDA' : 'Ex: João da Silva'}
                    className="w-full border border-slate-300 rounded p-2 text-xs font-semibold"
                    required
                  />
                </div>

                {type === 'COMPANY' && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nome Fantasia</label>
                    <input
                      type="text"
                      value={tradingName}
                      onChange={(e) => setTradingName(e.target.value)}
                      placeholder="Ex: Gráfica Express"
                      className="w-full border border-slate-300 rounded p-2 text-xs"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {type === 'COMPANY' ? 'CNPJ *' : 'CPF *'}
                  </label>
                  <input
                    type="text"
                    value={cpfCnpj}
                    onChange={(e) => handleCpfCnpjChange(e.target.value)}
                    placeholder={type === 'COMPANY' ? '00.000.000/0001-00' : '000.000.000-00'}
                    className={`w-full border rounded p-2 font-mono text-xs ${
                      docError ? 'border-rose-500 bg-rose-50 text-rose-900' : 'border-slate-300'
                    }`}
                    required
                  />
                  {docError && <p className="text-xxs text-rose-600 mt-1 font-semibold">{docError}</p>}
                </div>

                {type === 'COMPANY' && (
                  <>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Inscrição Estadual (IE)</label>
                      <input
                        type="text"
                        value={stateRegistration}
                        onChange={(e) => setStateRegistration(e.target.value)}
                        placeholder="Isento ou nº da IE"
                        className="w-full border border-slate-300 rounded p-2 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Inscrição Municipal (IM)</label>
                      <input
                        type="text"
                        value={municipalRegistration}
                        onChange={(e) => setMunicipalRegistration(e.target.value)}
                        placeholder="Nº da Inscrição Municipal"
                        className="w-full border border-slate-300 rounded p-2 text-xs font-mono"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Pessoa Responsável pelo Contato</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="Ex: Carlos - Depto de Compras"
                    className="w-full border border-slate-300 rounded p-2 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CONTACTS & NOTIFICATIONS */}
          {activeTab === 'CONTACT' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Telefone Principal *</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onBlur={handlePhoneBlur}
                    placeholder="(14) 99999-9999"
                    className={`w-full border rounded p-2 text-xs font-mono ${
                      phoneError ? 'border-rose-500 bg-rose-50' : 'border-slate-300'
                    }`}
                    required
                  />
                  {phoneError && <p className="text-xxs text-rose-600 mt-1">{phoneError}</p>}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">WhatsApp</label>
                  <input
                    type="text"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="(14) 99999-9999"
                    className="w-full border border-slate-300 rounded p-2 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Telefone Secundário / Recado</label>
                  <input
                    type="text"
                    value={secondaryPhone}
                    onChange={(e) => setSecondaryPhone(e.target.value)}
                    placeholder="(14) 3210-0000"
                    className="w-full border border-slate-300 rounded p-2 text-xs font-mono"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">E-mail Principal</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="cliente@empresa.com.br"
                    className="w-full border border-slate-300 rounded p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Método de Contato Preferido</label>
                  <select
                    value={preferredContactMethod}
                    onChange={(e) => setPreferredContactMethod(e.target.value as any)}
                    className="w-full border border-slate-300 rounded p-2 text-xs cursor-pointer"
                  >
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="EMAIL">E-mail</option>
                    <option value="PHONE">Legação Telefônica</option>
                    <option value="SMS">SMS</option>
                  </select>
                </div>
              </div>

              {/* COMMUNICATION PREFERENCES CHECKBOXES */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <span className="font-bold text-slate-800 text-xs uppercase tracking-wider block">
                  Preferências de Comunicação e Notificação
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-700">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowWhatsapp}
                      onChange={(e) => setAllowWhatsapp(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Aceita contato direto via WhatsApp</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowQuoteNotice}
                      onChange={(e) => setAllowQuoteNotice(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Aceita notificações de orçamento emitido</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowProductionNotice}
                      onChange={(e) => setAllowProductionNotice(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Aceita atualizações do andamento da produção</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowPickupNotice}
                      onChange={(e) => setAllowPickupNotice(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Aceita aviso de material pronto para retirada</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowPaymentReminder}
                      onChange={(e) => setAllowPaymentReminder(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Aceita lembrete e cobrança de pagamento</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowMarketing}
                      onChange={(e) => setAllowMarketing(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Aceita mensagens e promoções sazonais</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ADDRESS */}
          {activeTab === 'ADDR' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">CEP</label>
                  <input
                    type="text"
                    value={cep}
                    onChange={(e) => setCep(e.target.value)}
                    placeholder="00000-000"
                    className="w-full border border-slate-300 rounded p-2 text-xs font-mono"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Logradouro / Rua / Avenida</label>
                  <input
                    type="text"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="Ex: Rua Augusta"
                    className="w-full border border-slate-300 rounded p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Número</label>
                  <input
                    type="text"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="Ex: 450"
                    className="w-full border border-slate-300 rounded p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Complemento</label>
                  <input
                    type="text"
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    placeholder="Ex: Sala 02 / Bloco B"
                    className="w-full border border-slate-300 rounded p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bairro</label>
                  <input
                    type="text"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    placeholder="Ex: Consolação"
                    className="w-full border border-slate-300 rounded p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cidade</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ex: São Paulo"
                    className="w-full border border-slate-300 rounded p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Estado (UF)</label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                    placeholder="Ex: SP"
                    maxLength={2}
                    className="w-full border border-slate-300 rounded p-2 text-xs font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ponto de Referência</label>
                  <input
                    type="text"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    placeholder="Ex: Próximo ao metrô"
                    className="w-full border border-slate-300 rounded p-2 text-xs"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block font-bold text-slate-700 mb-1">Instruções para Entrega</label>
                  <textarea
                    rows={2}
                    value={deliveryInstructions}
                    onChange={(e) => setDeliveryInstructions(e.target.value)}
                    placeholder="Ex: Horário de recebimento das 08h às 12h na portaria principal."
                    className="w-full border border-slate-300 rounded p-2 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SECTORIAL NOTES */}
          {activeTab === 'NOTES' && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                <label className="block font-bold text-amber-900 mb-1 flex items-center space-x-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Avisos Internos Importantes (Exibido em destaque no perfil)</span>
                </label>
                <input
                  type="text"
                  value={internalWarnings}
                  onChange={(e) => setInternalWarnings(e.target.value)}
                  placeholder="Ex: Exigir ordem de compra oficial / Cliente exige amostra física de cor antes de rodar"
                  className="w-full border border-amber-300 rounded p-2 text-xs bg-white text-slate-900 font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Observações Gerais</label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Observações históricas ou gerais do cliente..."
                    className="w-full border border-slate-300 rounded p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Observações de Atendimento</label>
                  <textarea
                    rows={3}
                    value={attendantNotes}
                    onChange={(e) => setAttendantNotes(e.target.value)}
                    placeholder="Preferências de atendimento do cliente..."
                    className="w-full border border-slate-300 rounded p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Observações de Arte / Pré-impressão</label>
                  <textarea
                    rows={3}
                    value={artworkNotes}
                    onChange={(e) => setArtworkNotes(e.target.value)}
                    placeholder="Instruções de gabaritos, sangrias e perfis de cor..."
                    className="w-full border border-slate-300 rounded p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Observações de Produção & Impressão</label>
                  <textarea
                    rows={3}
                    value={productionNotes}
                    onChange={(e) => setProductionNotes(e.target.value)}
                    placeholder="Cuidados com bobinas, substratos ou máquinas..."
                    className="w-full border border-slate-300 rounded p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Observações de Acabamento</label>
                  <textarea
                    rows={3}
                    value={finishingNotes}
                    onChange={(e) => setFinishingNotes(e.target.value)}
                    placeholder="Instruções de bainha, ilhós, bastão ou laminação..."
                    className="w-full border border-slate-300 rounded p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Observações Financeiras (Acesso Restrito)</span>
                    {!canEditFinancialNotes && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                  </label>
                  <textarea
                    rows={3}
                    value={canEditFinancialNotes?financialNotes:''}
                    onChange={(e) => setFinancialNotes(e.target.value)}
                    disabled={!canEditFinancialNotes}
                    placeholder={
                      canEditFinancialNotes
                        ? 'Histórico de faturamento, prazos de pagamento...'
                        : 'Acesso restrito ao setor financeiro.'
                    }
                    className={`w-full border rounded p-2 text-xs ${
                      canEditFinancialNotes ? 'border-slate-300' : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* FOOTER ACTIONS */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <div className="text-xxs text-slate-400 font-medium">
              * Informações internas protegidas por permissões e auditoria.
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-sm transition"
              >
                Salvar Alterações do Cliente
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

/* =========================================================================
   COMPONENT: CUSTOMER PROFILE VIEW (360º COMPLETE CUSTOMER DASHBOARD)
   ========================================================================= */

interface CustomerProfileViewProps {
  customer: Customer;
  quotations: Quotation[];
  workOrders: WorkOrder[];
  receipts: Receipt[];
  observations: CustomerObservation[];
  auditLogs: CustomerAuditLog[];
  currentUserRole: UserRole;
  onClose: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  onAddObservation: (customerId: string, category: ObservationCategory, text: string, isImportantWarning: boolean, isInternal: boolean) => void;
  onArchiveObservation: (obsId: string, customerId: string) => void;
  onNewQuotation: () => void;
  onOpenWhatsApp: () => void;
}

const CustomerProfileView: React.FC<CustomerProfileViewProps> = ({
  customer,
  quotations,
  workOrders,
  receipts,
  observations,
  auditLogs,
  currentUserRole,
  onClose,
  onEdit,
  onToggleStatus,
  onAddObservation,
  onArchiveObservation,
  onNewQuotation,
  onOpenWhatsApp
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'OPERATIONAL' | 'FINANCIAL' | 'OBSERVATIONS' | 'AUDIT'>('OVERVIEW');

  // New Observation Input State
  const [newObsCategory, setNewObsCategory] = useState<ObservationCategory>('GERAL');
  const [newObsText, setNewObsText] = useState('');
  const [newObsWarning, setNewObsWarning] = useState(false);
  const [newObsInternal, setNewObsInternal] = useState(true);

  // Customer Orders & Financials
  const custQuotes = quotations.filter((q) => q.customerId === customer.id);
  const custOS = workOrders.filter((os) => os.customerId === customer.id);
  const custReceipts = receipts.filter((r) => r.customerId === customer.id);
  const serviceRecency = customerServiceRecency(customer.id, workOrders);

  const canViewFinancials = canAccess(activeProfile,'finance');

  const handleCreateObs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newObsText.trim()) return;
    onAddObservation(customer.id, newObsCategory, newObsText, newObsWarning, newObsInternal);
    setNewObsText('');
    setNewObsWarning(false);
  };

  return (
    <div className="nagano-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="customer-profile-dialog bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-6 max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
        {/* PROFILE HEADER */}
        <div className="customer-profile-header bg-white text-slate-900 p-6 space-y-4 border-b border-slate-200">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span
                  className={`px-2 py-0.5 rounded text-xxs font-bold uppercase ${
                    customer.type === 'COMPANY' ? 'bg-purple-500 text-white' : 'bg-blue-500 text-white'
                  }`}
                >
                  {customer.type === 'COMPANY' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xxs font-bold uppercase ${
                    customer.active ? 'bg-emerald-500 text-white' : 'bg-slate-600 text-slate-200'
                  }`}
                >
                  {customer.active ? 'Ativo' : 'Inativo'}
                </span>
                <span className="text-xxs text-slate-400 font-mono">Cadastrado em {formatDate(customer.createdAt)}</span>
              </div>

              <h2 className="text-xl font-bold tracking-tight text-slate-900">{customer.name}</h2>
              {customer.tradingName && <p className="text-xs text-slate-500 font-medium">{customer.tradingName}</p>}
            </div>

            <button onClick={onClose} aria-label="Fechar visualização do cliente" className="p-1 text-slate-400 hover:text-indigo-600 transition">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* QUICK ACTION BUTTONS BAR */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 text-xs">
            <button
              onClick={onEdit}
              className="nagano-button primary"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Editar Cliente</span>
            </button>

            <button
              style={!canAccess(activeProfile,'quotations')?{display:'none'}:undefined}
              onClick={onNewQuotation}
              className="nagano-button secondary"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Novo Orçamento</span>
            </button>

            <button
              onClick={onOpenWhatsApp}
              className="nagano-button secondary"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Enviar WhatsApp</span>
            </button>

            <button
              onClick={onToggleStatus}
              className="nagano-button secondary"
            >
              {customer.active ? <Ban className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
              <span>{customer.active ? 'Desativar Cliente' : 'Reativar Cliente'}</span>
            </button>
          </div>
        </div>

        {/* METRICS SUMMARY ROW */}
        <div className="grid grid-cols-2 sm:grid-cols-4 bg-slate-100 border-b border-slate-200 p-3 text-center text-xs">
          <div>
            <span className="block text-xxs text-slate-500 uppercase font-semibold">Documento</span>
            <strong className="font-mono text-slate-900">{customer.cpfCnpj}</strong>
          </div>
          <div>
            <span className="block text-xxs text-slate-500 uppercase font-semibold">Telefone Principal</span>
            <strong className="font-mono text-slate-900">{customer.phone}</strong>
          </div>
          <div>
            <span className="block text-xxs text-slate-500 uppercase font-semibold">Total em Compras</span>
            <strong className="font-mono text-indigo-900">{canViewFinancials?formatCurrency(customer.totalPurchased || 0):'—'}</strong>
          </div>
          <div>
            <span className="block text-xxs text-slate-500 uppercase font-semibold">Saldo Pendente</span>
            <strong className={`font-mono ${customer.pendingBalance ? 'text-rose-600' : 'text-emerald-700'}`}>
              {canViewFinancials?formatCurrency(customer.pendingBalance || 0):'—'}
            </strong>
          </div>
        </div>

        <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100 text-sm text-indigo-900">
          <strong>{serviceRecency.days === null ? 'Nenhum serviço aprovado e finalizado' : `${serviceRecency.days} ${serviceRecency.days === 1 ? 'dia' : 'dias'} sem novos serviços`}</strong>
          {serviceRecency.lastDeadline && <p className="text-xs text-slate-600 mt-1">Contagem desde o prazo final de {formatDate(serviceRecency.lastDeadline)} · {serviceRecency.orderNumber}</p>}
        </div>
        {/* IMPORTANT INTERNAL WARNING BANNER IF PRESENT */}
        {customer.internalWarnings && (
          <div className="bg-amber-50 border-b border-amber-200 p-3 px-6 flex items-start space-x-2 text-xs text-amber-900 font-semibold">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="uppercase text-xxs text-amber-800 font-bold block">Aviso Interno Importante:</span>
              <p className="text-slate-900">{customer.internalWarnings}</p>
            </div>
          </div>
        )}

        {/* PROFILE NAVIGATION TABS */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`py-3 px-4 text-center border-b-2 whitespace-nowrap transition ${
              activeTab === 'OVERVIEW'
                ? 'border-indigo-600 text-indigo-600 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            1. Visão Geral & Cadastro
          </button>
          <button
            onClick={() => setActiveTab('OPERATIONAL')}
            className={`py-3 px-4 text-center border-b-2 whitespace-nowrap transition ${
              activeTab === 'OPERATIONAL'
                ? 'border-indigo-600 text-indigo-600 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            2. Histórico Operacional ({custOS.length + custQuotes.length})
          </button>
          <button
            style={!canViewFinancials?{display:'none'}:undefined}
            onClick={() => setActiveTab('FINANCIAL')}
            className={`py-3 px-4 text-center border-b-2 whitespace-nowrap transition ${
              activeTab === 'FINANCIAL'
                ? 'border-indigo-600 text-indigo-600 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            3. Histórico Financeiro
          </button>
          <button
            onClick={() => setActiveTab('OBSERVATIONS')}
            className={`py-3 px-4 text-center border-b-2 whitespace-nowrap transition ${
              activeTab === 'OBSERVATIONS'
                ? 'border-indigo-600 text-indigo-600 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            4. Observações ({observations.length})
          </button>
          <button
            onClick={() => setActiveTab('AUDIT')}
            className={`py-3 px-4 text-center border-b-2 whitespace-nowrap transition ${
              activeTab === 'AUDIT'
                ? 'border-indigo-600 text-indigo-600 bg-white font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            5. Auditoria de Alterações ({auditLogs.length})
          </button>
        </div>

        {/* TAB BODY */}
        <div className="customer-profile-body flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-800">
          {/* TAB 1: OVERVIEW & CADASTRAL DETAILS */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* IDENTIFICATION BLOCK */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide border-b pb-1">
                    Dados de Identificação
                  </h3>
                  <div className="space-y-1">
                    <p>
                      <strong className="text-slate-600">Razão Social:</strong> {customer.name}
                    </p>
                    {customer.tradingName && (
                      <p>
                        <strong className="text-slate-600">Nome Fantasia:</strong> {customer.tradingName}
                      </p>
                    )}
                    <p>
                      <strong className="text-slate-600">CPF/CNPJ:</strong>{' '}
                      <span className="font-mono font-bold">{customer.cpfCnpj}</span>
                    </p>
                    {customer.stateRegistration && (
                      <p>
                        <strong className="text-slate-600">Inscrição Estadual:</strong> {customer.stateRegistration}
                      </p>
                    )}
                    {customer.municipalRegistration && (
                      <p>
                        <strong className="text-slate-600">Inscrição Municipal:</strong> {customer.municipalRegistration}
                      </p>
                    )}
                    {customer.contactPerson && (
                      <p>
                        <strong className="text-slate-600">Pessoa de Contato:</strong> {customer.contactPerson}
                      </p>
                    )}
                  </div>
                </div>

                {/* CONTACT & CHANNELS BLOCK */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide border-b pb-1">
                    Contatos & Preferências
                  </h3>
                  <div className="space-y-1">
                    <p className="flex items-center space-x-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <strong className="text-slate-600">Telefone Principal:</strong> {customer.phone}
                    </p>
                    <p className="flex items-center space-x-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                      <strong className="text-slate-600">WhatsApp:</strong> {customer.whatsapp || customer.phone}
                    </p>
                    {customer.secondaryPhone && (
                      <p>
                        <strong className="text-slate-600">Telefone Secundário:</strong> {customer.secondaryPhone}
                      </p>
                    )}
                    <p className="flex items-center space-x-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <strong className="text-slate-600">E-mail:</strong> {customer.email || 'Não informado'}
                    </p>
                    <p>
                      <strong className="text-slate-600">Canal Preferido:</strong>{' '}
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-bold rounded">
                        {customer.preferredContactMethod || 'WhatsApp'}
                      </span>
                    </p>
                  </div>
                </div>

                {/* ADDRESS BLOCK */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 md:col-span-2">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide border-b pb-1 flex items-center space-x-1">
                    <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Endereço Principal de Faturamento e Entrega</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <p>
                        <strong className="text-slate-600">Logradouro:</strong> {customer.street}, {customer.number}
                      </p>
                      {customer.complement && (
                        <p>
                          <strong className="text-slate-600">Complemento:</strong> {customer.complement}
                        </p>
                      )}
                      <p>
                        <strong className="text-slate-600">Bairro:</strong> {customer.neighborhood}
                      </p>
                    </div>
                    <div>
                      <p>
                        <strong className="text-slate-600">Cidade / UF:</strong> {customer.city} / {customer.state}
                      </p>
                      <p>
                        <strong className="text-slate-600">CEP:</strong>{' '}
                        <span className="font-mono">{customer.cep || 'Não informado'}</span>
                      </p>
                      {customer.landmark && (
                        <p>
                          <strong className="text-slate-600">Ref.:</strong> {customer.landmark}
                        </p>
                      )}
                    </div>
                    <div>
                      {customer.deliveryInstructions && (
                        <p className="text-xxs text-slate-600 bg-white p-2 rounded border border-slate-200">
                          <strong>Instruções de Entrega:</strong> {customer.deliveryInstructions}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTORIAL NOTES CARDS */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide border-b pb-1">
                  Observações de Setores Internos
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <span className="font-bold text-xxs uppercase text-slate-500 block mb-1">Geral</span>
                    <p className="text-slate-700">{customer.notes || 'Sem observações gerais.'}</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <span className="font-bold text-xxs uppercase text-indigo-600 block mb-1">Atendimento</span>
                    <p className="text-slate-700">{customer.attendantNotes || 'Sem observações.'}</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <span className="font-bold text-xxs uppercase text-purple-600 block mb-1">Arte-Final & Pré-impressão</span>
                    <p className="text-slate-700">{customer.artworkNotes || 'Sem observações.'}</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <span className="font-bold text-xxs uppercase text-blue-600 block mb-1">Produção & Impressão</span>
                    <p className="text-slate-700">{customer.productionNotes || 'Sem observações.'}</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <span className="font-bold text-xxs uppercase text-emerald-600 block mb-1">Acabamento</span>
                    <p className="text-slate-700">{customer.finishingNotes || 'Sem observações.'}</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <span className="font-bold text-xxs uppercase text-amber-700 block mb-1 flex items-center justify-between">
                      <span>Financeiro</span>
                      {!canViewFinancials && <Lock className="w-3 h-3 text-slate-400" />}
                    </span>
                    <p className="text-slate-700">
                      {canViewFinancials
                        ? customer.financialNotes || 'Sem observações financeiras.'
                        : '[Acesso restrito ao perfil financeiro]'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: OPERATIONAL HISTORY (QUOTATIONS & WORK ORDERS) */}
          {activeTab === 'OPERATIONAL' && (
            <div className="space-y-6">
              {/* WORK ORDERS LIST */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide flex items-center space-x-1.5">
                  <Briefcase className="w-4 h-4 text-indigo-600" />
                  <span>Ordens de Serviço ({custOS.length})</span>
                </h3>

                <div className="space-y-2">
                  {custOS.map((os) => (
                    <div key={os.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-mono font-bold text-indigo-900">{os.number}</span> -{' '}
                          <span className="font-bold text-slate-900">{os.serviceName}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-xxs font-bold bg-amber-100 text-amber-800">
                          {os.productionStatus}
                        </span>
                      </div>

                      <div className="text-xxs text-slate-600 flex flex-wrap justify-between gap-2">
                        <span>
                          <strong>Descrição:</strong> {os.description} ({os.dimensionsText})
                        </span>
                        <span>
                          <strong>Prazo:</strong> {formatDate(os.deadlineDate)}
                        </span>
                        <span className="font-mono font-bold text-slate-900">{canViewFinancials?formatCurrency(os.totalAmount):''}</span>
                      </div>
                    </div>
                  ))}

                  {custOS.length === 0 && (
                    <p className="text-slate-400 text-center py-4 bg-slate-50 rounded">Nenhuma ordem de serviço registrada.</p>
                  )}
                </div>
              </div>

              {/* QUOTATIONS LIST */}
              <div className="space-y-3 pt-4 border-t border-slate-200">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide flex items-center space-x-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>Orçamentos Emitidos ({custQuotes.length})</span>
                </h3>

                <div className="space-y-2">
                  {custQuotes.map((q) => (
                    <div key={q.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold text-indigo-900">{q.number}</span> -{' '}
                        <span className="font-bold text-slate-800">{q.serviceName}</span>
                        <p className="text-xxs text-slate-500">Emitido em {formatDate(q.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-slate-900 block">{formatCurrency(q.totalAmount)}</span>
                        <span className="px-2 py-0.5 rounded text-xxs font-bold bg-slate-200 text-slate-700">{q.status}</span>
                      </div>
                    </div>
                  ))}

                  {custQuotes.length === 0 && (
                    <p className="text-slate-400 text-center py-4 bg-slate-50 rounded">Nenhum orçamento registrado.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: FINANCIAL HISTORY */}
          {activeTab === 'FINANCIAL' && canViewFinancials && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-center">
                  <span className="block text-xxs text-indigo-700 font-bold uppercase">Total Comprado</span>
                  <span className="font-mono font-bold text-lg text-indigo-950">{canViewFinancials?formatCurrency(customer.totalPurchased || 0):'—'}</span>
                </div>
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                  <span className="block text-xxs text-emerald-700 font-bold uppercase">Total Pago</span>
                  <span className="font-mono font-bold text-lg text-emerald-950">{formatCurrency(customer.totalPaid || 0)}</span>
                </div>
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-center">
                  <span className="block text-xxs text-rose-700 font-bold uppercase">Saldo Pendente Atual</span>
                  <span className="font-mono font-bold text-lg text-rose-950">{canViewFinancials?formatCurrency(customer.pendingBalance || 0):'—'}</span>
                </div>
              </div>

              {/* RECEIPTS LIST */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide flex items-center space-x-1.5">
                  <ReceiptIcon className="w-4 h-4 text-emerald-600" />
                  <span>Recibos Emitidos ({custReceipts.length})</span>
                </h3>

                <div className="space-y-2">
                  {custReceipts.map((rec) => (
                    <div key={rec.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold text-emerald-800">{rec.number}</span> - {rec.referringTo}
                        <p className="text-xxs text-slate-500">
                          Data: {formatDate(rec.paymentDate)} | Forma: {rec.paymentMethod}
                        </p>
                      </div>
                      <span className="font-mono font-bold text-slate-900">{formatCurrency(rec.amount)}</span>
                    </div>
                  ))}

                  {custReceipts.length === 0 && (
                    <p className="text-slate-400 text-center py-4 bg-slate-50 rounded">Nenhum recibo emitido para este cliente.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: OBSERVATIONS HISTORY */}
          {activeTab === 'OBSERVATIONS' && (
            <div className="space-y-6">
              {/* ADD NEW OBSERVATION FORM */}
              <form onSubmit={handleCreateObs} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <span className="font-bold text-slate-800 text-xs uppercase tracking-wide block">Adicionar Nova Observação</span>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xxs font-bold text-slate-600 mb-1">Categoria *</label>
                    <select
                      value={newObsCategory}
                      onChange={(e) => setNewObsCategory(e.target.value as any)}
                      className="w-full border border-slate-300 rounded p-1.5 text-xs bg-white"
                    >
                      <option value="GERAL">Geral</option>
                      <option value="ATENDIMENTO">Atendimento</option>
                      <option value="ARTE">Arte & Pré-Impressão</option>
                      <option value="PRODUCAO">Produção & Impressão</option>
                      <option value="ACABAMENTO">Acabamento</option>
                      <option value="ENTREGA">Entrega</option>
                      <option value="FINANCEIRO">Financeiro</option>
                      <option value="AVISO_IMPORTANTE">Aviso Importante</option>
                    </select>
                  </div>

                  <div className="md:col-span-2 flex items-center space-x-4 pt-5">
                    <label className="flex items-center space-x-1.5 cursor-pointer text-xs font-bold text-amber-800">
                      <input
                        type="checkbox"
                        checked={newObsWarning}
                        onChange={(e) => setNewObsWarning(e.target.checked)}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span>Destacar como Aviso Importante</span>
                    </label>

                    <label className="flex items-center space-x-1.5 cursor-pointer text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={newObsInternal}
                        onChange={(e) => setNewObsInternal(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Apenas Uso Interno</span>
                    </label>
                  </div>

                  <div className="md:col-span-3">
                    <textarea
                      rows={2}
                      placeholder="Digite o texto da observação..."
                      value={newObsText}
                      onChange={(e) => setNewObsText(e.target.value)}
                      className="w-full border border-slate-300 rounded p-2 text-xs bg-white"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button type="submit" className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold text-xs">
                    Salvar Observação
                  </button>
                </div>
              </form>

              {/* OBSERVATIONS LIST */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                  Histórico de Observações ({observations.length})
                </h3>

                <div className="space-y-2">
                  {observations.map((obs) => (
                    <div
                      key={obs.id}
                      className={`p-3 rounded-xl border flex justify-between items-start space-x-3 ${
                        obs.isImportantWarning ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 rounded text-xxs font-bold uppercase bg-slate-100 text-slate-800">
                            {obs.category}
                          </span>
                          {obs.isImportantWarning && (
                            <span className="px-2 py-0.5 rounded text-xxs font-bold uppercase bg-amber-600 text-white">
                              Aviso Importante
                            </span>
                          )}
                          <span className="text-xxs text-slate-400 font-mono">
                            {formatDate(obs.createdAt)} - Por {obs.createdBy}
                          </span>
                        </div>
                        <p className="text-slate-800">{obs.text}</p>
                      </div>

                      {obs.status === 'ACTIVE' && (
                        <button
                          onClick={() => onArchiveObservation(obs.id, customer.id)}
                          className="text-slate-400 hover:text-slate-600 p-1"
                          title="Arquivar Observação"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}

                  {observations.length === 0 && (
                    <p className="text-slate-400 text-center py-4 bg-slate-50 rounded">Nenhuma observação registrada.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: AUDIT LOGS */}
          {activeTab === 'AUDIT' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                Histórico de Alterações e Auditoria ({auditLogs.length})
              </h3>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b text-slate-600 uppercase text-xxs font-bold">
                      <th className="p-2.5">Data / Hora</th>
                      <th className="p-2.5">Ação / Campo</th>
                      <th className="p-2.5">Valor Anterior</th>
                      <th className="p-2.5">Valor Novo</th>
                      <th className="p-2.5">Usuário</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-mono text-slate-500 text-xxs">{formatDate(log.timestamp)}</td>
                        <td className="p-2.5">
                          <span className="font-bold text-slate-900">{log.action}</span>
                          {log.changedField && <span className="text-slate-500 block text-xxs">{log.changedField}</span>}
                        </td>
                        <td className="p-2.5 text-slate-500 max-w-[150px] truncate">{log.oldValue || '-'}</td>
                        <td className="p-2.5 text-indigo-900 font-medium max-w-[150px] truncate">{log.newValue || '-'}</td>
                        <td className="p-2.5 text-slate-700 font-semibold">{log.user}</td>
                      </tr>
                    ))}

                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-400">
                          Nenhum registro de auditoria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   COMPONENT: WHATSAPP QUICK COMPOSER MODAL
   ========================================================================= */

interface WhatsAppComposerModalProps {
  customer: Customer;
  workOrders: WorkOrder[];
  quotations: Quotation[];
  preferReactivation?: boolean;
  onClose: () => void;
}

const WhatsAppComposerModal: React.FC<WhatsAppComposerModalProps> = ({ customer, workOrders, quotations, preferReactivation, onClose }) => {
  const normPhoneObj = normalizeBrazilianPhone(customer.whatsapp || customer.phone);
  const [templates] = useState(getMessageTemplates);
  const readyOrders = workOrders.filter(o => o.customerId === customer.id && o.productionStatus === 'AGUARDANDO_RETIRADA' && !o.quotationRevisionPending);
  const customerQuotes = quotations.filter(q => q.customerId === customer.id);
  const [orderId, setOrderId] = useState(readyOrders[0]?.id || '');
  const [quoteId, setQuoteId] = useState(customerQuotes[0]?.id || '');
  const [messageType, setMessageType] = useState(templates.bindings[preferReactivation ? 'REACTIVATION' : 'GREETING']);
  const selectedTemplate = templates.templates.find(t => t.id === messageType);
  const purpose = selectedTemplate?.purpose || 'GREETING';
  const draft = (id: string, nextOrderId = orderId, nextQuoteId = quoteId) => {
    const template = templates.templates.find(t => t.id === id);
    if (!template) return '';
    const orders = workOrders.filter(o => o.customerId === customer.id && o.productionStatus !== 'CANCELADO');
    return prepareMessage(template.purpose, templates, {
      customer, company: storage.getCompanySettings(), daysWithoutService: customerServiceRecency(customer.id, workOrders).days,
      order: template.purpose === 'PICKUP_READY' ? readyOrders.find(o => o.id === nextOrderId) : undefined,
      quotation: template.purpose === 'QUOTATION' ? customerQuotes.find(q => q.id === nextQuoteId) : undefined,
      paymentOptions: storage.getBudgetSettings().paymentTermsOptions,
      pendingBalance: orders.length ? orders.reduce((sum, o) => sum + pickupBalance(o), 0) : customer.pendingBalance,
    }, id);
  };
  const [customText, setCustomText] = useState(() => draft(messageType));
  const [opening, setOpening] = useState(false);
  const missingReference = purpose === 'PICKUP_READY' ? !readyOrders.some(o => o.id === orderId) : purpose === 'QUOTATION' ? !customerQuotes.some(q => q.id === quoteId) : false;

  const dialogRef=useRef<HTMLDivElement>(null),closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialogRef.current?.querySelector<HTMLElement>('select,textarea,button')?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeRef.current();return;}
      if(event.key!=='Tab')return;
      const controls=[...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select,textarea,input:not(:disabled)')||[])].filter(el=>el.offsetParent!==null),first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);previous?.focus();};
  },[]);
  const handleOpenWhatsAppLink = async () => {
    if (missingReference || !customText.trim()) return;
    setOpening(true);
    try {
      const result = await whatsappClient.sendWhatsAppMessage(customer.whatsapp || customer.phone, customText);
      if (result.ok) onClose();
    } finally { setOpening(false); }
  };

  return createPortal(
    <div className="nagano-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[90]">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Enviar mensagem ao cliente" className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="nagano-dialog-heading flex items-center justify-between border-b pb-3">
          <div className="flex items-center space-x-2 text-emerald-700">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-base text-slate-900">Enviar Mensagem no WhatsApp</h3>
          </div>
          <button aria-label="Fechar mensagem" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-950 space-y-1">
          <p>
            <strong>Destinatário:</strong> {customer.name}
          </p>
          <p>
            <strong>WhatsApp do cliente:</strong>{' '}
            <span className="font-mono">{customer.normalizedWhatsapp || normPhoneObj.normalizedPhone}</span>
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Selecionar Modelo de Mensagem:</label>
          <select
            value={messageType}
            aria-label="Modelo da mensagem"
            onChange={(e) => { setMessageType(e.target.value); setCustomText(draft(e.target.value)); }}
            className="w-full border border-slate-300 rounded p-2 text-xs bg-white cursor-pointer"
          >
            {templates.templates.map(t => <option key={t.id} value={t.id}>{t.name}{templates.bindings[t.purpose] === t.id ? ' (padrão)' : ''}</option>)}
            <option value="CUSTOM">Mensagem Personalizada</option>
          </select>
        </div>

        {purpose === 'PICKUP_READY' && <label className="block text-xs font-bold text-slate-700">Pedido pronto<select aria-label="Pedido pronto" value={orderId} onChange={e => { setOrderId(e.target.value); setCustomText(draft(messageType, e.target.value)); }} className="w-full border border-slate-300 rounded-lg p-2 mt-1 bg-white"><option value="">Selecione o pedido</option>{readyOrders.map(o => <option key={o.id} value={o.id}>{o.number} — {o.serviceName}</option>)}</select></label>}
        {purpose === 'QUOTATION' && <label className="block text-xs font-bold text-slate-700">Orçamento<select aria-label="Orçamento da mensagem" value={quoteId} onChange={e => { setQuoteId(e.target.value); setCustomText(draft(messageType, orderId, e.target.value)); }} className="w-full border border-slate-300 rounded-lg p-2 mt-1 bg-white"><option value="">Selecione o orçamento</option>{customerQuotes.map(q => <option key={q.id} value={q.id}>{q.number}</option>)}</select></label>}
        {missingReference && <p role="alert" className="text-xs text-amber-900">Selecione um {purpose === 'PICKUP_READY' ? 'pedido pronto para retirada' : 'orçamento'} deste cliente.</p>}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Conteúdo da Mensagem:</label>
          <textarea
            rows={4}
            value={customText}
            aria-label="Mensagem para o cliente"
            onChange={(e) => setCustomText(e.target.value)}
            className="w-full border border-slate-300 rounded p-2 text-xs"
          />
        </div>

        <div className="rounded-xl bg-emerald-50/50 border border-emerald-100 p-3 max-h-64 overflow-y-auto"><p className="text-xs font-bold text-emerald-900 mb-2">Prévia da mensagem</p><WhatsAppMessagePreview text={customText}/></div>
        <p className="text-xs text-slate-500">A mensagem substituirá o rascunho da conversa deste cliente. Confira e clique em Enviar no WhatsApp.</p>
        <div className="flex justify-end space-x-3 pt-3 border-t text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleOpenWhatsAppLink}
            disabled={opening || missingReference || !normPhoneObj.valid || !customText.trim()}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm flex items-center space-x-1.5 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{opening ? 'Preparando mensagem…' : 'Enviar mensagem'}</span>
          </button>
        </div>
      </div>
    </div>
  ,document.body);
};
