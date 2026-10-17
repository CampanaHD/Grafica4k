import { Material, MaterialDiscountTier, PhysicalRoll } from '../types';

/**
 * Normalizes width representation:
 * If value is >= 10, assume it's in centimeters and convert to meters (e.g. 160 -> 1.60).
 * Otherwise assume it's already in meters (e.g. 1.6 -> 1.60).
 */
export function normalizeWidthToMeters(value: number): number {
  const num = Number(value);
  if (isNaN(num) || num <= 0) return 0;
  if (num >= 10) {
    return Math.round((num / 100) * 100) / 100;
  }
  return Math.round(num * 100) / 100;
}

/**
 * Normalizes width to centimeters:
 * If value is < 10, assume it's in meters and convert to cm (e.g. 1.60 -> 160).
 * Otherwise assume it's in cm (e.g. 160 -> 160).
 */
export function normalizeWidthToCm(value: number): number {
  const num = Number(value);
  if (isNaN(num) || num <= 0) return 0;
  if (num < 10) {
    return Math.round(num * 100);
  }
  return Math.round(num);
}

export interface MaterialValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a material record according to business rules.
 */
export function validateMaterial(
  material: Partial<Material>,
  existingMaterials: Material[] = []
): MaterialValidationResult {
  const errors: string[] = [];

  // 1. Name validation
  if (!material.name || material.name.trim().length === 0) {
    errors.push('O Nome do material é obrigatório.');
  }

  // 2. Control Type validation
  const validControlTypes = ['ROLL', 'SHEET', 'UNIT'];
  const controlType = material.controlType;
  if (!validControlTypes.includes(controlType)) {
    errors.push(`Tipo de controle inválido: "${material.controlType}". Permitidos: ROLL, SHEET, UNIT.`);
  }

  // 3. Calculation Unit validation
  const validUnits = ['M2', 'UNIT', 'LINEAR_METER', 'SHEET', 'm²', 'un', 'm lin'];
  const calculationUnit = material.calculationUnit;
  if (!calculationUnit || !validUnits.includes(calculationUnit)) {
    errors.push('A Unidade de cálculo é obrigatória.');
  }

  // 4. Sale Price validation
  const salePrice = material.salePrice !== undefined ? material.salePrice : material.sellingPriceSqm;
  if (salePrice === undefined || salePrice === null || !Number.isFinite(Number(salePrice)) || Number(salePrice) < 0) {
    errors.push('O Preço de venda deve ser um valor numérico maior ou igual a zero.');
  }

  // 5. Reference Cost validation (optional, but if present must be >= 0)
  const referenceCost = material.referenceCost !== undefined ? material.referenceCost : material.costPerSqm;
  if (referenceCost !== undefined && referenceCost !== null && referenceCost !== ('' as any)) {
    if (!Number.isFinite(Number(referenceCost)) || Number(referenceCost) < 0) {
      errors.push('O Custo de referência, quando preenchido, deve ser maior ou igual a zero.');
    }
  }

  // 6. Internal Code Uniqueness (case-insensitive)
  if (material.code && material.code.trim().length > 0) {
    const trimmedCode = material.code.trim().toUpperCase();
    const duplicate = existingMaterials.find(
      (m) => m.id !== material.id && m.code && m.code.trim().toUpperCase() === trimmedCode
    );
    if (duplicate) {
      errors.push(`O código interno "${material.code}" já está em uso pelo material "${duplicate.name}".`);
    }
  }

  // 7. Roll-Specific Configuration
  if (controlType === 'ROLL') {
    // Determine allowed widths list
    const widths = material.allowedRollWidths !== undefined
      ? material.allowedRollWidths
      : material.availableRolls?.map((r) => r.widthCm) || [];

    if (widths.length === 0 && material.active !== false) {
      errors.push('Para materiais controlados por BOBINA (ROLL), é obrigatório cadastrar pelo menos uma largura autorizada.');
    } else {
      const seenWidths = new Set<number>();
      for (const w of widths) {
        const num = Number(w);
        if (isNaN(num) || num <= 0 || !isFinite(num)) {
          errors.push(`A largura "${w}" é inválida. Toda largura autorizada deve ser maior que zero.`);
        } else {
          const normMeters = normalizeWidthToMeters(num);
          if (seenWidths.has(normMeters)) {
            errors.push(`A largura ${normMeters.toFixed(2)} m está duplicada na configuração do material.`);
          } else {
            seenWidths.add(normMeters);
          }
        }
      }
    }

    // 8. Volume Discount Tiers Validation
    if (material.volumeDiscountEnabled && material.discountTiers) {
      const seenAreas = new Set<number>();
      for (const tier of material.discountTiers) {
        const area = Number(tier.minimumArea);
        const pct = Number(tier.percentage);

        if (isNaN(area) || area < 0 || !isFinite(area)) {
          errors.push(`Área mínima inválida na faixa de desconto: "${tier.minimumArea}". Deve ser >= 0.`);
        }
        if (isNaN(pct) || pct < 0 || pct > 100 || !isFinite(pct)) {
          errors.push(`Percentual de desconto inválido: "${tier.percentage}%". Deve estar entre 0% e 100%.`);
        }

        const roundedArea = Math.round(area * 100) / 100;
        if (seenAreas.has(roundedArea)) {
          errors.push(`Existe mais de uma faixa de desconto configurada para a mesma área mínima de ${roundedArea} m².`);
        } else {
          seenAreas.add(roundedArea);
        }
      }
    }
  }

  if(material.availableSheets!==undefined){
    if(!Array.isArray(material.availableSheets))errors.push('Lista de chapas inválida.');
    else {
      const ids=new Set<string>(),sizes=new Set<string>();
      for(const sheet of material.availableSheets){
        if(!sheet||!sheet.id||ids.has(sheet.id)||!Number.isFinite(sheet.widthCm)||sheet.widthCm<=0||!Number.isFinite(sheet.heightCm)||sheet.heightCm<=0)errors.push('Confira a identificação e as medidas das chapas.');
        else {const size=`${sheet.widthCm}x${sheet.heightCm}`;if(sizes.has(size))errors.push('Existe uma chapa com estas medidas neste material.');ids.add(sheet.id);sizes.add(size);}
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Returns discount tiers sorted ascending by minimum area.
 */
export function sortDiscountTiers(tiers: MaterialDiscountTier[] = []): MaterialDiscountTier[] {
  return [...tiers].sort((a, b) => Number(a.minimumArea) - Number(b.minimumArea));
}

/**
 * Finds the highest qualified discount tier for a given consumed area.
 * Follows the non-cumulative business rule (highest tier only).
 */
export function findApplicableMaterialDiscountTier(
  tiers: MaterialDiscountTier[] | undefined,
  totalConsumedAreaM2: number
): { tier: MaterialDiscountTier | null; percentage: number } {
  if (!tiers || tiers.length === 0 || totalConsumedAreaM2 <= 0) {
    return { tier: null, percentage: 0 };
  }

  const sorted = sortDiscountTiers(tiers.filter((t) => t.active !== false && t.minimumArea >= 0));
  const eligible = sorted.filter((t) => totalConsumedAreaM2 >= t.minimumArea);

  if (eligible.length === 0) {
    return { tier: null, percentage: 0 };
  }

  const bestTier = eligible[eligible.length - 1];
  return {
    tier: bestTier,
    percentage: Math.max(0, Math.min(100, Number(bestTier.percentage) || 0))
  };
}

/**
 * Validates whether a physical roll item is compatible with the referenced material configuration.
 * Ensures the physical roll width belongs to the allowed widths of the material.
 */
export function validatePhysicalRollAgainstMaterial(
  roll: Partial<PhysicalRoll>,
  material: Material
): { valid: boolean; error?: string } {
  if (!material) {
    return { valid: false, error: 'Material referenciado não encontrado.' };
  }

  if (material.controlType && material.controlType !== 'ROLL') {
    return { valid: false, error: `O material "${material.name}" não é controlado por bobina (Tipo: ${material.controlType}).` };
  }

  const rollWidthM = normalizeWidthToMeters(roll.widthM || 0);
  if (rollWidthM <= 0) {
    return { valid: false, error: 'A largura do rolo físico deve ser maior que zero.' };
  }

  const allowedWidthsM = (
    material.allowedRollWidths || material.availableRolls?.map((r) => r.widthCm) || []
  ).map(normalizeWidthToMeters);

  const isAllowed = allowedWidthsM.some((w) => Math.abs(w - rollWidthM) < 0.001);
  if (!isAllowed) {
    return {
      valid: false,
      error: `A largura ${rollWidthM.toFixed(2)} m não é permitida para o material "${material.name}". Larguras autorizadas: ${allowedWidthsM.map((w) => `${w.toFixed(2)} m`).join(', ')}.`
    };
  }

  return { valid: true };
}
