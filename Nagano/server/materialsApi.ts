import {requireCollectionActions} from './actionPermissions';
import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';

export interface MaterialDiscountTier {
  id: string;
  minimumArea: number;
  percentage: number;
  active?: boolean;
}

export interface MaterialRecord {
  availableSheets?: {id:string;name?:string;widthCm:number;heightCm:number;active:boolean}[];
  id: string;
  name: string;
  code?: string;
  category: string;
  controlType: 'ROLL' | 'SHEET' | 'UNIT';
  calculationUnit: 'M2' | 'UNIT' | 'LINEAR_METER' | 'SHEET';
  salePrice: number;
  referenceCost?: number;
  supplier: string;
  unit: string;
  active: boolean;
  allowedRollWidths: number[];
  allowRotation: boolean;
  autoFindLowestCost: boolean;
  allowManualRollOverride: boolean;
  volumeDiscountEnabled: boolean;
  discountTiers: MaterialDiscountTier[];
  costPerSqm: number;
  costPerLinm: number;
  sellingPriceSqm: number;
  minimumCharge: number;
  expectedWastePct: number;
  defaultReinforcementCm: number;
  defaultHemCm: number;
  defaultRodPocketCm: number;
  defaultBleedCm: number;
  defaultEdgeSafetyCm: number;
  availableRolls?: any[];
}

export interface PhysicalRollRecord {
  id: string;
  rollCode: string;
  materialId: string;
  materialName?: string;
  widthM: number;
  initialLengthM: number;
  currentLengthM: number;
  batchNumber?: string;
  location?: string;
  receivedAt?: string;
  status: 'IN_STOCK' | 'IN_USE' | 'DEPLETED';
}

const DATA_DIR = process.env.PRINTSHOP_DATA_DIR || path.join(process.cwd(), 'data');
const MATERIALS_FILE = path.join(DATA_DIR, 'materials.json');
const PHYSICAL_ROLLS_FILE = path.join(DATA_DIR, 'physical_rolls.json');

const INITIAL_MATERIALS: MaterialRecord[] = [
  {
    id: 'mat_lona440',
    name: 'Lona Frontlight 440g',
    code: 'LON-440',
    category: 'Lonas',
    controlType: 'ROLL',
    calculationUnit: 'M2',
    salePrice: 45.00,
    referenceCost: 18.50,
    supplier: 'SignSupply',
    unit: 'm²',
    costPerSqm: 18.50,
    costPerLinm: 25.00,
    sellingPriceSqm: 45.00,
    minimumCharge: 30.00,
    expectedWastePct: 8.0,
    defaultReinforcementCm: 5.0,
    defaultHemCm: 3.0,
    defaultRodPocketCm: 0.0,
    defaultBleedCm: 2.0,
    defaultEdgeSafetyCm: 2.0,
    active: true,
    allowedRollWidths: [80, 100, 120, 140, 160, 205, 220, 250, 320],
    allowRotation: true,
    autoFindLowestCost: true,
    allowManualRollOverride: true,
    volumeDiscountEnabled: true,
    discountTiers: [
      { id: 'dt1', minimumArea: 10, percentage: 5, active: true },
      { id: 'dt2', minimumArea: 25, percentage: 10, active: true },
      { id: 'dt3', minimumArea: 50, percentage: 15, active: true }
    ],
    availableRolls: [
      { id: 'r80', widthCm: 80, usableWidthCm: 76, costPerSqm: 18.50, costPerLinm: 14.80, active: true },
      { id: 'r100', widthCm: 100, usableWidthCm: 96, costPerSqm: 18.50, costPerLinm: 18.50, active: true },
      { id: 'r120', widthCm: 120, usableWidthCm: 116, costPerSqm: 18.50, costPerLinm: 22.20, active: true },
      { id: 'r140', widthCm: 140, usableWidthCm: 136, costPerSqm: 18.50, costPerLinm: 25.90, active: true },
      { id: 'r160', widthCm: 160, usableWidthCm: 156, costPerSqm: 18.50, costPerLinm: 29.60, active: true },
      { id: 'r205', widthCm: 205, usableWidthCm: 200, costPerSqm: 19.00, costPerLinm: 38.95, active: true },
      { id: 'r220', widthCm: 220, usableWidthCm: 215, costPerSqm: 19.50, costPerLinm: 42.90, active: true },
      { id: 'r250', widthCm: 250, usableWidthCm: 245, costPerSqm: 20.00, costPerLinm: 50.00, active: true },
      { id: 'r320', widthCm: 320, usableWidthCm: 312, costPerSqm: 22.00, costPerLinm: 70.40, active: true }
    ]
  },
  {
    id: 'mat_adesivo_vinil',
    name: 'Adesivo Vinil Polimérico Brilho 100u',
    code: 'ADB-BRILHO',
    category: 'Adesivos',
    controlType: 'ROLL',
    calculationUnit: 'M2',
    salePrice: 40.00,
    referenceCost: 15.00,
    supplier: 'Imprimax',
    unit: 'm²',
    costPerSqm: 15.00,
    costPerLinm: 18.00,
    sellingPriceSqm: 40.00,
    minimumCharge: 25.00,
    expectedWastePct: 5.0,
    defaultReinforcementCm: 0.0,
    defaultHemCm: 0.0,
    defaultRodPocketCm: 0.0,
    defaultBleedCm: 1.0,
    defaultEdgeSafetyCm: 1.5,
    active: true,
    allowedRollWidths: [100, 122, 152],
    allowRotation: true,
    autoFindLowestCost: true,
    allowManualRollOverride: true,
    volumeDiscountEnabled: true,
    discountTiers: [
      { id: 'dt_ad1', minimumArea: 10, percentage: 5, active: true },
      { id: 'dt_ad2', minimumArea: 30, percentage: 12, active: true }
    ],
    availableRolls: [
      { id: 'ra100', widthCm: 100, usableWidthCm: 97, costPerSqm: 15.00, costPerLinm: 15.00, active: true },
      { id: 'ra122', widthCm: 122, usableWidthCm: 119, costPerSqm: 15.00, costPerLinm: 18.30, active: true },
      { id: 'ra152', widthCm: 152, usableWidthCm: 148, costPerSqm: 15.00, costPerLinm: 22.80, active: true }
    ]
  },
  {
    id: 'mat_papel_couch300',
    name: 'Papel Couché 300g',
    code: 'PAP-COUCH300',
    category: 'Papéis',
    controlType: 'UNIT',
    calculationUnit: 'UNIT',
    salePrice: 20.00,
    referenceCost: 8.00,
    supplier: 'Suzano',
    unit: 'un',
    costPerSqm: 8.00,
    costPerLinm: 0,
    sellingPriceSqm: 20.00,
    minimumCharge: 50.00,
    expectedWastePct: 3.0,
    defaultReinforcementCm: 0.0,
    defaultHemCm: 0.0,
    defaultRodPocketCm: 0.0,
    defaultBleedCm: 0.3,
    defaultEdgeSafetyCm: 0.5,
    active: true,
    allowedRollWidths: [66],
    allowRotation: false,
    autoFindLowestCost: false,
    allowManualRollOverride: false,
    volumeDiscountEnabled: false,
    discountTiers: [],
    availableRolls: [
      { id: 'rp66', widthCm: 66, usableWidthCm: 64, costPerSqm: 8.00, costPerLinm: 5.28, active: true }
    ]
  }
];

const INITIAL_PHYSICAL_ROLLS: PhysicalRollRecord[] = [
  {
    id: 'proll_001',
    rollCode: 'AD-001',
    materialId: 'mat_adesivo_vinil',
    materialName: 'Adesivo Vinil Polimérico Brilho 100u',
    widthM: 1.52,
    initialLengthM: 50.00,
    currentLengthM: 32.40,
    batchNumber: 'IMP-2026-X1',
    location: 'Prateleira A2',
    receivedAt: '2026-07-10',
    status: 'IN_USE'
  },
  {
    id: 'proll_002',
    rollCode: 'LN-001',
    materialId: 'mat_lona440',
    materialName: 'Lona Frontlight 440g',
    widthM: 1.60,
    initialLengthM: 50.00,
    currentLengthM: 48.00,
    batchNumber: 'SS-440-99',
    location: 'Rack Lonas B1',
    receivedAt: '2026-07-25',
    status: 'IN_USE'
  }
];

// Helper functions for persistence
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch {
      // fallback in-memory
    }
  }
}

let materialDatabase: DatabaseSync;
function database() {
  if (!materialDatabase) {
    ensureDataDir();
    materialDatabase = new DatabaseSync(path.join(DATA_DIR, 'materials.sqlite'));
    materialDatabase.exec('CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    if (!materialDatabase.prepare("SELECT value FROM metadata WHERE key = 'initialized'").get()) {
      const initial = fs.existsSync(MATERIALS_FILE) ? JSON.parse(fs.readFileSync(MATERIALS_FILE, 'utf8')) : process.env.NAGANO_ALLOW_DEMO_DATA==='true'?INITIAL_MATERIALS:[];
      saveMaterials(initial);
    }
  }
  return materialDatabase;
}
function loadMaterials(): MaterialRecord[] {
  return database().prepare('SELECT payload FROM materials ORDER BY rowid').all().map(row => JSON.parse(String(row.payload)));
}
function saveMaterials(materials: MaterialRecord[]) {
  const db = database();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM materials');
    const insert = db.prepare('INSERT INTO materials (id, payload) VALUES (?, ?)');
    for (const material of materials) insert.run(material.id, JSON.stringify(material));
    db.exec("INSERT OR REPLACE INTO metadata (key, value) VALUES ('initialized', '1')");
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
function materialsRevision() {
  return crypto.createHash('sha256').update(JSON.stringify(materialsMemory)).digest('hex');
}

function loadPhysicalRolls(): PhysicalRollRecord[] {
  ensureDataDir();
  if (fs.existsSync(PHYSICAL_ROLLS_FILE)) {
    try {
      const data = fs.readFileSync(PHYSICAL_ROLLS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [...INITIAL_PHYSICAL_ROLLS];
    }
  }
  return [...INITIAL_PHYSICAL_ROLLS];
}

function savePhysicalRolls(rolls: PhysicalRollRecord[]) {
  ensureDataDir();
  try {
    fs.writeFileSync(PHYSICAL_ROLLS_FILE, JSON.stringify(rolls, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save physical rolls file:', err);
  }
}

let materialsMemory = loadMaterials();
let physicalRollsMemory = loadPhysicalRolls();
export function getStoredMaterial(id: string) {
  const row = database().prepare('SELECT payload FROM materials WHERE id=?').get(id);
  return row ? JSON.parse(String(row.payload)) : undefined;
}
export function getStoredMaterials() { return loadMaterials().map(m=>({...m,availableRolls:m.availableRolls??[]})); }

function normalizeWidthM(w: number): number {
  if (w >= 10) return Math.round((w / 100) * 100) / 100;
  return Math.round(w * 100) / 100;
}

export function validateMaterialPayload(
  data: Partial<MaterialRecord>,
  existing: MaterialRecord[]
): { valid: boolean; error?: string } {
  if (!data.name || data.name.trim().length === 0) {
    return { valid: false, error: 'O nome do material é obrigatório.' };
  }

  const controlType = data.controlType;
  if (!['ROLL', 'SHEET', 'UNIT'].includes(controlType)) {
    return { valid: false, error: `Tipo de controle inválido: ${controlType}. Permitidos: ROLL, SHEET, UNIT.` };
  }

  const calcUnit = data.calculationUnit;
  if (!['M2', 'UNIT', 'LINEAR_METER', 'SHEET'].includes(calcUnit)) {
    return { valid: false, error: 'A unidade de cálculo é obrigatória.' };
  }

  const salePrice = Number(data.salePrice !== undefined ? data.salePrice : data.sellingPriceSqm);
  if (!Number.isFinite(salePrice) || salePrice < 0) {
    return { valid: false, error: 'O preço de venda deve ser um número maior ou igual a zero.' };
  }

  if (data.referenceCost !== undefined && data.referenceCost !== null && data.referenceCost !== ('' as any)) {
    const rc = Number(data.referenceCost);
    if (!Number.isFinite(rc) || rc < 0) {
      return { valid: false, error: 'O custo de referência, se informado, deve ser maior ou igual a zero.' };
    }
  }

  // Code uniqueness
  if (data.code && data.code.trim().length > 0) {
    const trimmed = data.code.trim().toUpperCase();
    const duplicate = existing.find(m => m.id !== data.id && m.code && m.code.trim().toUpperCase() === trimmed);
    if (duplicate) {
      return { valid: false, error: `O código interno "${data.code}" já está em uso pelo material "${duplicate.name}".` };
    }
  }

  // ROLL validation
  if (controlType === 'ROLL') {
    const widths = data.allowedRollWidths || (data.availableRolls ? data.availableRolls.map(r => r.widthCm) : []);
    if ((!widths || widths.length === 0) && data.active !== false) {
      return { valid: false, error: 'Para materiais controlados por BOBINA (ROLL), é obrigatório cadastrar pelo menos uma largura autorizada.' };
    }

    const seenWidths = new Set<number>();
    for (const w of widths) {
      const num = Number(w);
      if (!Number.isFinite(num) || num <= 0 || !isFinite(num)) {
        return { valid: false, error: `A largura "${w}" é inválida. Toda largura autorizada deve ser maior que zero.` };
      }
      const norm = normalizeWidthM(num);
      if (seenWidths.has(norm)) {
        return { valid: false, error: `A largura ${norm.toFixed(2)} m está duplicada na configuração do material.` };
      }
      seenWidths.add(norm);
    }

    // Volume discount tiers
    if (data.volumeDiscountEnabled && data.discountTiers) {
      const seenAreas = new Set<number>();
      for (const t of data.discountTiers) {
        const area = Number(t.minimumArea);
        const pct = Number(t.percentage);
        if (!Number.isFinite(area) || area < 0) {
          return { valid: false, error: `Área mínima inválida: ${t.minimumArea}. Deve ser maior ou igual a zero.` };
        }
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
          return { valid: false, error: `Percentual de desconto inválido: ${t.percentage}%. Deve estar entre 0% e 100%.` };
        }
        const roundedArea = Math.round(area * 100) / 100;
        if (seenAreas.has(roundedArea)) {
          return { valid: false, error: `Existe mais de uma faixa de desconto configurada para a mesma área mínima de ${roundedArea} m².` };
        }
        seenAreas.add(roundedArea);
      }
    }
  }

  if(data.availableSheets!==undefined){
    if(!Array.isArray(data.availableSheets))return {valid:false,error:'Lista de chapas inválida.'};
    const ids=new Set<string>(),sizes=new Set<string>();
    for(const sheet of data.availableSheets){
      if(!sheet || typeof sheet.id!=='string'||ids.has(sheet.id)||!Number.isFinite(sheet.widthCm)||sheet.widthCm<=0||!Number.isFinite(sheet.heightCm)||sheet.heightCm<=0||typeof sheet.active!=='boolean')return {valid:false,error:'Confira a identificação e as medidas das chapas.'};
      const size=`${sheet.widthCm}x${sheet.heightCm}`;
      if(sizes.has(size))return {valid:false,error:'Existe uma chapa com estas medidas neste material.'};
      ids.add(sheet.id);sizes.add(size);
    }
  }
  return { valid: true };
}

export const materialsRouter = Router();
// Imports and automatic refresh write atomically from another repository connection.
materialsRouter.use((req, _res, next) => {
  if (req.path.startsWith('/api/materials')) materialsMemory = loadMaterials();
  next();
});

// GET all materials
materialsRouter.get('/api/materials', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: materialsMemory,
    total: materialsMemory.length,
    revision: materialsRevision()
  });
});

// Atomic configuration save; physical stock remains in its own repository.
materialsRouter.put('/api/materials', (req: Request, res: Response) => {
  const items = req.body.materials;
  if (!Array.isArray(items) || items.some(m => !m || typeof m.id !== 'string') || new Set(items.map(m => m.id)).size !== items.length) {
    return res.status(400).json({ success: false, error: 'Lista de materiais inválida.' });
  }
  if (req.body.revision !== materialsRevision()) return res.status(409).json({ success: false, error: 'Os materiais foram alterados em outra sessão. Atualize a página antes de salvar.' });
  try{requireCollectionActions((req as any).naganoProfile,'inventory',materialsMemory,items);}catch(e:any){return res.status(e.status||403).json({success:false,error:e.message});}
  for (const item of items) {
    const result = validateMaterialPayload(item, items);
    if (!result.valid) return res.status(400).json({ success: false, error: result.error });
  }
  try {
    saveMaterials(items);
    materialsMemory = items;
    return res.json({ success: true, data: materialsMemory, revision: materialsRevision() });
  } catch {
    return res.status(500).json({ success: false, error: 'Não foi possível salvar os materiais. Nenhuma alteração foi aplicada.' });
  }
});

// GET single material
materialsRouter.get('/api/materials/:id', (req: Request, res: Response) => {
  const mat = materialsMemory.find(m => m.id === req.params.id);
  if (!mat) {
    return res.status(404).json({ success: false, error: 'Material não encontrado.' });
  }
  res.json({ success: true, data: mat });
});

// POST create material
materialsRouter.post('/api/materials', (req: Request, res: Response) => {
  const payload = req.body;
  const validation = validateMaterialPayload(payload, materialsMemory);
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  const id = payload.id || `mat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const controlType = payload.controlType || 'ROLL';
  const calculationUnit = payload.calculationUnit || 'M2';
  const salePrice = Number(payload.salePrice ?? payload.sellingPriceSqm ?? 0);
  const referenceCost = payload.referenceCost !== undefined ? Number(payload.referenceCost) : Number(payload.costPerSqm ?? 0);
  const allowedRollWidths = controlType === 'ROLL' ? (payload.allowedRollWidths || [100, 120, 140, 160]) : [];

  const newMaterial: MaterialRecord = {
    ...payload,
    id,
    name: payload.name.trim(),
    code: (payload.code || '').trim().toUpperCase(),
    category: payload.category || 'Geral',
    controlType,
    calculationUnit,
    salePrice,
    referenceCost,
    supplier: payload.supplier || 'Padrão',
    unit: calculationUnit === 'UNIT' ? 'un' : calculationUnit === 'LINEAR_METER' ? 'm lin' : 'm²',
    active: payload.active !== undefined ? Boolean(payload.active) : true,
    allowedRollWidths,
    allowRotation: payload.allowRotation !== undefined ? Boolean(payload.allowRotation) : true,
    autoFindLowestCost: payload.autoFindLowestCost !== undefined ? Boolean(payload.autoFindLowestCost) : true,
    allowManualRollOverride: payload.allowManualRollOverride !== undefined ? Boolean(payload.allowManualRollOverride) : true,
    volumeDiscountEnabled: Boolean(payload.volumeDiscountEnabled),
    discountTiers: (payload.discountTiers || []).sort((a: any, b: any) => Number(a.minimumArea) - Number(b.minimumArea)),
    costPerSqm: referenceCost,
    costPerLinm: referenceCost,
    sellingPriceSqm: salePrice,
    minimumCharge: payload.minimumCharge ? Number(payload.minimumCharge) : 0,
    expectedWastePct: payload.expectedWastePct ? Number(payload.expectedWastePct) : 5,
    defaultReinforcementCm: payload.defaultReinforcementCm ? Number(payload.defaultReinforcementCm) : 0,
    defaultHemCm: payload.defaultHemCm ? Number(payload.defaultHemCm) : 0,
    defaultRodPocketCm: payload.defaultRodPocketCm ? Number(payload.defaultRodPocketCm) : 0,
    defaultBleedCm: payload.defaultBleedCm ? Number(payload.defaultBleedCm) : 0,
    defaultEdgeSafetyCm: payload.defaultEdgeSafetyCm ? Number(payload.defaultEdgeSafetyCm) : 0,
    availableRolls: allowedRollWidths.map((w: number) => ({
      id: `r_${w}_${Math.random().toString(36).substring(2, 5)}`,
      widthCm: w >= 10 ? w : Math.round(w * 100),
      usableWidthCm: (w >= 10 ? w : Math.round(w * 100)) - 4,
      costPerSqm: referenceCost,
      costPerLinm: referenceCost,
      active: true
    }))
  };

  materialsMemory.push(newMaterial);
  saveMaterials(materialsMemory);

  res.status(201).json({
    success: true,
    message: 'Material cadastrado com sucesso.',
    data: newMaterial
  });
});

// PUT update material
materialsRouter.put('/api/materials/:id', (req: Request, res: Response) => {
  const index = materialsMemory.findIndex(m => m.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Material não encontrado para atualização.' });
  }

  const payload = { ...req.body, id: req.params.id };
  const validation = validateMaterialPayload(payload, materialsMemory);
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  const existing = materialsMemory[index];
  const controlType = payload.controlType || existing.controlType || 'ROLL';
  const calculationUnit = payload.calculationUnit || existing.calculationUnit || 'M2';
  const salePrice = Number(payload.salePrice ?? payload.sellingPriceSqm ?? existing.salePrice);
  const referenceCost = payload.referenceCost !== undefined ? Number(payload.referenceCost) : (existing.referenceCost ?? existing.costPerSqm);
  const allowedRollWidths = controlType === 'ROLL'
    ? (payload.allowedRollWidths || existing.allowedRollWidths || [100, 120, 140, 160])
    : [];

  const updatedMaterial: MaterialRecord = {
    ...existing,
    ...payload,
    id: req.params.id,
    name: payload.name.trim(),
    code: (payload.code || '').trim().toUpperCase(),
    category: payload.category || existing.category,
    controlType,
    calculationUnit,
    salePrice,
    referenceCost,
    active: payload.active !== undefined ? Boolean(payload.active) : existing.active,
    allowedRollWidths,
    allowRotation: payload.allowRotation !== undefined ? Boolean(payload.allowRotation) : existing.allowRotation,
    autoFindLowestCost: payload.autoFindLowestCost !== undefined ? Boolean(payload.autoFindLowestCost) : existing.autoFindLowestCost,
    allowManualRollOverride: payload.allowManualRollOverride !== undefined ? Boolean(payload.allowManualRollOverride) : existing.allowManualRollOverride,
    volumeDiscountEnabled: Boolean(payload.volumeDiscountEnabled),
    discountTiers: (payload.discountTiers || []).sort((a: any, b: any) => Number(a.minimumArea) - Number(b.minimumArea)),
    costPerSqm: referenceCost,
    costPerLinm: referenceCost,
    sellingPriceSqm: salePrice
  };

  materialsMemory[index] = updatedMaterial;
  saveMaterials(materialsMemory);

  res.json({
    success: true,
    message: 'Material atualizado com sucesso.',
    data: updatedMaterial
  });
});

// PATCH toggle status
materialsRouter.patch('/api/materials/:id/status', (req: Request, res: Response) => {
  const mat = materialsMemory.find(m => m.id === req.params.id);
  if (!mat) {
    return res.status(404).json({ success: false, error: 'Material não encontrado.' });
  }

  const { active } = req.body;
  mat.active = active !== undefined ? Boolean(active) : !mat.active;
  saveMaterials(materialsMemory);

  res.json({
    success: true,
    message: `Material ${mat.active ? 'ativado' : 'desativado'} com sucesso.`,
    data: mat
  });
});

// DELETE material
materialsRouter.delete('/api/materials/:id', (req: Request, res: Response) => {
  const index = materialsMemory.findIndex(m => m.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Material não encontrado.' });
  }

  const removed = materialsMemory.splice(index, 1)[0];
  saveMaterials(materialsMemory);

  res.json({
    success: true,
    message: `Material "${removed.name}" removido com sucesso.`,
    data: removed
  });
});

// ==========================================
// PHYSICAL ROLL INVENTORY (SEPARATION OF CONCEPTS)
// ==========================================

// GET physical rolls
materialsRouter.get('/api/physical-rolls', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: physicalRollsMemory,
    total: physicalRollsMemory.length
  });
});

// POST register physical roll (validated against referenced material allowed widths)
materialsRouter.post('/api/physical-rolls', (req: Request, res: Response) => {
  const { rollCode, materialId, widthM, initialLengthM, currentLengthM, batchNumber, location } = req.body;

  if (!materialId) {
    return res.status(400).json({ success: false, error: 'O material referenciado é obrigatório.' });
  }

  const material = materialsMemory.find(m => m.id === materialId);
  if (!material) {
    return res.status(404).json({ success: false, error: 'Material referenciado não existe no cadastro.' });
  }

  if (material.controlType !== 'ROLL') {
    return res.status(400).json({ success: false, error: `O material "${material.name}" não é controlado por bobina.` });
  }

  const rollWidth = Number(widthM);
  if (isNaN(rollWidth) || rollWidth <= 0) {
    return res.status(400).json({ success: false, error: 'A largura do rolo físico deve ser maior que zero.' });
  }

  const normWidth = normalizeWidthM(rollWidth);
  const allowedNorm = (material.allowedRollWidths || []).map(normalizeWidthM);

  if (!allowedNorm.some(w => Math.abs(w - normWidth) < 0.001)) {
    return res.status(400).json({
      success: false,
      error: `A largura ${normWidth.toFixed(2)} m não é permitida para o material "${material.name}". Larguras autorizadas: ${allowedNorm.map(w => `${w.toFixed(2)} m`).join(', ')}.`
    });
  }

  const id = `proll_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
  const newRoll: PhysicalRollRecord = {
    id,
    rollCode: rollCode || `RL-${normWidth.toFixed(2).replace('.', '')}-${Math.floor(Math.random() * 1000)}`,
    materialId,
    materialName: material.name,
    widthM: normWidth,
    initialLengthM: Number(initialLengthM || 50),
    currentLengthM: Number(currentLengthM || initialLengthM || 50),
    batchNumber: batchNumber || '',
    location: location || '',
    receivedAt: new Date().toISOString().split('T')[0],
    status: 'IN_USE'
  };

  physicalRollsMemory.push(newRoll);
  savePhysicalRolls(physicalRollsMemory);

  res.status(201).json({
    success: true,
    message: 'Rolo físico registrado com sucesso no inventário.',
    data: newRoll
  });
});

