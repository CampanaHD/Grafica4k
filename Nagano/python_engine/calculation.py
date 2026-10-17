"""
Material and Roll Optimization Engine for Print Shop Management System.
Calculates exact material fit, allowances, layout arrangement, material waste,
and total pricing across multiple roll widths and orientations.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any

@dataclass
class Allowances:
    reinforcement_cm: float = 0.0  # Reforço
    hem_cm: float = 0.0            # Bainha
    rod_pocket_cm: float = 0.0     # Bolsa de bastão
    bleed_cm: float = 0.0          # Sangria geral
    edge_safety_cm: float = 0.0    # Margem de segurança da bobina
    print_margin_cm: float = 0.0   # Margem de impressão
    extra_width_cm: Optional[float] = None  # Direct override for extra width (cm)
    extra_height_cm: Optional[float] = None # Direct override for extra height (cm)
    left_cm: float = 0.0
    right_cm: float = 0.0
    top_cm: float = 0.0
    bottom_cm: float = 0.0
    bleed_left_cm: float = 0.0
    bleed_right_cm: float = 0.0
    bleed_top_cm: float = 0.0
    bleed_bottom_cm: float = 0.0
    overflow_value_cm: float = 0.0
    overflow_top: bool = False
    overflow_bottom: bool = False
    overflow_left: bool = False
    overflow_right: bool = False
    is_per_side_set: bool = False

    @property
    def total_extra_width_cm(self) -> float:
        """Total extra width added to each piece (both sides)."""
        if self.extra_width_cm is not None:
            return self.extra_width_cm
        # Check explicit bleed left/right
        if self.bleed_left_cm > 0 or self.bleed_right_cm > 0:
            return self.bleed_left_cm + self.bleed_right_cm
        if self.is_per_side_set or self.overflow_value_cm > 0 or self.left_cm > 0 or self.right_cm > 0:
            l = self.overflow_value_cm if self.overflow_left else self.left_cm
            r = self.overflow_value_cm if self.overflow_right else self.right_cm
            return l + r
        return (self.reinforcement_cm + self.hem_cm + self.bleed_cm) * 2

    @property
    def total_extra_height_cm(self) -> float:
        """Total extra height added to each piece (both sides)."""
        if self.extra_height_cm is not None:
            return self.extra_height_cm
        # Check explicit bleed top/bottom
        if self.bleed_top_cm > 0 or self.bleed_bottom_cm > 0:
            return self.bleed_top_cm + self.bleed_bottom_cm
        if self.is_per_side_set or self.overflow_value_cm > 0 or self.top_cm > 0 or self.bottom_cm > 0:
            t = self.overflow_value_cm if self.overflow_top else self.top_cm
            b = self.overflow_value_cm if self.overflow_bottom else self.bottom_cm
            return t + b
        return (self.reinforcement_cm + self.hem_cm + self.rod_pocket_cm + self.bleed_cm) * 2

@dataclass
class RollWidthOption:
    width_cm: float
    usable_width_cm: Optional[float] = None
    cost_per_sqm: float = 0.0
    cost_per_linm: float = 0.0
    selling_price_sqm: Optional[float] = None
    selling_price_linm: Optional[float] = None
    active: bool = True
    id: str = ""
    name: str = ""

    def get_effective_usable_width(self, safety_margin_cm: float = 0.0) -> float:
        if self.usable_width_cm and self.usable_width_cm > 0:
            return self.usable_width_cm - safety_margin_cm
        return self.width_cm - safety_margin_cm

@dataclass
class OptimizationRequest:
    finished_width_cm: float
    finished_height_cm: float
    quantity: int
    requested_orientation: str = "AUTO"  # "HORIZONTAL", "VERTICAL", or "AUTO"
    allowances: Allowances = field(default_factory=Allowances)
    available_rolls: List[RollWidthOption] = field(default_factory=list)
    cost_per_sqm: float = 25.0
    price_per_sqm: Optional[float] = None
    price_per_linear_meter: Optional[float] = None # Selling price per linear meter
    finishing_cost: float = 0.0
    installation_cost: float = 0.0
    design_cost: float = 0.0
    delivery_cost: float = 0.0
    markup_percentage: float = 100.0  # e.g. 100% markup
    discount_amount: float = 0.0
    minimum_charge: float = 0.0
    setup_charge: float = 0.0
    pricing_method: str = "POR_METRO_LINEAR"  # Pricing method
    billable_width_base: str = "TOTAL_ROLL_WIDTH"  # "TOTAL_ROLL_WIDTH", "USABLE_ROLL_WIDTH", or "PRODUCTION_WIDTH"
    allows_side_by_side: bool = True
    allow_rotation: bool = True
    volume_discount_tiers: List[Dict[str, Any]] = field(default_factory=list)

@dataclass
class CalculationResult:
    roll_width_cm: float
    usable_roll_width_cm: float
    billable_width_cm: float
    orientation: str  # "HORIZONTAL" or "VERTICAL"
    fits: bool
    rejection_reason: Optional[str]
    production_width_cm: float
    production_height_cm: float
    units_across: int
    rows_needed: int
    linear_meters_needed: float
    total_sqm_used: float
    billable_area_m2: float
    net_sqm_printed: float
    waste_sqm: float
    waste_percentage: float
    material_cost: float
    finishing_cost: float
    installation_cost: float
    design_cost: float
    delivery_cost: float
    setup_charge: float
    total_base_cost: float
    subtotal_price: float
    discount_amount: float
    minimum_charge_applied: bool
    final_price: float
    explanation: str
    required_width_cm: float = 0.0
    used_length_cm: float = 0.0
    area_per_unit_m2: float = 0.0
    gross_unit_price: float = 0.0
    gross_total_price: float = 0.0
    total_calculated_area_m2: float = 0.0
    discount_percentage: float = 0.0
    discount_value: float = 0.0

class ValidationResult(tuple):
    def __new__(cls, valid: bool, error: Optional[str] = None):
        return super().__new__(cls, (valid, error))
    @property
    def valid(self) -> bool:
        return self[0]
    @property
    def error(self) -> Optional[str]:
        return self[1]
    def __getitem__(self, item):
        if item == "valid":
            return self[0]
        if item == "error":
            return self[1]
        return super().__getitem__(item)
    def get(self, key: str, default=None):
        if key == "valid":
            return self[0]
        if key == "error":
            return self[1]
        return default

def validate_roll_override(
    arg1: float,
    arg2: Any = None,
    available_rolls: Optional[List[RollWidthOption]] = None,
    edge_safety_cm: float = 0.0
) -> ValidationResult:
    """
    Validates if a manual roll selection is compatible.
    Can be called as:
      validate_roll_override(selected_roll_width_cm, all_options)
    or
      validate_roll_override(required_width_cm, selected_roll_width_cm, available_rolls, edge_safety_cm)
    """
    if isinstance(arg2, (list, tuple)):
        selected_width = float(arg1)
        options = arg2
        match = next((o for o in options if (o.get("roll_width_cm") == selected_width or o.get("rollWidthCm") == selected_width)), None)
        if not match:
            return ValidationResult(False, f"Bobina de {selected_width:.0f} cm não encontrada nas opções.")
        if not match.get("fits", False):
            return ValidationResult(False, match.get("rejection_reason") or match.get("explanation") or f"Bobina de {selected_width:.0f} cm não comporta a largura de produção.")
        return ValidationResult(True, None)

    required_width_cm = float(arg1)
    selected_roll_width_cm = float(arg2) if arg2 is not None else 0.0

    if available_rolls:
        roll = next((r for r in available_rolls if r.width_cm == selected_roll_width_cm and r.active), None)
        if not roll:
            return ValidationResult(False, f"Bobina de {selected_roll_width_cm:.0f} cm não está cadastrada ou não está ativa.")
        usable_w = roll.get_effective_usable_width(edge_safety_cm)
    else:
        usable_w = selected_roll_width_cm - edge_safety_cm

    if required_width_cm > usable_w:
        return ValidationResult(False, f"A bobina de {selected_roll_width_cm:.0f} cm (largura útil de {usable_w:.1f} cm) não comporta a largura de produção de {required_width_cm:.1f} cm.")
    return ValidationResult(True, None)

def create_roll_override_audit_log(
    quotation_id: Optional[str] = None,
    item_id: Optional[str] = None,
    user: str = "sistema",
    previous_roll_width_cm: Optional[float] = None,
    new_roll_width_cm: Optional[float] = None,
    previous_orientation: Optional[str] = None,
    new_orientation: Optional[str] = None,
    previous_price: Optional[float] = None,
    new_price: Optional[float] = None,
    reason: str = "",
    recommended_result: Optional[Dict[str, Any]] = None,
    selected_roll_width_cm: Optional[float] = None,
    selected_orientation: Optional[str] = None,
    all_options: Optional[List[Dict[str, Any]]] = None,
    **kwargs
) -> Dict[str, Any]:
    import time
    from datetime import datetime

    prev_roll = previous_roll_width_cm
    prev_orient = previous_orientation
    prev_p = previous_price
    new_roll = new_roll_width_cm or selected_roll_width_cm or 0.0
    new_orient = new_orientation or selected_orientation or "HORIZONTAL"
    new_p = new_price

    if recommended_result:
        prev_roll = prev_roll or recommended_result.get("roll_width_cm") or recommended_result.get("recommendedRollWidthCm") or 0.0
        prev_orient = prev_orient or recommended_result.get("orientation") or "HORIZONTAL"
        prev_p = prev_p if prev_p is not None else recommended_result.get("final_price") or recommended_result.get("finalPrice") or 0.0

    if (new_p is None or new_p == 0.0) and all_options:
        matching = next((o for o in all_options if (o.get("roll_width_cm") == new_roll or o.get("rollWidthCm") == new_roll)), None)
        if matching:
            new_p = matching.get("final_price") or matching.get("finalPrice") or 0.0

    new_p = new_p or 0.0
    prev_p = prev_p or 0.0
    prev_roll = prev_roll or 0.0
    prev_orient = prev_orient or "HORIZONTAL"

    return {
        "id": f"audit_roll_{int(time.time() * 1000)}",
        "quotation_id": quotation_id,
        "quotationId": quotation_id,
        "item_id": item_id,
        "itemId": item_id,
        "timestamp": datetime.now().isoformat(),
        "user": user,
        "action": "MANUAL_OVERRIDE",
        "previous_roll_width_cm": prev_roll,
        "previousRollWidthCm": prev_roll,
        "new_roll_width_cm": new_roll,
        "newRollWidthCm": new_roll,
        "previous_orientation": prev_orient,
        "previousOrientation": prev_orient,
        "previous_final_price": prev_p,
        "previousFinalPrice": prev_p,
        "new_final_price": new_p,
        "newFinalPrice": new_p,
        "reason": reason
    }

def calculate_roll_optimization(req: OptimizationRequest) -> Dict[str, Any]:
    """
    Evaluates every available roll width and orientation to select the optimal roll.
    Formula:
      Area = RollWidth (m) * UsedLength (m)
      Gross Unit Price = Area * PricePerSqm
      Gross Total = Gross Unit Price * Quantity
      Volume Discount: calculated on actual consumed roll area (total_calculated_area)
    """
    if req.quantity <= 0 or req.finished_width_cm <= 0 or req.finished_height_cm <= 0:
        return {
            "success": False,
            "error": "Dimensões e quantidade devem ser maiores que zero.",
            "recommended": None,
            "all_options": []
        }

    # Calculate production dimensions including allowances
    total_extra_w = req.allowances.total_extra_width_cm
    total_extra_h = req.allowances.total_extra_height_cm

    prod_width_horiz = req.finished_width_cm + total_extra_w
    prod_height_horiz = req.finished_height_cm + total_extra_h

    evaluated_results: List[CalculationResult] = []

    orientations = []
    if not req.allow_rotation or req.requested_orientation.upper() == "HORIZONTAL":
        orientations = ["HORIZONTAL"]
    elif req.requested_orientation.upper() == "VERTICAL":
        orientations = ["VERTICAL"]
    else:
        orientations = ["HORIZONTAL", "VERTICAL"]

    for roll in req.available_rolls:
        if not roll.active:
            continue

        usable_w = roll.get_effective_usable_width(req.allowances.edge_safety_cm)

        for orient in orientations:
            if orient == "HORIZONTAL":
                piece_w = prod_width_horiz
                piece_h = prod_height_horiz
            else: # VERTICAL (rotated)
                piece_w = prod_height_horiz
                piece_h = prod_width_horiz

            # Check fit
            if piece_w > usable_w:
                reason = (
                    f"A largura de produção de {piece_w:.1f} cm (incluindo folgas/reforço de {total_extra_w:.1f} cm) "
                    f"excede a largura útil da bobina de {usable_w:.1f} cm (bobina total de {roll.width_cm:.1f} cm)."
                )
                evaluated_results.append(CalculationResult(
                    roll_width_cm=roll.width_cm,
                    usable_roll_width_cm=usable_w,
                    billable_width_cm=roll.width_cm,
                    orientation=orient,
                    fits=False,
                    rejection_reason=reason,
                    production_width_cm=piece_w,
                    production_height_cm=piece_h,
                    units_across=0,
                    rows_needed=0,
                    linear_meters_needed=0.0,
                    total_sqm_used=0.0,
                    billable_area_m2=0.0,
                    net_sqm_printed=0.0,
                    waste_sqm=0.0,
                    waste_percentage=0.0,
                    material_cost=0.0,
                    finishing_cost=0.0,
                    installation_cost=0.0,
                    design_cost=0.0,
                    delivery_cost=0.0,
                    setup_charge=0.0,
                    total_base_cost=0.0,
                    subtotal_price=0.0,
                    discount_amount=0.0,
                    minimum_charge_applied=False,
                    final_price=0.0,
                    explanation=f"Rejeitada: {reason}",
                    required_width_cm=piece_w,
                    used_length_cm=piece_h,
                    area_per_unit_m2=0.0,
                    gross_unit_price=0.0,
                    gross_total_price=0.0,
                    total_calculated_area_m2=0.0,
                    discount_percentage=0.0,
                    discount_value=0.0
                ))
                continue

            # Units that fit across the roll
            if req.allows_side_by_side:
                units_across = int(usable_w // piece_w)
            else:
                units_across = 1

            if units_across <= 0:
                units_across = 1

            rows_needed = (req.quantity + units_across - 1) // units_across
            linear_cm = rows_needed * piece_h
            linear_m = linear_cm / 100.0

            # Determine billable width in cm & m
            if req.billable_width_base == "USABLE_ROLL_WIDTH":
                billable_width_cm = usable_w
            elif req.billable_width_base == "PRODUCTION_WIDTH":
                billable_width_cm = piece_w * units_across
            else:  # "TOTAL_ROLL_WIDTH"
                billable_width_cm = roll.width_cm

            billable_width_m = billable_width_cm / 100.0
            total_sqm_used = (roll.width_cm / 100.0) * linear_m
            billable_area_m2 = billable_width_m * linear_m

            # Per-unit area and prices
            area_per_unit = (roll.width_cm / 100.0) * (piece_h / 100.0)

            net_sqm_printed = (req.finished_width_cm / 100.0) * (req.finished_height_cm / 100.0) * req.quantity
            waste_sqm = max(0.0, total_sqm_used - net_sqm_printed)
            waste_pct = (waste_sqm / total_sqm_used * 100.0) if total_sqm_used > 0 else 0.0

            cost_sqm = roll.cost_per_sqm if roll.cost_per_sqm > 0 else req.cost_per_sqm
            material_cost = total_sqm_used * cost_sqm

            total_base_cost = material_cost + req.finishing_cost + req.installation_cost + req.design_cost + req.delivery_cost + req.setup_charge

            configured_price = (
                roll.selling_price_sqm
                or roll.selling_price_linm
                or req.price_per_sqm
                or req.price_per_linear_meter
                or 80.0
            )

            gross_unit_price = round(area_per_unit * configured_price, 4)
            if req.pricing_method in ["POR_AREA_CONSUMIDA_BOBINA", "ROLL", "AREA_CONSUMIDA"] or not req.allows_side_by_side:
                total_calculated_area = round(area_per_unit * req.quantity, 4)
                gross_total_price = round(area_per_unit * req.quantity * configured_price, 2)
                printing_price = gross_total_price
                total_sqm_used = total_calculated_area
            else:
                total_calculated_area = round(total_sqm_used, 4)
                printing_price = billable_width_m * linear_m * configured_price
                gross_total_price = printing_price

            # Volume discount tiers based on actual consumed roll area (total_sqm_used)
            applied_discount_pct = 0.0
            discount_from_tiers = 0.0
            if req.volume_discount_tiers:
                qualified_tiers = []
                for tier in req.volume_discount_tiers:
                    if tier.get("active", True) is False:
                        continue
                    threshold = float(
                        tier.get("minimum_area")
                        or tier.get("minimumArea")
                        or tier.get("minimum_area_sqm")
                        or tier.get("minimum_quantity")
                        or tier.get("min_area")
                        or tier.get("minimumQuantity")
                        or tier.get("min_qty")
                        or 0.0
                    )
                    pct = float(
                        tier.get("discount_percentage")
                        or tier.get("discountPercentage")
                        or tier.get("percentage")
                        or 0.0
                    )
                    if total_sqm_used >= threshold and threshold > 0:
                        qualified_tiers.append((threshold, pct))
                if qualified_tiers:
                    qualified_tiers.sort(key=lambda x: x[0], reverse=True)
                    applied_discount_pct = qualified_tiers[0][1]
                    discount_from_tiers = round(gross_total_price * (applied_discount_pct / 100.0), 2)

            total_item_discount = round(discount_from_tiers + req.discount_amount, 2)
            calculated_price = printing_price + req.finishing_cost + req.installation_cost + req.design_cost + req.delivery_cost + req.setup_charge

            # Minimum charge check
            minimum_applied = False
            if calculated_price < req.minimum_charge:
                calculated_price = req.minimum_charge
                minimum_applied = True

            final_price = max(0.0, round(calculated_price - total_item_discount, 2))

            explanation = (
                f"Bobina de {roll.width_cm:.0f} cm ({orient}): Peça de {piece_w:.1f}×{piece_h:.1f} cm. "
                f"Couve {units_across} un. na largura em {rows_needed} fila(s). "
                f"Fórmula: {billable_width_m:.2f}m (boca) × {linear_m:.2f}m (comprimento) × R$ {configured_price:.2f} = R$ {printing_price:.2f}."
                f"{' [Valor mínimo aplicado]' if minimum_applied else ''}"
                f"{f' [Desconto volume: {applied_discount_pct:.0f}% = R$ {discount_from_tiers:.2f}]' if discount_from_tiers > 0 else ''}"
            )

            evaluated_results.append(CalculationResult(
                roll_width_cm=roll.width_cm,
                usable_roll_width_cm=usable_w,
                billable_width_cm=billable_width_cm,
                orientation=orient,
                fits=True,
                rejection_reason=None,
                production_width_cm=piece_w,
                production_height_cm=piece_h,
                units_across=units_across,
                rows_needed=rows_needed,
                linear_meters_needed=linear_m,
                total_sqm_used=total_sqm_used,
                billable_area_m2=billable_area_m2,
                net_sqm_printed=net_sqm_printed,
                waste_sqm=waste_sqm,
                waste_percentage=waste_pct,
                material_cost=material_cost,
                finishing_cost=req.finishing_cost,
                installation_cost=req.installation_cost,
                design_cost=req.design_cost,
                delivery_cost=req.delivery_cost,
                setup_charge=req.setup_charge,
                total_base_cost=total_base_cost,
                subtotal_price=calculated_price,
                discount_amount=total_item_discount,
                minimum_charge_applied=minimum_applied,
                final_price=final_price,
                explanation=explanation,
                required_width_cm=piece_w,
                used_length_cm=piece_h,
                area_per_unit_m2=round(area_per_unit, 4),
                gross_unit_price=gross_unit_price,
                gross_total_price=round(gross_total_price, 2),
                total_calculated_area_m2=round(total_sqm_used, 4),
                discount_percentage=applied_discount_pct,
                discount_value=discount_from_tiers
            ))

    valid_options = [r for r in evaluated_results if r.fits]
    if not valid_options:
        max_available = max([r.width_cm for r in req.available_rolls if r.active], default=0.0)
        min_needed = min(prod_width_horiz, prod_height_horiz) if req.allow_rotation else prod_width_horiz
        return {
            "success": False,
            "error": f"Nenhuma bobina disponível para este material comporta a largura de produção de {min_needed / 100.0:.2f} m ({min_needed:.1f} cm). Maior bobina ativa cadastrada: {max_available / 100.0:.2f} m ({max_available:.0f} cm).",
            "recommended": None,
            "all_options": [r.__dict__ for r in evaluated_results]
        }

    # Prioritization logic:
    # 1. Lowest gross unit price before volume discount
    # 2. Lowest area per unit (or total sqm used)
    # 3. Smallest sufficient roll width
    # 4. Normal orientation first ("HORIZONTAL" before "VERTICAL")
    valid_options.sort(key=lambda r: (
        round(r.gross_unit_price, 4),
        round(r.area_per_unit_m2, 4),
        r.roll_width_cm,
        0 if r.orientation == "HORIZONTAL" else 1
    ))

    recommended = valid_options[0]

    return {
        "success": True,
        "recommended": recommended.__dict__,
        "all_options": [r.__dict__ for r in evaluated_results]
    }


def calculate_roll_material_price(
    finished_width_cm: float,
    finished_height_cm: float,
    quantity: int = 1,
    available_rolls: Optional[List[Any]] = None,
    price_per_sqm: float = 60.0,
    allow_rotation: bool = True,
    requested_orientation: str = "AUTO",
    bleed_left_cm: float = 0.0,
    bleed_right_cm: float = 0.0,
    bleed_top_cm: float = 0.0,
    bleed_bottom_cm: float = 0.0,
    volume_discount_tiers: Optional[List[Dict[str, Any]]] = None,
    manual_selected_roll_width_cm: Optional[float] = None,
    manual_selected_orientation: Optional[str] = None,
    user_name: str = "Operador"
) -> Dict[str, Any]:
    """
    Automatic pricing rule for materials configured as CALCULATION TYPE = ROLL.
    Calculates item price based on the ACTUAL ROLL WIDTH consumed:
      Area Per Unit = Roll Width (m) * Used Length (m)
      Gross Unit Price = Area Per Unit * Price per m²
      Total Calculated Area = Area Per Unit * Quantity
      Gross Total = Gross Unit Price * Quantity
      Volume Discount: evaluated on Total Calculated Area (only highest qualified tier applied)
      Final Total = Gross Total - Discount Value
    """
    if quantity <= 0 or finished_width_cm <= 0 or finished_height_cm <= 0:
        return {
            "success": False,
            "error": "Dimensões e quantidade devem ser maiores que zero.",
            "recommended": None,
            "all_options": []
        }

    # Apply bleed to calculate production dimensions
    prod_width_cm = round(finished_width_cm + bleed_left_cm + bleed_right_cm, 2)
    prod_height_cm = round(finished_height_cm + bleed_top_cm + bleed_bottom_cm, 2)

    # Normalize available rolls
    rolls_to_process = []
    if available_rolls is None or len(available_rolls) == 0:
        # Standard default roll widths in meters
        default_widths = [1.40, 1.60, 1.80, 2.05, 2.20, 2.50, 3.20]
        rolls_to_process = [RollWidthOption(width_cm=w * 100.0, name=f"Bobina {w:.2f}m") for w in default_widths]
    else:
        for r in available_rolls:
            if isinstance(r, (int, float)):
                w_cm = r * 100.0 if r <= 10.0 else float(r)
                rolls_to_process.append(RollWidthOption(width_cm=w_cm, name=f"Bobina {w_cm/100:.2f}m"))
            elif isinstance(r, RollWidthOption):
                rolls_to_process.append(r)
            elif isinstance(r, dict):
                w = float(r.get("width_cm") or (float(r.get("width_m", 0)) * 100.0) or (float(r.get("width", 0)) * 100.0 if float(r.get("width", 0)) <= 10.0 else float(r.get("width", 0))))
                active = r.get("active", True)
                name = r.get("name") or f"Bobina {w/100:.2f}m"
                rolls_to_process.append(RollWidthOption(width_cm=w, name=name, active=active))

    # Allowed orientations
    req_orient = (requested_orientation or "AUTO").upper()
    if not allow_rotation or req_orient in ["NORMAL", "HORIZONTAL"]:
        allowed_orientations = ["NORMAL"]
    elif req_orient in ["ROTATED", "VERTICAL"]:
        allowed_orientations = ["ROTATED"]
    else:
        allowed_orientations = ["NORMAL", "ROTATED"]

    valid_options: List[Dict[str, Any]] = []
    rejected_options: List[Dict[str, Any]] = []

    for orient in allowed_orientations:
        if orient == "NORMAL":
            req_w_cm = prod_width_cm
            used_l_cm = prod_height_cm
        else:
            req_w_cm = prod_height_cm
            used_l_cm = prod_width_cm

        for roll in rolls_to_process:
            if not roll.active:
                continue

            roll_w_cm = roll.width_cm
            if roll_w_cm >= req_w_cm:
                roll_w_m = round(roll_w_cm / 100.0, 4)
                used_l_m = round(used_l_cm / 100.0, 4)
                area_unit = round(roll_w_m * used_l_m, 4)
                gross_unit = round(area_unit * price_per_sqm, 2)
                tot_area = round(area_unit * quantity, 4)
                gross_tot = round(gross_unit * quantity, 2)

                valid_options.append({
                    "roll_id": roll.id,
                    "roll_name": roll.name,
                    "roll_width_cm": roll_w_cm,
                    "roll_width_m": roll_w_m,
                    "orientation": orient,
                    "fits": True,
                    "required_width_cm": req_w_cm,
                    "required_width_m": round(req_w_cm / 100.0, 4),
                    "used_length_cm": used_l_cm,
                    "used_length_m": round(used_l_cm / 100.0, 4),
                    "area_per_unit_m2": area_unit,
                    "gross_unit_price": gross_unit,
                    "total_calculated_area_m2": tot_area,
                    "gross_total_price": gross_tot
                })
            else:
                rejected_options.append({
                    "roll_id": roll.id,
                    "roll_name": roll.name,
                    "roll_width_cm": roll_w_cm,
                    "roll_width_m": round(roll_w_cm / 100.0, 4),
                    "orientation": orient,
                    "fits": False,
                    "required_width_cm": req_w_cm,
                    "rejection_reason": f"A largura necessária de {req_w_cm/100:.2f} m excede a largura da bobina de {roll_w_cm/100:.2f} m."
                })

    if not valid_options:
        min_req_cm = min(prod_width_cm, prod_height_cm) if allow_rotation else prod_width_cm
        max_roll_cm = max([r.width_cm for r in rolls_to_process if r.active], default=0.0)
        return {
            "success": False,
            "error": f"Nenhuma bobina disponível para este material comporta a largura de produção necessária de {min_req_cm / 100.0:.2f} m ({min_req_cm:.1f} cm). Maior bobina ativa cadastrada: {max_roll_cm / 100.0:.2f} m ({max_roll_cm:.0f} cm).",
            "recommended": None,
            "all_options": rejected_options
        }

    # Tie-breaking sort:
    # 1. Lowest gross unit price
    # 2. Lower consumed area
    # 3. Smaller roll width
    # 4. Normal orientation first
    valid_options.sort(key=lambda o: (
        round(o["gross_unit_price"], 2),
        round(o["area_per_unit_m2"], 4),
        o["roll_width_cm"],
        0 if o["orientation"] == "NORMAL" else 1
    ))

    def apply_discount_and_totals(opt: Dict[str, Any]) -> Dict[str, Any]:
        opt_copy = dict(opt)
        tot_area = round(opt_copy["area_per_unit_m2"] * quantity, 4)
        gross_tot = round(opt_copy["gross_unit_price"] * quantity, 2)
        opt_copy["total_calculated_area_m2"] = tot_area
        opt_copy["gross_total_price"] = gross_tot

        applied_pct = 0.0
        if volume_discount_tiers:
            qualified = []
            for tier in volume_discount_tiers:
                if tier.get("active", True) is False:
                    continue
                thresh = float(
                    tier.get("minimum_area")
                    or tier.get("minimumArea")
                    or tier.get("minimum_area_sqm")
                    or tier.get("min_area")
                    or tier.get("minimum_quantity")
                    or tier.get("minimumQuantity")
                    or 0.0
                )
                pct = float(
                    tier.get("discount_percentage")
                    or tier.get("discountPercentage")
                    or tier.get("percentage")
                    or 0.0
                )
                if tot_area >= thresh and thresh > 0:
                    qualified.append((thresh, pct))
            if qualified:
                qualified.sort(key=lambda x: x[0], reverse=True)
                applied_pct = qualified[0][1]

        disc_val = round(gross_tot * (applied_pct / 100.0), 2)
        final_price = round(gross_tot - disc_val, 2)
        opt_copy["discount_percentage"] = applied_pct
        opt_copy["discount_value"] = disc_val
        opt_copy["final_price"] = final_price
        opt_copy["final_total_price"] = final_price
        return opt_copy

    recommended = apply_discount_and_totals(valid_options[0])

    selected = None
    is_manual_override = False
    audit_log = None

    if manual_selected_roll_width_cm is not None:
        target_w_cm = manual_selected_roll_width_cm * 100.0 if manual_selected_roll_width_cm <= 10.0 else float(manual_selected_roll_width_cm)
        target_orient = (manual_selected_orientation or recommended["orientation"]).upper()
        if target_orient in ["HORIZONTAL", "NORMAL"]:
            target_orient = "NORMAL"
            req_check_w = prod_width_cm
        else:
            target_orient = "ROTATED"
            req_check_w = prod_height_cm

        if target_w_cm < req_check_w:
            return {
                "success": False,
                "error": f"Bobina manual de {target_w_cm/100:.2f} m é incompatível com a largura de produção necessária de {req_check_w/100:.2f} m.",
                "recommended": recommended,
                "selected": None,
                "is_manual_override": False,
                "all_options": [apply_discount_and_totals(o) for o in valid_options] + rejected_options
            }

        matching = next((o for o in valid_options if abs(o["roll_width_cm"] - target_w_cm) < 0.01 and o["orientation"] == target_orient), None)
        if not matching:
            matching = next((o for o in valid_options if abs(o["roll_width_cm"] - target_w_cm) < 0.01), None)

        if matching:
            selected = apply_discount_and_totals(matching)
            is_manual_override = True
            audit_log = create_roll_override_audit_log(
                user=user_name,
                previous_roll_width_cm=recommended["roll_width_cm"],
                new_roll_width_cm=selected["roll_width_cm"],
                previous_orientation=recommended["orientation"],
                new_orientation=selected["orientation"],
                previous_price=recommended["final_price"],
                new_price=selected["final_price"],
                reason="Substituição manual de bobina"
            )

    return {
        "success": True,
        "final_width_cm": finished_width_cm,
        "final_height_cm": finished_height_cm,
        "production_width_cm": prod_width_cm,
        "production_height_cm": prod_height_cm,
        "bleed_left_cm": bleed_left_cm,
        "bleed_right_cm": bleed_right_cm,
        "bleed_top_cm": bleed_top_cm,
        "bleed_bottom_cm": bleed_bottom_cm,
        "quantity": quantity,
        "price_per_sqm": price_per_sqm,
        "allow_rotation": allow_rotation,
        "recommended": recommended,
        "selected": selected,
        "is_manual_override": is_manual_override,
        "audit_log": audit_log,
        "all_options": [apply_discount_and_totals(o) for o in valid_options] + rejected_options
    }


@dataclass
class QuotationItemFinishingInput:
    finishing_id: str
    finishing_name: str
    cost_type: str  # "FIXED", "PER_UNIT", "PER_METER", "PER_SQM", "PERCENTAGE"
    unit_price_snapshot: float
    quantity: int = 1


def calculate_finishing_subtotal(
    cost_type: str,
    unit_price: float,
    quantity: int,
    width_cm: float,
    height_cm: float,
    base_value: float
) -> float:
    ct = cost_type.upper()
    if ct in ("FIXED", "VALOR_FIXO"):
        return unit_price
    elif ct in ("PER_UNIT", "POR_UNIDADE"):
        return quantity * unit_price
    elif ct in ("PER_METER", "POR_METRO"):
        perimeter_m = (2 * (width_cm + height_cm)) / 100.0
        return perimeter_m * quantity * unit_price
    elif ct in ("PER_SQM", "POR_AREA"):
        area_m2 = (width_cm / 100.0) * (height_cm / 100.0)
        return area_m2 * quantity * unit_price
    elif ct in ("PERCENTAGE", "PORCENTAGEM"):
        return (base_value * unit_price) / 100.0
    return quantity * unit_price


@dataclass
class QuotationItemInput:
    id: str
    service_id: str
    service_name: str
    pricing_type: str  # "ROLL_AREA", "AREA", "LINEAR", "UNIT", "FIXED"
    service_price_snapshot: float
    finished_width_cm: float
    finished_height_cm: float
    quantity: int
    allowances: Allowances
    available_rolls: List[RollWidthOption] = field(default_factory=list)
    finishings: List[QuotationItemFinishingInput] = field(default_factory=list)
    selected_roll_width_cm: Optional[float] = None
    selected_orientation: Optional[str] = None
    manual_selection_reason: Optional[str] = None
    discount_type: str = "NONE"  # "NONE", "PERCENTAGE", "FIXED_AMOUNT"
    discount_input_value: float = 0.0
    reference_quantity: float = 1.0
    reference_price: float = 0.0
    unit_price_snapshot: Optional[float] = None
    quantity_discount_tiers: List[Dict[str, Any]] = field(default_factory=list)
    product_type: str = "BOBINA"  # "BOBINA" or "PAPEL"
    min_quantity: float = 1.0
    min_quantity_value: float = 0.0
    promotional_unit_price: Optional[float] = None
    allow_rotation: bool = True
    requested_orientation: str = "AUTO"
    volume_discount_tiers: List[Dict[str, Any]] = field(default_factory=list)


def calculate_quotation_item(item: QuotationItemInput) -> Dict[str, Any]:
    pricing_type = item.pricing_type.upper()
    product_type = (item.product_type or "BOBINA").upper()
    
    base_value = 0.0
    calc_snapshot = None
    recommended_snapshot = None
    validation_error = None
    is_roll = (product_type == "BOBINA" and pricing_type in ("ROLL_AREA", "POR_AREA_CONSUMIDA_BOBINA", "ROLL", "PER_SQM")) or pricing_type in ("ROLL_AREA", "POR_AREA_CONSUMIDA_BOBINA", "ROLL")

    # Paper Service Validation
    if product_type == "PAPEL" or pricing_type in ("UNIT", "POR_UNIDADE", "PER_UNIT"):
        effective_min_qty = item.min_quantity if item.min_quantity > 0 else (item.reference_quantity if item.reference_quantity > 0 else 1.0)
        if item.quantity < effective_min_qty:
            validation_error = f"A quantidade solicitada ({item.quantity}) é menor que a quantidade mínima ({int(effective_min_qty)}) para este serviço."

    if is_roll:
        opt_req = OptimizationRequest(
            finished_width_cm=item.finished_width_cm,
            finished_height_cm=item.finished_height_cm,
            quantity=item.quantity,
            requested_orientation=item.requested_orientation or "AUTO",
            allowances=item.allowances,
            available_rolls=item.available_rolls,
            price_per_sqm=item.service_price_snapshot,
            allow_rotation=item.allow_rotation,
            volume_discount_tiers=item.volume_discount_tiers or item.quantity_discount_tiers
        )
        opt_res = calculate_roll_optimization(opt_req)
        if not opt_res["success"]:
            return {
                "success": False,
                "error": opt_res["error"],
                "item_id": item.id
            }
        
        recommended_snapshot = opt_res["recommended"]
        
        if item.selected_roll_width_cm:
            match_opt = next((
                o for o in opt_res["all_options"]
                if o["roll_width_cm"] == item.selected_roll_width_cm
                and (not item.selected_orientation or o["orientation"] == item.selected_orientation)
                and o["fits"]
            ), None)
            if not match_opt:
                rejected = next((
                    o for o in opt_res["all_options"]
                    if o["roll_width_cm"] == item.selected_roll_width_cm
                ), None)
                err_msg = rejected["rejection_reason"] if rejected else f"Bobina de {item.selected_roll_width_cm:.0f} cm não é compatível."
                return {
                    "success": False,
                    "error": f"Substituição manual inválida: {err_msg}",
                    "item_id": item.id
                }
            calc_snapshot = match_opt
        else:
            calc_snapshot = recommended_snapshot

        base_value = calc_snapshot["subtotal_price"] if calc_snapshot else 0.0
    else:
        # Non-roll calculation types (PAPEL / UNIT / FIXED / AREA / LINEAR)
        if pricing_type in ("AREA", "POR_AREA_ARTE", "PER_SQM"):
            base_value = (item.finished_width_cm / 100.0) * (item.finished_height_cm / 100.0) * item.quantity * item.service_price_snapshot
        elif pricing_type in ("LINEAR", "POR_METRO_LINEAR", "PER_LINM"):
            base_value = (item.finished_height_cm / 100.0) * item.quantity * item.service_price_snapshot
        elif pricing_type in ("FIXED", "VALOR_FIXO"):
            base_value = item.service_price_snapshot
        else: # UNIT / POR_UNIDADE / PER_UNIT / PAPEL
            if item.promotional_unit_price is not None and item.promotional_unit_price > 0:
                effective_unit_price = item.promotional_unit_price
            elif item.min_quantity_value > 0 and item.min_quantity > 0:
                effective_unit_price = item.min_quantity_value / item.min_quantity
            elif item.reference_quantity > 0 and item.reference_price > 0:
                effective_unit_price = item.reference_price / item.reference_quantity
            elif item.unit_price_snapshot is not None and item.unit_price_snapshot > 0:
                effective_unit_price = item.unit_price_snapshot
            else:
                effective_unit_price = item.service_price_snapshot
            base_value = item.quantity * effective_unit_price

    finishing_details = []
    finishing_total = 0.0
    for fin in item.finishings:
        sub = calculate_finishing_subtotal(
            fin.cost_type,
            fin.unit_price_snapshot,
            fin.quantity,
            item.finished_width_cm,
            item.finished_height_cm,
            base_value
        )
        finishing_total += sub
        finishing_details.append({
            "finishing_id": fin.finishing_id,
            "finishing_name": fin.finishing_name,
            "cost_type": fin.cost_type,
            "unit_price_snapshot": fin.unit_price_snapshot,
            "quantity": fin.quantity,
            "subtotal": round(sub, 2)
        })

    subtotal_before_discount = round(base_value + finishing_total, 2)

    discount_type = (item.discount_type or "NONE").upper()
    discount_input_value = max(0.0, float(item.discount_input_value or 0.0))

    discount_effective_amount = 0.0
    is_discount_valid = True
    discount_error = None

    if discount_type == "PERCENTAGE":
        if discount_input_value < 0 or discount_input_value > 100:
            is_discount_valid = False
            discount_error = "O desconto percentual deve estar entre 0% e 100%."
        else:
            discount_effective_amount = round((subtotal_before_discount * discount_input_value) / 100.0, 2)
    elif discount_type == "FIXED_AMOUNT":
        if discount_input_value < 0:
            is_discount_valid = False
            discount_error = "O desconto não pode ser negativo."
        elif discount_input_value > subtotal_before_discount:
            is_discount_valid = False
            discount_error = "O desconto não pode ser maior que o subtotal do item."
            discount_effective_amount = 0.0
        else:
            discount_effective_amount = round(discount_input_value, 2)

    subtotal_after_discount = round(max(0.0, subtotal_before_discount - discount_effective_amount), 2)

    return {
        "success": True,
        "item_id": item.id,
        "service_id": item.service_id,
        "service_name": item.service_name,
        "pricing_type": item.pricing_type,
        "service_price_snapshot": item.service_price_snapshot,
        "finished_width_cm": item.finished_width_cm,
        "finished_height_cm": item.finished_height_cm,
        "quantity": item.quantity,
        "base_value": round(base_value, 2),
        "finishing_total": round(finishing_total, 2),
        "finishings": finishing_details,
        "subtotal_before_discount": subtotal_before_discount,
        "discount_type": discount_type,
        "discount_input_value": discount_input_value,
        "discount_effective_amount": discount_effective_amount,
        "is_discount_valid": is_discount_valid,
        "discount_error": discount_error,
        "subtotal": subtotal_after_discount,
        "subtotal_after_discount": subtotal_after_discount,
        "calculation_snapshot": calc_snapshot,
        "recommended_snapshot": recommended_snapshot,
        "is_roll": is_roll
    }


def calculate_multi_item_quotation(
    items: List[QuotationItemInput],
    delivery_cost: float = 0.0,
    design_cost: float = 0.0,
    installation_cost: float = 0.0,
    extra_charges: float = 0.0,
    discount_amount: float = 0.0
) -> Dict[str, Any]:
    calculated_items = []
    items_subtotal_before_discount = 0.0
    items_total_discounts = 0.0
    items_subtotal = 0.0

    for item in items:
        res = calculate_quotation_item(item)
        if not res["success"]:
            return {
                "success": False,
                "error": f"Erro no item '{item.service_name}': {res.get('error')}"
            }
        calculated_items.append(res)
        items_subtotal_before_discount += res.get("subtotal_before_discount", res["subtotal"])
        items_total_discounts += res.get("discount_effective_amount", 0.0)
        items_subtotal += res["subtotal"]

    items_subtotal_before_discount = round(items_subtotal_before_discount, 2)
    items_total_discounts = round(items_total_discounts, 2)
    items_subtotal = round(items_subtotal, 2)
    total_amount = max(0.0, round(items_subtotal + delivery_cost + design_cost + installation_cost + extra_charges - discount_amount, 2))

    return {
        "success": True,
        "items": calculated_items,
        "items_subtotal_before_discount": items_subtotal_before_discount,
        "items_total_discounts": items_total_discounts,
        "subtotal": items_subtotal,
        "delivery_cost": delivery_cost,
        "design_cost": design_cost,
        "installation_cost": installation_cost,
        "extra_charges": extra_charges,
        "discount_amount": discount_amount,
        "total_amount": total_amount
    }

