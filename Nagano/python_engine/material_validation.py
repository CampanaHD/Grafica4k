"""
Material Registration and Configuration Domain Module.
Handles validation, data structures, and business rules for:
- Material Configuration (definitions, allowed widths, pricing, volume discounts)
- Physical Inventory Separation (physical roll stock vs. material specification)
- Volume discount tier sorting and evaluation
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple

@dataclass
class MaterialDiscountTier:
    id: str
    minimum_area: float  # m²
    percentage: float    # 0 - 100
    active: bool = True

@dataclass
class MaterialConfig:
    id: str
    name: str
    code: str = ""
    category: str = "Lonas"
    control_type: str = "ROLL"         # "ROLL", "SHEET", "UNIT"
    calculation_unit: str = "M2"       # "M2", "UNIT", "LINEAR_METER", "SHEET"
    sale_price: float = 0.0
    reference_cost: Optional[float] = None
    active: bool = True
    allow_rotation: bool = True
    auto_find_lowest_cost: bool = True
    allow_manual_roll_override: bool = True
    allowed_roll_widths: List[float] = field(default_factory=list)
    volume_discount_enabled: bool = False
    discount_tiers: List[Dict[str, Any]] = field(default_factory=list)

@dataclass
class PhysicalRollRecord:
    id: str
    roll_code: str
    material_id: str
    width_m: float
    initial_length_m: float
    current_length_m: float
    batch_number: str = ""
    status: str = "IN_USE"

def normalize_width_m(w: float) -> float:
    """Normalizes a width to meters. If >= 10, treats as centimeters."""
    try:
        val = float(w)
        if val >= 10.0:
            return round(val / 100.0, 3)
        return round(val, 3)
    except (ValueError, TypeError):
        return 0.0

def validate_material_config(
    data: Dict[str, Any],
    existing_materials: Optional[List[Dict[str, Any]]] = None
) -> Tuple[bool, Optional[str]]:
    """
    Validates a material configuration dictionary.
    Returns (is_valid, error_message).
    """
    name = (data.get("name") or "").strip()
    if not name:
        return False, "O nome do material é obrigatório."

    control_type = (data.get("control_type") or data.get("controlType") or "ROLL").upper()
    valid_controls = ("ROLL", "SHEET", "UNIT")
    if control_type not in valid_controls:
        return False, f"Tipo de controle inválido: '{control_type}'. Permitidos: {', '.join(valid_controls)}."

    calc_unit = (data.get("calculation_unit") or data.get("calculationUnit") or data.get("unit") or "M2").strip()
    if not calc_unit:
        return False, "A unidade de cálculo é obrigatória."

    sale_price = data.get("sale_price") if data.get("sale_price") is not None else data.get("salePrice", data.get("sellingPriceSqm", 0.0))
    try:
        sp = float(sale_price)
        if sp < 0.0:
            return False, "O preço de venda não pode ser negativo."
    except (ValueError, TypeError):
        return False, "O preço de venda deve ser um número válido."

    ref_cost = data.get("reference_cost") if data.get("reference_cost") is not None else data.get("referenceCost", data.get("costPerSqm"))
    if ref_cost is not None and ref_cost != "":
        try:
            rc = float(ref_cost)
            if rc < 0.0:
                return False, "O custo de referência não pode ser negativo."
        except (ValueError, TypeError):
            return False, "O custo de referência deve ser um número válido."

    # Code uniqueness check
    code = (data.get("code") or "").strip().upper()
    mat_id = data.get("id")
    if code and existing_materials:
        for ex in existing_materials:
            if ex.get("id") != mat_id:
                ex_code = (ex.get("code") or "").strip().upper()
                if ex_code and ex_code == code:
                    return False, f"O código interno '{code}' já está em uso pelo material '{ex.get('name')}'."

    # ROLL specific validation
    if control_type == "ROLL":
        widths = data.get("allowed_roll_widths")
        if widths is None:
            widths = data.get("allowedRollWidths")
        if widths is None and "availableRolls" in data:
            widths = [r.get("widthCm") for r in data["availableRolls"] if r.get("widthCm") is not None]

        if not widths or len(widths) == 0:
            return False, "Para materiais do tipo BOBINA (ROLL), é obrigatório cadastrar pelo menos uma largura autorizada."

        seen_widths = set()
        for w in widths:
            try:
                w_float = float(w)
                if w_float <= 0.0:
                    return False, f"Largura autorizada inválida: {w}. Toda largura deve ser estritamente maior que zero."
                norm_w = normalize_width_m(w_float)
                if norm_w in seen_widths:
                    return False, f"Largura de bobina duplicada: {norm_w:.2f} m."
                seen_widths.add(norm_w)
            except (ValueError, TypeError):
                return False, f"Valor de largura inválido: {w}."

        # Volume discount tiers validation
        vol_enabled = bool(data.get("volume_discount_enabled") or data.get("volumeDiscountEnabled", False))
        tiers = data.get("discount_tiers") or data.get("discountTiers") or []
        if vol_enabled and tiers:
            seen_areas = set()
            for t in tiers:
                area_val = t.get("minimum_area") if t.get("minimum_area") is not None else t.get("minimumArea")
                pct_val = t.get("percentage") if t.get("percentage") is not None else t.get("discountPercentage", 0.0)

                try:
                    area = float(area_val)
                    if area < 0.0:
                        return False, f"A área mínima da faixa de desconto não pode ser negativa: {area_val}."
                except (ValueError, TypeError):
                    return False, f"Área mínima inválida: {area_val}."

                try:
                    pct = float(pct_val)
                    if pct < 0.0:
                        return False, f"O percentual de desconto não pode ser inferior a 0%: {pct_val}%."
                    if pct > 100.0:
                        return False, f"O percentual de desconto não pode ser superior a 100%: {pct_val}%."
                except (ValueError, TypeError):
                    return False, f"Percentual de desconto inválido: {pct_val}."

                rounded_area = round(area, 2)
                if rounded_area in seen_areas:
                    return False, f"Faixa de desconto duplicada para a área mínima de {rounded_area:.2f} m²."
                seen_areas.add(rounded_area)

    return True, None

def sort_discount_tiers(tiers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sorts discount tiers ascending by minimum area."""
    def get_area(t: Dict[str, Any]) -> float:
        val = t.get("minimum_area") if t.get("minimum_area") is not None else t.get("minimumArea", 0.0)
        try:
            return float(val)
        except (ValueError, TypeError):
            return 0.0
    return sorted(tiers, key=get_area)

def get_applicable_volume_discount(tiers: List[Dict[str, Any]], consumed_area_m2: float) -> float:
    """
    Returns the single highest qualified discount percentage for the consumed area (non-cumulative).
    """
    if not tiers or consumed_area_m2 <= 0:
        return 0.0

    sorted_tiers = sort_discount_tiers(tiers)
    best_pct = 0.0

    for t in sorted_tiers:
        if t.get("active", True) is False:
            continue
        area_val = t.get("minimum_area") if t.get("minimum_area") is not None else t.get("minimumArea", 0.0)
        pct_val = t.get("percentage") if t.get("percentage") is not None else t.get("discountPercentage", 0.0)
        try:
            area = float(area_val)
            pct = float(pct_val)
            if consumed_area_m2 >= area:
                best_pct = pct
        except (ValueError, TypeError):
            continue

    return max(0.0, min(100.0, best_pct))

def validate_physical_roll(roll: Dict[str, Any], material: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Validates whether a physical roll item conforms to the referenced material configuration.
    Ensures that physical roll inventory respects material configuration allowed widths.
    """
    if not material:
        return False, "Material referenciado não encontrado."

    control_type = (material.get("control_type") or material.get("controlType") or "ROLL").upper()
    if control_type != "ROLL":
        return False, f"O material '{material.get('name')}' não é do tipo BOBINA (Tipo: {control_type})."

    try:
        roll_width = float(roll.get("width_m") or roll.get("widthM") or 0.0)
        if roll_width <= 0.0:
            return False, "A largura do rolo físico deve ser estritamente positiva."
    except (ValueError, TypeError):
        return False, "Largura do rolo físico inválida."

    norm_roll_w = normalize_width_m(roll_width)

    allowed_raw = material.get("allowed_roll_widths") or material.get("allowedRollWidths") or []
    if not allowed_raw and "availableRolls" in material:
        allowed_raw = [r.get("widthCm") for r in material["availableRolls"] if r.get("widthCm")]

    allowed_normalized = [normalize_width_m(w) for w in allowed_raw]

    if not any(abs(w - norm_roll_w) < 0.001 for w in allowed_normalized):
        formatted_allowed = ", ".join(f"{w:.2f} m" for w in allowed_normalized)
        return False, f"A largura de {norm_roll_w:.2f} m não é autorizada para o material '{material.get('name')}'. Larguras permitidas: {formatted_allowed}."

    return True, None
