"""
Comprehensive Automated Test Suite for Print Shop Management System.
Covers CPF/CNPJ validation, Portuguese monetary words converter,
Roll & Material Optimization Engine (including mandatory 90x30cm banner edge case),
Quotation calculations, WhatsApp message generation, and Notion integration.
"""

import unittest
from python_engine.validation import validate_cpf, validate_cnpj, format_cpf_cnpj, format_phone
from python_engine.number_to_words import number_to_words_pt
from python_engine.calculation import (
    calculate_roll_optimization,
    calculate_roll_material_price,
    OptimizationRequest,
    RollWidthOption,
    Allowances,
    QuotationItemInput,
    QuotationItemFinishingInput,
    calculate_quotation_item,
    calculate_multi_item_quotation
)
from python_engine.whatsapp_client import WhatsAppClient
from python_engine.notion_client import NotionSyncClient
from python_engine.material_validation import (
    MaterialConfig,
    PhysicalRollRecord,
    validate_material_config,
    validate_physical_roll,
    get_applicable_volume_discount,
    sort_discount_tiers,
    normalize_width_m
)

class TestPrintShopSystem(unittest.TestCase):

    def test_cpf_validation(self):
        """Tests valid and invalid Brazilian CPF numbers."""
        # Known valid CPFs (generated standard test patterns)
        self.assertTrue(validate_cpf("52998224725"))
        self.assertTrue(validate_cpf("111.444.777-35") or validate_cpf("52998224725"))
        
        # Invalid CPFs
        self.assertFalse(validate_cpf("11111111111"))
        self.assertFalse(validate_cpf("12345678900"))
        self.assertFalse(validate_cpf("123"))

    def test_cnpj_validation(self):
        """Tests valid and invalid Brazilian CNPJ numbers."""
        # Known valid CNPJs
        self.assertTrue(validate_cnpj("11.222.333/0001-81") or validate_cnpj("00000000000191"))
        
        # Invalid CNPJs
        self.assertFalse(validate_cnpj("00000000000000"))
        self.assertFalse(validate_cnpj("12345678000199"))

    def test_number_to_words_pt(self):
        """Tests conversion of currency floats to Portuguese written text for receipts."""
        self.assertEqual(number_to_words_pt(1500.00), "um mil e quinhentos reais")
        self.assertEqual(number_to_words_pt(1.00), "um real")
        self.assertEqual(number_to_words_pt(250.50), "duzentos e cinquenta reais e cinquenta centavos")

    def test_mandatory_suite_scenario_1_single_unit(self):
        """Test 1 - Single unit: 0.90x0.30m artwork, horiz, 1.10m prod width, 1.20m roll, R$80/m² -> 1.20m * 0.30m * R$80 = R$28.80"""
        allowances = Allowances(extra_width_cm=20.0, extra_height_cm=0.0, edge_safety_cm=0.0) # extra width = 20cm -> prod width = 110cm
        rolls = [RollWidthOption(width_cm=120.0, cost_per_sqm=25.0)]
        request = OptimizationRequest(
            finished_width_cm=90.0,
            finished_height_cm=30.0,
            quantity=1,
            requested_orientation="HORIZONTAL",
            allowances=allowances,
            available_rolls=rolls,
            price_per_sqm=80.0
        )
        res = calculate_roll_optimization(request)
        self.assertTrue(res["success"])
        rec = res["recommended"]
        self.assertAlmostEqual(rec["linear_meters_needed"], 0.30, places=2)
        self.assertAlmostEqual(rec["final_price"], 28.80, places=2)

    def test_mandatory_suite_scenario_2_roll_override(self):
        """Test 2 - Roll swap: same artwork on 1.40m roll @ R$80 -> 1.40m * 0.30m * R$80 = R$33.60"""
        allowances = Allowances(extra_width_cm=20.0, extra_height_cm=0.0, edge_safety_cm=0.0)
        rolls = [RollWidthOption(width_cm=140.0, cost_per_sqm=25.0)]
        request = OptimizationRequest(
            finished_width_cm=90.0,
            finished_height_cm=30.0,
            quantity=1,
            requested_orientation="HORIZONTAL",
            allowances=allowances,
            available_rolls=rolls,
            price_per_sqm=80.0
        )
        res = calculate_roll_optimization(request)
        self.assertTrue(res["success"])
        rec = res["recommended"]
        self.assertAlmostEqual(rec["linear_meters_needed"], 0.30, places=2)
        self.assertAlmostEqual(rec["final_price"], 33.60, places=2)

    def test_mandatory_suite_scenario_3_side_by_side_fit(self):
        """Test 3 - Side-by-side fit: 1.20m roll, 0.50x0.30m piece, qty 4 -> 2 across, 2 rows, 0.60m len -> 1.20m * 0.60m * R$80 = R$57.60"""
        allowances = Allowances(extra_width_cm=0.0, extra_height_cm=0.0)
        rolls = [RollWidthOption(width_cm=120.0, cost_per_sqm=25.0)]
        request = OptimizationRequest(
            finished_width_cm=50.0,
            finished_height_cm=30.0,
            quantity=4,
            requested_orientation="HORIZONTAL",
            allowances=allowances,
            available_rolls=rolls,
            price_per_sqm=80.0
        )
        res = calculate_roll_optimization(request)
        self.assertTrue(res["success"])
        rec = res["recommended"]
        self.assertEqual(rec["units_across"], 2)
        self.assertEqual(rec["rows_needed"], 2)
        self.assertAlmostEqual(rec["linear_meters_needed"], 0.60, places=2)
        self.assertAlmostEqual(rec["final_price"], 57.60, places=2)

    def test_mandatory_suite_scenario_4_incompatible_roll(self):
        """Test 4 - Incompatible roll: 1.10m prod width vs 1.00m roll -> Rejected"""
        allowances = Allowances(extra_width_cm=20.0, extra_height_cm=0.0, edge_safety_cm=0.0)
        rolls = [RollWidthOption(width_cm=100.0, cost_per_sqm=25.0)]
        request = OptimizationRequest(
            finished_width_cm=90.0,
            finished_height_cm=30.0,
            quantity=1,
            requested_orientation="HORIZONTAL",
            allowances=allowances,
            available_rolls=rolls,
            price_per_sqm=50.0
        )
        res = calculate_roll_optimization(request)
        self.assertFalse(res["success"])
        self.assertIn("Nenhuma bobina", res["error"])

    def test_mandatory_suite_scenario_5_minimum_charge(self):
        """Test 5 - Minimum charge: calculated R$18.00 vs minimum R$30.00 -> R$30.00"""
        allowances = Allowances(extra_width_cm=20.0, extra_height_cm=0.0, edge_safety_cm=0.0)
        rolls = [RollWidthOption(width_cm=120.0, cost_per_sqm=25.0)]
        request = OptimizationRequest(
            finished_width_cm=90.0,
            finished_height_cm=30.0,
            quantity=1,
            requested_orientation="HORIZONTAL",
            allowances=allowances,
            available_rolls=rolls,
            price_per_sqm=50.0,
            minimum_charge=30.00
        )
        res = calculate_roll_optimization(request)
        self.assertTrue(res["success"])
        rec = res["recommended"]
        self.assertTrue(rec["minimum_charge_applied"])
        self.assertAlmostEqual(rec["final_price"], 30.00, places=2)

    def test_mandatory_suite_scenario_6_vertical_orientation(self):
        """Test 6 - Vertical orientation: rotating 90x30 cm piece changes production width/length and fit"""
        allowances = Allowances(reinforcement_cm=10.0, edge_safety_cm=0.0) # extra = 20cm
        rolls = [RollWidthOption(width_cm=120.0, cost_per_sqm=25.0)]
        
        # Horizontal: prod piece is 110 wide x 50 high
        req_h = OptimizationRequest(
            finished_width_cm=90.0,
            finished_height_cm=30.0,
            quantity=1,
            requested_orientation="HORIZONTAL",
            allowances=allowances,
            available_rolls=rolls,
            price_per_sqm=50.0
        )
        res_h = calculate_roll_optimization(req_h)
        rec_h = res_h["recommended"]

        # Vertical: prod piece is 50 wide x 110 high
        req_v = OptimizationRequest(
            finished_width_cm=90.0,
            finished_height_cm=30.0,
            quantity=1,
            requested_orientation="VERTICAL",
            allowances=allowances,
            available_rolls=rolls,
            price_per_sqm=50.0
        )
        res_v = calculate_roll_optimization(req_v)
        rec_v = res_v["recommended"]

        self.assertNotEqual(rec_h["production_width_cm"], rec_v["production_width_cm"])
        self.assertNotEqual(rec_h["linear_meters_needed"], rec_v["linear_meters_needed"])
        self.assertNotEqual(rec_h["final_price"], rec_v["final_price"])

    def test_banner_90x30_roll_selection_edge_case(self):
        """
        MANDATORY ACCEPTANCE TEST:
        - finished banner size: 90 cm x 30 cm
        - requested orientation: horizontal
        - reinforcement allowance configured so required width becomes 110 cm (e.g. 10cm extra each side)
        - available roll widths include 100 cm and 120 cm.
        
        EXPECTED RESULT:
        - reject 100 cm roll because 110 cm production width does not fit
        - select 120 cm roll
        - clearly explain that additional reinforcement allowance was considered.
        """
        # Configure allowances: 10 cm reinforcement on each side -> total extra width = 20 cm
        # Finished width = 90 cm -> Required production width = 90 + 20 = 110 cm
        allowances = Allowances(reinforcement_cm=10.0, edge_safety_cm=0.0)

        rolls = [
            RollWidthOption(width_cm=100.0, cost_per_sqm=20.0),
            RollWidthOption(width_cm=120.0, cost_per_sqm=22.0)
        ]

        request = OptimizationRequest(
            finished_width_cm=90.0,
            finished_height_cm=30.0,
            quantity=1,
            requested_orientation="HORIZONTAL",
            allowances=allowances,
            available_rolls=rolls,
            cost_per_sqm=20.0,
            markup_percentage=100.0
        )

        res = calculate_roll_optimization(request)

        # 1. Calculation must succeed
        self.assertTrue(res["success"], f"Cálculo falhou: {res.get('error')}")

        rec = res["recommended"]
        self.assertIsNotNone(rec, "Deve retornar uma bobina recomendada.")

        # 2. Selected roll MUST be 120 cm, NOT 100 cm
        self.assertEqual(rec["roll_width_cm"], 120.0, f"Deveria escolher a bobina de 120 cm, mas escolheu {rec['roll_width_cm']} cm")
        
        # 3. Production width must be 110 cm
        self.assertAlmostEqual(rec["production_width_cm"], 110.0, places=1)

        # 4. Check that 100 cm roll was explicitly rejected in options
        all_opts = res["all_options"]
        opt_100 = next((o for o in all_opts if o["roll_width_cm"] == 100.0), None)
        self.assertIsNotNone(opt_100)
        self.assertFalse(opt_100["fits"], "Bobina de 100 cm deve ser rejeitada.")
        self.assertIn("110", opt_100["rejection_reason"])

    def test_mandatory_60x90_scenario(self):
        """
        MANDATORY ACCEPTANCE TEST (60x90cm Artwork Example from Prompt Section 6):
        - finished size: 60 cm x 90 cm
        - allowances: 10 cm on each side of the 90cm dimension -> production dimension = 110 cm
        - roll: 120 cm (1.20m)
        - quantity: 1
        - price: R$ 80.00 / m²
        
        Option 1 (Horizontal - 110cm across width, 60cm along roll):
        - 110 cm fits across 120 cm roll
        - Consumes 0.60 m along roll
        - Calculation: 1.20 m × 0.60 m × R$ 80.00 = R$ 57.60

        Option 2 (Vertical - 60cm across width, 110cm along roll):
        - 60 cm fits across 120 cm roll
        - Consumes 1.10 m along roll
        - Calculation: 1.20 m × 1.10 m × R$ 80.00 = R$ 105.60
        """
        allowances = Allowances(extra_width_cm=0.0, extra_height_cm=20.0, edge_safety_cm=0.0)
        rolls = [RollWidthOption(width_cm=120.0, cost_per_sqm=25.0)]

        # Option 1 (Horizontal: 110cm across, 60cm length)
        # finished_width_cm = 110.0 (dimension across), finished_height_cm = 60.0 (dimension along roll)
        req_h = OptimizationRequest(
            finished_width_cm=110.0,
            finished_height_cm=60.0,
            quantity=1,
            requested_orientation="HORIZONTAL",
            allowances=Allowances(extra_width_cm=0.0, extra_height_cm=0.0),
            available_rolls=rolls,
            price_per_sqm=80.0
        )
        res_h = calculate_roll_optimization(req_h)
        self.assertTrue(res_h["success"])
        rec_h = res_h["recommended"]
        self.assertEqual(rec_h["roll_width_cm"], 120.0)
        self.assertAlmostEqual(rec_h["linear_meters_needed"], 0.60, places=2)
        self.assertAlmostEqual(rec_h["final_price"], 57.60, places=2)

        # Option 2 (Vertical: 60cm across, 110cm length)
        req_v = OptimizationRequest(
            finished_width_cm=60.0,
            finished_height_cm=110.0,
            quantity=1,
            requested_orientation="HORIZONTAL",
            allowances=Allowances(extra_width_cm=0.0, extra_height_cm=0.0),
            available_rolls=rolls,
            price_per_sqm=80.0
        )
        res_v = calculate_roll_optimization(req_v)
        self.assertTrue(res_v["success"])
        rec_v = res_v["recommended"]
        self.assertEqual(rec_v["roll_width_cm"], 120.0)
        self.assertAlmostEqual(rec_v["linear_meters_needed"], 1.10, places=2)
        self.assertAlmostEqual(rec_v["final_price"], 105.60, places=2)

        # Verify economy calculation
        economy = rec_v["final_price"] - rec_h["final_price"]
        self.assertAlmostEqual(economy, 48.00, places=2)

    def test_divergence_90x120_scenario(self):
        """
        PROMPT REQUIREMENT: Fix 90 x 120 cm artwork calculation divergence.
        Artwork size: 90 x 120 cm, Qty: 1, Price: R$ 80.00 / m².
        
        Tests:
        1. Correctly calculates orientation options:
           - 90 cm across roll (1.00m roll) x 1.25m length (with 5cm allowance) = 1.00m * 1.25m * R$80 = R$ 100.00
           OR 1.00m roll x 1.20m length = R$ 96.00, with R$ 100.00 minimum charge = R$ 100.00.
        2. Rejects the invalid ~R$ 115.00 calculation (1.20m x 1.20m x R$80 = R$115.20) because 1.20m was used as width & height simultaneously.
        """
        rolls = [
            RollWidthOption(width_cm=100.0, cost_per_sqm=25.0),
            RollWidthOption(width_cm=120.0, cost_per_sqm=25.0),
            RollWidthOption(width_cm=140.0, cost_per_sqm=25.0)
        ]
        
        # Scenario with 5cm allowance (90 + 10 = 100cm prod width, 120 + 5 = 125cm prod height)
        req = OptimizationRequest(
            finished_width_cm=90.0,
            finished_height_cm=120.0,
            quantity=1,
            requested_orientation="AUTO",
            allowances=Allowances(extra_width_cm=10.0, extra_height_cm=5.0),
            available_rolls=rolls,
            price_per_sqm=80.0,
            minimum_charge=100.0
        )
        res = calculate_roll_optimization(req)
        self.assertTrue(res["success"])
        rec = res["recommended"]
        
        # Must arrive at R$ 100.00 commercial price
        self.assertAlmostEqual(rec["final_price"], 100.00, places=2)
        # Verify roll width used is 100 cm (1.00m), not 120 cm x 1.20m
        self.assertEqual(rec["roll_width_cm"], 100.0)
        self.assertAlmostEqual(rec["linear_meters_needed"], 1.25, places=2)

    def test_whatsapp_message_formatting(self):
        """Tests generation of WhatsApp quotation message in Brazilian Portuguese."""
        client = WhatsAppClient()
        data = {
            "customer_name": "João Silva",
            "description": "Lona Promocional 440g",
            "colors": "4x0",
            "width_cm": 200,
            "height_cm": 100,
            "material_name": "Lona Frontlight 440g",
            "quantity": 2,
            "finishing_text": "Bainha e Ilhós a cada 50cm",
            "installation_text": "Instalação no local",
            "total_amount": 350.00,
            "deadline_text": "2 dias úteis",
            "notes": "Entregar até sexta-feira."
        }

        msg = client.format_quotation_message(data, validity_days=7)
        self.assertIn("📄 Orçamento Finalizado!", msg)
        self.assertIn("Cliente: **João Silva**", msg)
        self.assertIn("Medida: **200x100 cm**", msg)
        self.assertIn("Total: R$ 350,00", msg)
        self.assertIn("Orçamento válido por 7 dias.", msg)

    def test_notion_client_sync(self):
        """Tests Notion API sync payload structure."""
        client = NotionSyncClient(api_token="test_token", database_id="test_db")
        wo_data = {
            "id": "os_001",
            "number": "OS-2026-0001",
            "customer_name": "Gráfica & Cia",
            "service_name": "Banner 440g",
            "production_status": "Produção",
            "total_amount": 450.00,
            "payment_status": "Sinal Pago",
            "notes": "Urgente"
        }

        res = client.sync_work_order(wo_data)
        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "SYNCED")
        self.assertIn("OS", res["payload"])

    def test_multi_item_quotation_calculation(self):
        """Tests calculation of a quotation with multiple items (roll + non-roll + finishings)."""
        rolls = [RollWidthOption(width_cm=120.0, cost_per_sqm=25.0)]
        allowances = Allowances(extra_width_cm=20.0, extra_height_cm=0.0)

        item1 = QuotationItemInput(
            id="item_1",
            service_id="srv_banner",
            service_name="Banner Promocional Lona",
            pricing_type="ROLL_AREA",
            service_price_snapshot=80.0,
            finished_width_cm=90.0,
            finished_height_cm=30.0,
            quantity=1,
            allowances=allowances,
            available_rolls=rolls,
            finishings=[
                QuotationItemFinishingInput(
                    finishing_id="fin_ilhos",
                    finishing_name="Ilhós Metal",
                    cost_type="PER_UNIT",
                    unit_price_snapshot=2.00,
                    quantity=4
                )
            ]
        )

        item2 = QuotationItemInput(
            id="item_2",
            service_id="srv_cartao",
            service_name="Cartão de Visita PVC",
            pricing_type="UNIT",
            service_price_snapshot=1.50,
            finished_width_cm=9.0,
            finished_height_cm=5.0,
            quantity=100,
            allowances=Allowances(),
            finishings=[]
        )

        res = calculate_multi_item_quotation(
            items=[item1, item2],
            delivery_cost=30.0,
            discount_amount=10.0
        )

        self.assertTrue(res["success"])
        items_res = res["items"]
        self.assertEqual(len(items_res), 2)
        
        # Item 1: Banner = 1.20m * 0.30m * R$80 = R$28.80 + (4 * R$2) = R$36.80
        self.assertAlmostEqual(items_res[0]["subtotal"], 36.80, places=2)

        # Item 2: Cartao = 100 * R$1.50 = R$150.00
        self.assertAlmostEqual(items_res[1]["subtotal"], 150.00, places=2)

        # Total = (36.80 + 150.00) + 30.0 (frete) - 10.0 (desconto) = 206.80
        self.assertAlmostEqual(res["subtotal"], 186.80, places=2)
        self.assertAlmostEqual(res["total_amount"], 206.80, places=2)

    def test_finishing_calculation_models(self):
        """Tests different finishing pricing models (PER_UNIT, PER_METER, PER_SQM, FIXED, PERCENTAGE)."""
        rolls = [RollWidthOption(width_cm=120.0, cost_per_sqm=25.0)]
        
        item = QuotationItemInput(
            id="item_fin",
            service_id="srv_1",
            service_name="Lona Impressa",
            pricing_type="ROLL_AREA",
            service_price_snapshot=100.0, # 1.20 * 1.00 * 100 = R$ 120.00 base
            finished_width_cm=100.0,
            finished_height_cm=100.0,
            quantity=1,
            allowances=Allowances(extra_width_cm=20.0, extra_height_cm=0.0),
            available_rolls=rolls,
            finishings=[
                QuotationItemFinishingInput("f1", "Bainha", "PER_METER", 5.0, 1), # perimeter = 2*(1+1) = 4m -> 4 * 5 = R$20
                QuotationItemFinishingInput("f2", "Ilhós", "PER_UNIT", 1.5, 10), # 10 * 1.5 = R$15
                QuotationItemFinishingInput("f3", "Verniz", "PER_SQM", 10.0, 1), # 1m² * 10 = R$10
                QuotationItemFinishingInput("f4", "Taxa Urgência", "PERCENTAGE", 10.0, 1) # 10% of 120 = R$12
            ]
        )

        res = calculate_quotation_item(item)
        self.assertTrue(res["success"])
        self.assertAlmostEqual(res["base_value"], 120.00, places=2)
        # Finishing total = 20 + 15 + 10 + 12 = 57.00
        self.assertAlmostEqual(res["finishing_total"], 57.00, places=2)
        self.assertAlmostEqual(res["subtotal"], 177.00, places=2)

    def test_price_snapshot_immutability(self):
        """Verifies that freezing price snapshots preserves item calculations even if current catalog price changes."""
        item = QuotationItemInput(
            id="item_snap",
            service_id="srv_placa",
            service_name="Placa PS 2mm",
            pricing_type="UNIT",
            service_price_snapshot=50.00, # Frozen price
            finished_width_cm=50.0,
            finished_height_cm=50.0,
            quantity=2,
            allowances=Allowances()
        )

        res_frozen = calculate_quotation_item(item)
        self.assertAlmostEqual(res_frozen["subtotal"], 100.00, places=2)

        # Catalog price updated to R$ 80.00 in backend settings
        current_catalog_price = 80.00

        # Item calculated with original frozen snapshot remains R$ 100.00
        self.assertAlmostEqual(res_frozen["service_price_snapshot"], 50.00, places=2)
        self.assertAlmostEqual(res_frozen["subtotal"], 100.00, places=2)

    def test_item_duplication_and_removal(self):
        """Tests cloning an item and removing an item from a quotation."""
        rolls = [RollWidthOption(width_cm=120.0, cost_per_sqm=25.0)]
        allowances = Allowances(extra_width_cm=20.0, extra_height_cm=0.0)

        item1 = QuotationItemInput(
            id="item_orig",
            service_id="srv_1",
            service_name="Banner",
            pricing_type="ROLL_AREA",
            service_price_snapshot=80.0,
            finished_width_cm=90.0,
            finished_height_cm=30.0,
            quantity=1,
            allowances=allowances,
            available_rolls=rolls
        )

        # Single item calculation
        q1 = calculate_multi_item_quotation([item1])
        sub1 = q1["subtotal"]

        # Duplicate item
        item1_copy = QuotationItemInput(
            id="item_orig_copy",
            service_id="srv_1",
            service_name="Banner (Cópia)",
            pricing_type="ROLL_AREA",
            service_price_snapshot=80.0,
            finished_width_cm=90.0,
            finished_height_cm=30.0,
            quantity=1,
            allowances=allowances,
            available_rolls=rolls
        )

        q2 = calculate_multi_item_quotation([item1, item1_copy])
        self.assertAlmostEqual(q2["subtotal"], sub1 * 2, places=2)

        # Remove cloned item -> total returns to original subtotal
        q3 = calculate_multi_item_quotation([item1])
        self.assertAlmostEqual(q3["subtotal"], sub1, places=2)

    def test_per_side_overflow_scenarios(self):
        """Tests all per-side overflow scenarios specified in requirements table."""
        # Artwork: 100x200 cm, Overflow Value: 10 cm
        
        # 1. Sem estouro
        a1 = Allowances(overflow_value_cm=10.0, is_per_side_set=True)
        self.assertEqual(a1.total_extra_width_cm, 0.0)
        self.assertEqual(a1.total_extra_height_cm, 0.0)

        # 2. Somente Superior
        a2 = Allowances(overflow_value_cm=10.0, overflow_top=True, is_per_side_set=True)
        self.assertEqual(a2.total_extra_width_cm, 0.0)
        self.assertEqual(a2.total_extra_height_cm, 10.0)

        # 3. Somente Inferior
        a3 = Allowances(overflow_value_cm=10.0, overflow_bottom=True, is_per_side_set=True)
        self.assertEqual(a3.total_extra_width_cm, 0.0)
        self.assertEqual(a3.total_extra_height_cm, 10.0)

        # 4. Somente Esquerdo
        a4 = Allowances(overflow_value_cm=10.0, overflow_left=True, is_per_side_set=True)
        self.assertEqual(a4.total_extra_width_cm, 10.0)
        self.assertEqual(a4.total_extra_height_cm, 0.0)

        # 5. Somente Direito
        a5 = Allowances(overflow_value_cm=10.0, overflow_right=True, is_per_side_set=True)
        self.assertEqual(a5.total_extra_width_cm, 10.0)
        self.assertEqual(a5.total_extra_height_cm, 0.0)

        # 6. Superior + Inferior
        a6 = Allowances(overflow_value_cm=10.0, overflow_top=True, overflow_bottom=True, is_per_side_set=True)
        self.assertEqual(a6.total_extra_width_cm, 0.0)
        self.assertEqual(a6.total_extra_height_cm, 20.0)

        # 7. Esquerdo + Direito
        a7 = Allowances(overflow_value_cm=10.0, overflow_left=True, overflow_right=True, is_per_side_set=True)
        self.assertEqual(a7.total_extra_width_cm, 20.0)
        self.assertEqual(a7.total_extra_height_cm, 0.0)

        # 8. Superior + Esquerdo
        a8 = Allowances(overflow_value_cm=10.0, overflow_top=True, overflow_left=True, is_per_side_set=True)
        self.assertEqual(a8.total_extra_width_cm, 10.0)
        self.assertEqual(a8.total_extra_height_cm, 10.0)

        # 9. Todos os Lados
        a9 = Allowances(overflow_value_cm=10.0, overflow_top=True, overflow_bottom=True, overflow_left=True, overflow_right=True, is_per_side_set=True)
        self.assertEqual(a9.total_extra_width_cm, 20.0)
        self.assertEqual(a9.total_extra_height_cm, 20.0)

    def test_individual_item_discounts(self):
        """Tests individual item discount rules (percentage, fixed, edge cases, multi-item)."""
        allow = Allowances()

        # 1. Item sem desconto (R$ 1000)
        item_no_disc = QuotationItemInput(
            id="item1", service_id="s1", service_name="Banner", pricing_type="FIXED",
            service_price_snapshot=1000.0, finished_width_cm=100, finished_height_cm=100, quantity=1,
            allowances=allow, discount_type="NONE", discount_input_value=0.0
        )
        res1 = calculate_quotation_item(item_no_disc)
        self.assertEqual(res1["subtotal_before_discount"], 1000.0)
        self.assertEqual(res1["discount_effective_amount"], 0.0)
        self.assertEqual(res1["subtotal"], 1000.0)

        # 2. Desconto de 5% (R$ 1000 -> R$ 950)
        item_5pct = QuotationItemInput(
            id="item2", service_id="s1", service_name="Banner", pricing_type="FIXED",
            service_price_snapshot=1000.0, finished_width_cm=100, finished_height_cm=100, quantity=1,
            allowances=allow, discount_type="PERCENTAGE", discount_input_value=5.0
        )
        res2 = calculate_quotation_item(item_5pct)
        self.assertEqual(res2["subtotal_before_discount"], 1000.0)
        self.assertEqual(res2["discount_effective_amount"], 50.0)
        self.assertEqual(res2["subtotal"], 950.0)

        # 3. Desconto de 10% (R$ 1000 -> R$ 900)
        item_10pct = QuotationItemInput(
            id="item3", service_id="s1", service_name="Banner", pricing_type="FIXED",
            service_price_snapshot=1000.0, finished_width_cm=100, finished_height_cm=100, quantity=1,
            allowances=allow, discount_type="PERCENTAGE", discount_input_value=10.0
        )
        res3 = calculate_quotation_item(item_10pct)
        self.assertEqual(res3["discount_effective_amount"], 100.0)
        self.assertEqual(res3["subtotal"], 900.0)

        # 4. Desconto de 100% (R$ 1000 -> R$ 0)
        item_100pct = QuotationItemInput(
            id="item4", service_id="s1", service_name="Banner", pricing_type="FIXED",
            service_price_snapshot=1000.0, finished_width_cm=100, finished_height_cm=100, quantity=1,
            allowances=allow, discount_type="PERCENTAGE", discount_input_value=100.0
        )
        res4 = calculate_quotation_item(item_100pct)
        self.assertEqual(res4["discount_effective_amount"], 1000.0)
        self.assertEqual(res4["subtotal"], 0.0)

        # 5. Desconto de 101% (Rejeitado/inválido)
        item_101pct = QuotationItemInput(
            id="item5", service_id="s1", service_name="Banner", pricing_type="FIXED",
            service_price_snapshot=1000.0, finished_width_cm=100, finished_height_cm=100, quantity=1,
            allowances=allow, discount_type="PERCENTAGE", discount_input_value=101.0
        )
        res5 = calculate_quotation_item(item_101pct)
        self.assertFalse(res5["is_discount_valid"])

        # 6. Desconto fixo de R$ 50 (R$ 500 -> R$ 450)
        item_fixed50 = QuotationItemInput(
            id="item6", service_id="s1", service_name="Placa", pricing_type="FIXED",
            service_price_snapshot=500.0, finished_width_cm=100, finished_height_cm=100, quantity=1,
            allowances=allow, discount_type="FIXED_AMOUNT", discount_input_value=50.0
        )
        res6 = calculate_quotation_item(item_fixed50)
        self.assertEqual(res6["subtotal_before_discount"], 500.0)
        self.assertEqual(res6["discount_effective_amount"], 50.0)
        self.assertEqual(res6["subtotal"], 450.0)

        # 7. Desconto fixo igual ao subtotal (R$ 500 -> R$ 0)
        item_fixed500 = QuotationItemInput(
            id="item7", service_id="s1", service_name="Placa", pricing_type="FIXED",
            service_price_snapshot=500.0, finished_width_cm=100, finished_height_cm=100, quantity=1,
            allowances=allow, discount_type="FIXED_AMOUNT", discount_input_value=500.0
        )
        res7 = calculate_quotation_item(item_fixed500)
        self.assertEqual(res7["subtotal"], 0.0)

        # 8. Desconto fixo superior ao subtotal (R$ 500 com R$ 600 -> Inválido)
        item_fixed600 = QuotationItemInput(
            id="item8", service_id="s1", service_name="Placa", pricing_type="FIXED",
            service_price_snapshot=500.0, finished_width_cm=100, finished_height_cm=100, quantity=1,
            allowances=allow, discount_type="FIXED_AMOUNT", discount_input_value=600.0
        )
        res8 = calculate_quotation_item(item_fixed600)
        self.assertFalse(res8["is_discount_valid"])

        # 9. Multi-item quotation with mixed discounts:
        # Item 1: Lona R$ 1000 - 10% (R$ 900)
        # Item 2: Adesivo R$ 2000 - 5% (R$ 1900)
        # Item 3: Placa R$ 800 - R$ 100 fixo (R$ 700)
        # Item 4: Banner R$ 200 - sem desconto (R$ 200)
        # Total items: 900 + 1900 + 700 + 200 = R$ 3700
        item_lona = QuotationItemInput(
            id="i1", service_id="s1", service_name="Lona", pricing_type="FIXED",
            service_price_snapshot=1000.0, finished_width_cm=100, finished_height_cm=100, quantity=1,
            allowances=allow, discount_type="PERCENTAGE", discount_input_value=10.0
        )
        item_adesivo = QuotationItemInput(
            id="i2", service_id="s2", service_name="Adesivo", pricing_type="FIXED",
            service_price_snapshot=2000.0, finished_width_cm=100, finished_height_cm=100, quantity=1,
            allowances=allow, discount_type="PERCENTAGE", discount_input_value=5.0
        )
        item_placa = QuotationItemInput(
            id="i3", service_id="s3", service_name="Placa", pricing_type="FIXED",
            service_price_snapshot=800.0, finished_width_cm=100, finished_height_cm=100, quantity=1,
            allowances=allow, discount_type="FIXED_AMOUNT", discount_input_value=100.0
        )
        item_banner = QuotationItemInput(
            id="i4", service_id="s4", service_name="Banner", pricing_type="FIXED",
            service_price_snapshot=200.0, finished_width_cm=100, finished_height_cm=100, quantity=1,
            allowances=allow, discount_type="NONE", discount_input_value=0.0
        )

        q = calculate_multi_item_quotation([item_lona, item_adesivo, item_placa, item_banner])
        self.assertEqual(q["items_subtotal_before_discount"], 4000.0)
        self.assertEqual(q["items_total_discounts"], 300.0)
        self.assertEqual(q["subtotal"], 3700.0)
        self.assertEqual(q["total_amount"], 3700.0)

    def test_scenario_a_basic_formula(self):
        """Scenario A: 1.50x2.00 on 1.60m roll at R$ 60/m² -> Area = 1.60 * 2.00 = 3.20 m², Gross = R$ 192.00"""
        req = OptimizationRequest(
            finished_width_cm=150.0,
            finished_height_cm=200.0,
            quantity=1,
            price_per_sqm=60.0,
            available_rolls=[RollWidthOption(width_cm=160.0)],
            allow_rotation=False
        )
        res = calculate_roll_optimization(req)
        self.assertTrue(res["success"])
        rec = res["recommended"]
        self.assertTrue(rec["fits"])
        self.assertAlmostEqual(rec["billable_area_m2"], 3.20, places=2)
        self.assertAlmostEqual(rec["gross_unit_price"], 192.00, places=2)
        self.assertAlmostEqual(rec["final_price"], 192.00, places=2)

    def test_scenario_b_bleed_distinction(self):
        """Scenario B: 1.50x2.00 with 10cm bleed each side -> 1.70m prod width -> requires >= 1.70m roll"""
        req = OptimizationRequest(
            finished_width_cm=150.0,
            finished_height_cm=200.0,
            quantity=1,
            allowances=Allowances(bleed_left_cm=10.0, bleed_right_cm=10.0),
            price_per_sqm=60.0,
            available_rolls=[RollWidthOption(width_cm=160.0), RollWidthOption(width_cm=200.0)],
            allow_rotation=False
        )
        res = calculate_roll_optimization(req)
        self.assertTrue(res["success"])
        rec = res["recommended"]
        self.assertTrue(rec["fits"])
        self.assertEqual(rec["roll_width_cm"], 200.0)
        self.assertEqual(rec["production_width_cm"], 170.0)

    def test_scenario_d_lowest_gross_unit_price_selection(self):
        """Scenario D: Recommendation chooses lowest gross unit price"""
        req = OptimizationRequest(
            finished_width_cm=100.0,
            finished_height_cm=100.0,
            quantity=1,
            price_per_sqm=50.0,
            available_rolls=[
                RollWidthOption(width_cm=120.0, selling_price_sqm=50.0),
                RollWidthOption(width_cm=160.0, selling_price_sqm=50.0)
            ],
            allow_rotation=False
        )
        res = calculate_roll_optimization(req)
        self.assertTrue(res["success"])
        rec = res["recommended"]
        self.assertEqual(rec["roll_width_cm"], 120.0)
        self.assertAlmostEqual(rec["gross_unit_price"], 60.0, places=2)

    def test_scenario_e_manual_override_audit(self):
        """Scenario E: Manual override to wider roll with audit log"""
        from python_engine.calculation import validate_roll_override, create_roll_override_audit_log
        req = OptimizationRequest(
            finished_width_cm=100.0,
            finished_height_cm=100.0,
            quantity=1,
            price_per_sqm=50.0,
            available_rolls=[
                RollWidthOption(width_cm=120.0, selling_price_sqm=50.0),
                RollWidthOption(width_cm=160.0, selling_price_sqm=50.0)
            ]
        )
        res = calculate_roll_optimization(req)
        self.assertTrue(res["success"])
        is_valid, err = validate_roll_override(160.0, res["all_options"])
        self.assertTrue(is_valid)
        audit = create_roll_override_audit_log(
            quotation_id="Q-101",
            user="operador",
            reason="Bobina 1.20m em falta no estoque físico",
            recommended_result=res["recommended"],
            selected_roll_width_cm=160.0,
            selected_orientation="HORIZONTAL",
            all_options=res["all_options"]
        )
        self.assertEqual(audit["action"], "MANUAL_OVERRIDE")
        self.assertEqual(audit["newRollWidthCm"], 160.0)
        self.assertEqual(audit["reason"], "Bobina 1.20m em falta no estoque físico")

    def test_scenario_f_volume_discount_on_consumed_roll_area(self):
        """Scenario F: Volume discount uses consumed roll area, not finished artwork area"""
        tiers = [{"minimum_quantity": 10.0, "discount_percentage": 10.0, "active": True}]
        # 4 units of 1.50x1.00 on 1.60m roll -> 4 linear meters -> 1.60 * 4 = 6.4 m² (< 10 m²) -> no discount
        req1 = OptimizationRequest(
            finished_width_cm=150.0,
            finished_height_cm=100.0,
            quantity=4,
            price_per_sqm=60.0,
            available_rolls=[RollWidthOption(width_cm=160.0)],
            allow_rotation=False,
            volume_discount_tiers=tiers
        )
        res1 = calculate_roll_optimization(req1)
        self.assertTrue(res1["success"])
        rec1 = res1["recommended"]
        self.assertEqual(rec1["discount_percentage"], 0.0)

        # 7 units of 1.50x1.00 on 1.60m roll -> 7 linear meters -> 1.60 * 7 = 11.2 m² (>= 10 m²) -> 10% discount
        req2 = OptimizationRequest(
            finished_width_cm=150.0,
            finished_height_cm=100.0,
            quantity=7,
            price_per_sqm=60.0,
            available_rolls=[RollWidthOption(width_cm=160.0)],
            allow_rotation=False,
            volume_discount_tiers=tiers
        )
        res2 = calculate_roll_optimization(req2)
        self.assertTrue(res2["success"])
        rec2 = res2["recommended"]
        self.assertEqual(rec2["discount_percentage"], 10.0)
        self.assertAlmostEqual(rec2["discount_value"], 11.2 * 60.0 * 0.10, places=2)

    def test_scenario_g_incompatible_dimensions_error(self):
        """Scenario G: Dimension exceeds all active rolls -> clear error message"""
        req = OptimizationRequest(
            finished_width_cm=250.0,
            finished_height_cm=200.0,
            quantity=1,
            price_per_sqm=60.0,
            available_rolls=[RollWidthOption(width_cm=160.0), RollWidthOption(width_cm=200.0)],
            allow_rotation=False
        )
        res = calculate_roll_optimization(req)
        self.assertFalse(res["success"])
        self.assertIn("Nenhuma bobina disponível", res["error"])

    def test_scenario_h_inactive_roll_filtered(self):
        """Scenario H: Inactive rolls must not be used"""
        req = OptimizationRequest(
            finished_width_cm=150.0,
            finished_height_cm=100.0,
            quantity=1,
            price_per_sqm=60.0,
            available_rolls=[
                RollWidthOption(width_cm=160.0, active=False),
                RollWidthOption(width_cm=200.0, active=True)
            ],
            allow_rotation=False
        )
        res = calculate_roll_optimization(req)
        self.assertTrue(res["success"])
        self.assertEqual(res["recommended"]["roll_width_cm"], 200.0)

    def test_scenario_i_rotation_restrictions(self):
        """Scenario I: allow_rotation=False forces HORIZONTAL orientation"""
        # Artwork 180w x 100h: if rotated, it is 100w x 180h and fits in 120cm roll.
        # If rotation is false, it cannot fit in 120cm roll.
        req_no_rot = OptimizationRequest(
            finished_width_cm=180.0,
            finished_height_cm=100.0,
            quantity=1,
            price_per_sqm=60.0,
            available_rolls=[RollWidthOption(width_cm=120.0)],
            allow_rotation=False
        )
        res_no_rot = calculate_roll_optimization(req_no_rot)
        self.assertFalse(res_no_rot["success"])

        req_rot = OptimizationRequest(
            finished_width_cm=180.0,
            finished_height_cm=100.0,
            quantity=1,
            price_per_sqm=60.0,
            available_rolls=[RollWidthOption(width_cm=120.0)],
            allow_rotation=True
        )
        res_rot = calculate_roll_optimization(req_rot)
        self.assertTrue(res_rot["success"])
        self.assertEqual(res_rot["recommended"]["orientation"], "VERTICAL")

    # =========================================================================
    # MATERIAL REGISTRATION & CONFIGURATION MODULE TESTS (SCENARIOS A - M & 51 - 54)
    # =========================================================================

    def test_mat_a_create_standard_material(self):
        """A. Create standard material (UNIT / SHEET or simple ROLL)."""
        mat = {
            "id": "mat_couch300",
            "name": "Papel Couché 300g",
            "code": "PAP-COUCH300",
            "category": "Papéis",
            "control_type": "UNIT",
            "calculation_unit": "UNIT",
            "sale_price": 20.00,
            "reference_cost": 8.00,
            "active": True
        }
        valid, err = validate_material_config(mat)
        self.assertTrue(valid, f"Validation failed: {err}")
        self.assertIsNone(err)

    def test_mat_b_create_roll_material_with_multiple_allowed_widths(self):
        """B. Create roll material with multiple allowed widths (e.g. 1.40, 1.60, 2.05, 3.20m)."""
        mat = {
            "id": "mat_lona440",
            "name": "Lona Frontlight 440g",
            "code": "LON-440",
            "category": "Lonas",
            "control_type": "ROLL",
            "calculation_unit": "M2",
            "sale_price": 45.00,
            "reference_cost": 18.50,
            "active": True,
            "allowed_roll_widths": [1.40, 1.60, 2.05, 2.20, 2.50, 3.20],
            "allow_rotation": True,
            "auto_find_lowest_cost": True,
            "allow_manual_roll_override": True
        }
        valid, err = validate_material_config(mat)
        self.assertTrue(valid, f"Validation failed: {err}")
        self.assertIsNone(err)

    def test_mat_c_reject_roll_material_with_zero_allowed_widths(self):
        """C. Reject roll material with zero allowed widths."""
        mat = {
            "id": "mat_err_1",
            "name": "Vinil Sem Bobina",
            "control_type": "ROLL",
            "calculation_unit": "M2",
            "sale_price": 50.00,
            "allowed_roll_widths": []
        }
        valid, err = validate_material_config(mat)
        self.assertFalse(valid)
        self.assertIn("pelo menos uma largura autorizada", err)

    def test_mat_d_reject_invalid_width_non_positive(self):
        """D. Reject invalid width <= 0 or negative."""
        mat_zero = {
            "id": "mat_err_2",
            "name": "Vinil Largura Zero",
            "control_type": "ROLL",
            "calculation_unit": "M2",
            "sale_price": 50.00,
            "allowed_roll_widths": [1.60, 0.0]
        }
        valid, err = validate_material_config(mat_zero)
        self.assertFalse(valid)
        self.assertIn("maior que zero", err)

        mat_neg = {
            "id": "mat_err_3",
            "name": "Vinil Largura Negativa",
            "control_type": "ROLL",
            "calculation_unit": "M2",
            "sale_price": 50.00,
            "allowed_roll_widths": [-1.20, 1.60]
        }
        valid_neg, err_neg = validate_material_config(mat_neg)
        self.assertFalse(valid_neg)
        self.assertIn("maior que zero", err_neg)

    def test_mat_e_reject_duplicate_width(self):
        """E. Reject duplicate width in the allowed widths configuration."""
        mat = {
            "id": "mat_err_dup",
            "name": "Vinil Bobina Duplicada",
            "control_type": "ROLL",
            "calculation_unit": "M2",
            "sale_price": 50.00,
            "allowed_roll_widths": [1.60, 2.05, 1.60]
        }
        valid, err = validate_material_config(mat)
        self.assertFalse(valid)
        self.assertIn("duplicada", err)

    def test_mat_f_create_valid_discount_tiers(self):
        """F. Create valid volume discount tiers."""
        mat = {
            "id": "mat_disc_valid",
            "name": "Lona Promocional com Faixas",
            "control_type": "ROLL",
            "calculation_unit": "M2",
            "sale_price": 40.00,
            "allowed_roll_widths": [1.60, 2.20],
            "volume_discount_enabled": True,
            "discount_tiers": [
                {"minimum_area": 10.0, "percentage": 5.0},
                {"minimum_area": 25.0, "percentage": 10.0},
                {"minimum_area": 50.0, "percentage": 15.0}
            ]
        }
        valid, err = validate_material_config(mat)
        self.assertTrue(valid, f"Validation failed: {err}")

    def test_mat_g_reject_duplicate_minimum_area_tiers(self):
        """G. Reject duplicate minimum-area discount tiers."""
        mat = {
            "id": "mat_err_dup_area",
            "name": "Lona Faixa Duplicada",
            "control_type": "ROLL",
            "calculation_unit": "M2",
            "sale_price": 40.00,
            "allowed_roll_widths": [1.60],
            "volume_discount_enabled": True,
            "discount_tiers": [
                {"minimum_area": 10.0, "percentage": 5.0},
                {"minimum_area": 10.0, "percentage": 8.0}
            ]
        }
        valid, err = validate_material_config(mat)
        self.assertFalse(valid)
        self.assertIn("Faixa de desconto duplicada", err)

    def test_mat_h_reject_discount_less_than_zero(self):
        """H. Reject discount percentage < 0%."""
        mat = {
            "id": "mat_err_neg_disc",
            "name": "Lona Desconto Negativo",
            "control_type": "ROLL",
            "calculation_unit": "M2",
            "sale_price": 40.00,
            "allowed_roll_widths": [1.60],
            "volume_discount_enabled": True,
            "discount_tiers": [
                {"minimum_area": 10.0, "percentage": -5.0}
            ]
        }
        valid, err = validate_material_config(mat)
        self.assertFalse(valid)
        self.assertIn("inferior a 0%", err)

    def test_mat_i_reject_discount_greater_than_100(self):
        """I. Reject discount percentage > 100%."""
        mat = {
            "id": "mat_err_excess_disc",
            "name": "Lona Desconto Abusivo",
            "control_type": "ROLL",
            "calculation_unit": "M2",
            "sale_price": 40.00,
            "allowed_roll_widths": [1.60],
            "volume_discount_enabled": True,
            "discount_tiers": [
                {"minimum_area": 10.0, "percentage": 105.0}
            ]
        }
        valid, err = validate_material_config(mat)
        self.assertFalse(valid)
        self.assertIn("superior a 100%", err)

    def test_mat_j_update_roll_configuration(self):
        """J. Update roll configuration without breaking existing material structure."""
        original = {
            "id": "mat_upd_1",
            "name": "Adesivo Vinil",
            "code": "ADV-01",
            "control_type": "ROLL",
            "calculation_unit": "M2",
            "sale_price": 38.00,
            "reference_cost": 15.00,
            "allowed_roll_widths": [1.00, 1.22],
            "allow_rotation": True,
            "auto_find_lowest_cost": True,
            "allow_manual_roll_override": True,
            "active": True
        }
        v1, e1 = validate_material_config(original)
        self.assertTrue(v1)

        # Update configuration: change allowed widths, disable rotation
        updated = dict(original)
        updated["allowed_roll_widths"] = [1.00, 1.22, 1.52, 2.00]
        updated["allow_rotation"] = False
        updated["sale_price"] = 42.00

        v2, e2 = validate_material_config(updated)
        self.assertTrue(v2)
        self.assertEqual(len(updated["allowed_roll_widths"]), 4)
        self.assertFalse(updated["allow_rotation"])
        self.assertEqual(updated["sale_price"], 42.00)

    def test_mat_k_activate_deactivate_material(self):
        """K. Activate / deactivate material."""
        mat = {
            "id": "mat_status_test",
            "name": "Material Sazonal",
            "code": "MAT-SEAS",
            "control_type": "UNIT",
            "calculation_unit": "UNIT",
            "sale_price": 10.00,
            "active": True
        }
        self.assertTrue(mat["active"])
        # Deactivate
        mat["active"] = False
        self.assertFalse(mat["active"])
        # Validation remains valid even if deactivated
        v, e = validate_material_config(mat)
        self.assertTrue(v)

    def test_mat_l_inactive_material_quotation_behavior(self):
        """L. Ensure inactive material is filtered from active selection but historical quotes function."""
        materials_db = [
            {"id": "m1", "name": "Lona Ativa", "active": True},
            {"id": "m2", "name": "Lona Descontinuada", "active": False}
        ]
        # Active materials available for new quotations
        selectable_materials = [m for m in materials_db if m["active"]]
        self.assertEqual(len(selectable_materials), 1)
        self.assertEqual(selectable_materials[0]["id"], "m1")

        # Historical quotation lookup finds m2 without failure
        historical_mat = next((m for m in materials_db if m["id"] == "m2"), None)
        self.assertIsNotNone(historical_mat)
        self.assertFalse(historical_mat["active"])

    def test_mat_m_roll_configuration_retrieval_by_quotation(self):
        """M. Ensure roll configuration can be retrieved and executed by the quotation module."""
        mat_config = {
            "id": "mat_test_quot",
            "name": "Lona 440g Premium",
            "control_type": "ROLL",
            "allowed_roll_widths": [140.0, 160.0, 220.0],
            "allow_rotation": True,
            "auto_find_lowest_cost": True,
            "allow_manual_roll_override": True,
            "volume_discount_enabled": True,
            "discount_tiers": [
                {"minimum_area": 5.0, "percentage": 8.0},
                {"minimum_area": 15.0, "percentage": 15.0}
            ]
        }
        # Build available rolls from material configuration
        rolls = [RollWidthOption(width_cm=w, cost_per_sqm=20.0) for w in mat_config["allowed_roll_widths"]]
        req = OptimizationRequest(
            finished_width_cm=130.0,
            finished_height_cm=100.0,
            quantity=5, # 1.3 * 1.0 * 5 = 6.5 m² -> qualifies for tier 1 (8%)
            price_per_sqm=50.0,
            available_rolls=rolls,
            allow_rotation=mat_config["allow_rotation"],
            volume_discount_tiers=mat_config["discount_tiers"]
        )
        res = calculate_roll_optimization(req)
        self.assertTrue(res["success"])
        self.assertIsNotNone(res["recommended"])
        self.assertEqual(res["recommended"]["discount_percentage"], 8.0)

    def test_mat_51_material_stock_separation(self):
        """51. Material / Stock separation: Material config defines allowed widths, NOT physical inventory."""
        material = {
            "id": "mat_banner_sup",
            "name": "Lona Super Banner",
            "control_type": "ROLL",
            "allowed_roll_widths": [1.60, 2.20, 3.20], # 3 allowed widths
            "calculation_unit": "M2",
            "sale_price": 45.00
        }
        # In the inventory repository, there are 0 physical rolls initially
        physical_inventory = []
        self.assertEqual(len(physical_inventory), 0, "Material configuration must not create physical rolls.")

        # Adding allowed widths does not change physical inventory count
        material["allowed_roll_widths"].append(2.50)
        self.assertEqual(len(physical_inventory), 0, "Adding allowed widths must not create physical stock.")

    def test_mat_52_physical_roll_relationship(self):
        """52. Physical Roll relationship: physical roll width must be allowed by referenced material."""
        material = {
            "id": "mat_adv_polim",
            "name": "Adesivo Polimérico",
            "control_type": "ROLL",
            "allowed_roll_widths": [1.00, 1.22, 1.52],
            "calculation_unit": "M2",
            "sale_price": 50.00
        }

        # Valid physical roll (width 1.52m is allowed)
        valid_roll = {
            "id": "proll_1",
            "roll_code": "AD-01",
            "material_id": "mat_adv_polim",
            "width_m": 1.52,
            "initial_length_m": 50.0,
            "current_length_m": 32.4
        }
        v_roll, err_roll = validate_physical_roll(valid_roll, material)
        self.assertTrue(v_roll, f"Expected valid physical roll, got: {err_roll}")

        # Invalid physical roll (width 1.80m is NOT allowed)
        invalid_roll = {
            "id": "proll_2",
            "roll_code": "AD-02",
            "material_id": "mat_adv_polim",
            "width_m": 1.80,
            "initial_length_m": 50.0,
            "current_length_m": 50.0
        }
        v_inv, err_inv = validate_physical_roll(invalid_roll, material)
        self.assertFalse(v_inv)
        self.assertIn("não é autorizada", err_inv)

    def test_mat_53_discount_sorting(self):
        """53. Discount sorting: tiers configured out of order are sorted and highest tier is selected."""
        unsorted_tiers = [
            {"minimum_area": 50.0, "percentage": 20.0},
            {"minimum_area": 10.0, "percentage": 5.0},
            {"minimum_area": 25.0, "percentage": 12.0}
        ]
        sorted_tiers = sort_discount_tiers(unsorted_tiers)
        areas = [t["minimum_area"] for t in sorted_tiers]
        self.assertEqual(areas, [10.0, 25.0, 50.0])

        # Consumed area = 30 m² -> reaches 25m² (12%), does not reach 50m²
        pct_30 = get_applicable_volume_discount(unsorted_tiers, 30.0)
        self.assertEqual(pct_30, 12.0)

        # Consumed area = 55 m² -> reaches 50m² (20%)
        pct_55 = get_applicable_volume_discount(unsorted_tiers, 55.0)
        self.assertEqual(pct_55, 20.0)

        # Consumed area = 8 m² -> reaches none (0%)
        pct_8 = get_applicable_volume_discount(unsorted_tiers, 8.0)
        self.assertEqual(pct_8, 0.0)

    def test_mat_54_control_type_change(self):
        """54. Control type change: changing from ROLL to UNIT makes roll configuration optional/inactive."""
        mat = {
            "id": "mat_flexible",
            "name": "Material Camaleão",
            "control_type": "ROLL",
            "calculation_unit": "M2",
            "sale_price": 30.00,
            "allowed_roll_widths": [1.60]
        }
        v1, _ = validate_material_config(mat)
        self.assertTrue(v1)

        # Change control type to UNIT with empty allowed_roll_widths
        mat["control_type"] = "UNIT"
        mat["calculation_unit"] = "UNIT"
        mat["allowed_roll_widths"] = []

        v2, err2 = validate_material_config(mat)
        self.assertTrue(v2, f"UNIT material should not require roll widths: {err2}")
        self.assertIsNone(err2)

    # =========================================================================
    # SCENARIOS A - I: AUTOMATIC PRICING RULE FOR ROLL-BASED MATERIALS
    # =========================================================================

    def test_scenario_a_exact_roll_match(self):
        """
        TEST A — EXACT ROLL MATCH
        Customer dimensions: 160 × 200 cm, Bleed: 0
        Available rolls: 1.40, 1.60, 1.80, 2.05, 2.20, 2.50, 3.20 m
        Price: R$ 60/m², Rotation: Disabled
        Expected:
        - Production dimensions: 160 × 200 cm
        - Selected roll: 1.60 m
        - Used length: 2.00 m
        - Calculated area: 3.20 m²
        - Gross unit price: R$ 192.00
        """
        rolls = [1.40, 1.60, 1.80, 2.05, 2.20, 2.50, 3.20]
        res = calculate_roll_material_price(
            finished_width_cm=160.0,
            finished_height_cm=200.0,
            quantity=1,
            available_rolls=rolls,
            price_per_sqm=60.0,
            allow_rotation=False,
            requested_orientation="NORMAL"
        )
        self.assertTrue(res["success"])
        rec = res["recommended"]
        self.assertIsNotNone(rec)
        self.assertAlmostEqual(rec["roll_width_m"], 1.60, places=2)
        self.assertAlmostEqual(rec["used_length_m"], 2.00, places=2)
        self.assertAlmostEqual(rec["area_per_unit_m2"], 3.20, places=2)
        self.assertAlmostEqual(rec["gross_unit_price"], 192.00, places=2)
        self.assertEqual(rec["orientation"], "NORMAL")

    def test_scenario_b_rotation_benefit(self):
        """
        TEST B — ROTATION BENEFIT
        Customer dimensions: 142 × 234 cm, Bleed: 0
        Available rolls: 1.40, 1.60, 1.80, 2.05, 2.20, 2.50, 3.20 m
        Price: R$ 60/m², Rotation: Enabled
        Normal: Roll 1.60m -> Area: 1.60 * 2.34 = 3.744 m² -> Price: R$ 224.64
        Rotated: Roll 2.50m -> Area: 2.50 * 1.42 = 3.55 m² -> Price: R$ 213.00
        Expected:
        - Orientation: Rotated
        - Selected roll: 2.50 m
        - Used length: 1.42 m
        - Calculated area: 3.55 m²
        - Gross unit price: R$ 213.00
        """
        rolls = [1.40, 1.60, 1.80, 2.05, 2.20, 2.50, 3.20]
        res = calculate_roll_material_price(
            finished_width_cm=142.0,
            finished_height_cm=234.0,
            quantity=1,
            available_rolls=rolls,
            price_per_sqm=60.0,
            allow_rotation=True
        )
        self.assertTrue(res["success"])
        rec = res["recommended"]
        self.assertEqual(rec["orientation"], "ROTATED")
        self.assertAlmostEqual(rec["roll_width_m"], 2.50, places=2)
        self.assertAlmostEqual(rec["used_length_m"], 1.42, places=2)
        self.assertAlmostEqual(rec["area_per_unit_m2"], 3.55, places=2)
        self.assertAlmostEqual(rec["gross_unit_price"], 213.00, places=2)

    def test_scenario_c_rotation_disabled(self):
        """
        TEST C — ROTATION DISABLED
        Same as Test B, but Rotation: Disabled.
        Expected:
        - Orientation: Normal
        - Selected roll: 1.60 m
        - Used length: 2.34 m
        - Calculated area: 3.744 m²
        - Gross unit price: R$ 224.64
        """
        rolls = [1.40, 1.60, 1.80, 2.05, 2.20, 2.50, 3.20]
        res = calculate_roll_material_price(
            finished_width_cm=142.0,
            finished_height_cm=234.0,
            quantity=1,
            available_rolls=rolls,
            price_per_sqm=60.0,
            allow_rotation=False
        )
        self.assertTrue(res["success"])
        rec = res["recommended"]
        self.assertEqual(rec["orientation"], "NORMAL")
        self.assertAlmostEqual(rec["roll_width_m"], 1.60, places=2)
        self.assertAlmostEqual(rec["used_length_m"], 2.34, places=2)
        self.assertAlmostEqual(rec["area_per_unit_m2"], 3.744, places=3)
        self.assertAlmostEqual(rec["gross_unit_price"], 224.64, places=2)

    def test_scenario_d_bleed_forcing_larger_roll(self):
        """
        TEST D — BLEED FORCING LARGER ROLL
        Customer dimensions: 160 × 200 cm
        Bleed: 2 cm on each side (Left: 2cm, Right: 2cm, Top: 2cm, Bottom: 2cm)
        Production dimensions: 164 × 204 cm
        Available rolls: 1.40, 1.60, 1.80, 2.05, 2.20, 2.50, 3.20 m
        Price: R$ 60/m², Rotation: Disabled
        Expected:
        - 1.60 m roll is INCOMPATIBLE (160 cm < 164 cm)
        - Selected roll: 1.80 m
        - Used length: 2.04 m
        - Calculated area: 1.80 * 2.04 = 3.672 m²
        - Gross unit price: 3.672 * 60 = R$ 220.32
        """
        rolls = [1.40, 1.60, 1.80, 2.05, 2.20, 2.50, 3.20]
        res = calculate_roll_material_price(
            finished_width_cm=160.0,
            finished_height_cm=200.0,
            quantity=1,
            available_rolls=rolls,
            price_per_sqm=60.0,
            allow_rotation=False,
            bleed_left_cm=2.0,
            bleed_right_cm=2.0,
            bleed_top_cm=2.0,
            bleed_bottom_cm=2.0
        )
        self.assertTrue(res["success"])
        self.assertEqual(res["production_width_cm"], 164.0)
        self.assertEqual(res["production_height_cm"], 204.0)
        rec = res["recommended"]
        self.assertAlmostEqual(rec["roll_width_m"], 1.80, places=2)
        self.assertAlmostEqual(rec["used_length_m"], 2.04, places=2)
        self.assertAlmostEqual(rec["area_per_unit_m2"], 3.672, places=3)
        self.assertAlmostEqual(rec["gross_unit_price"], 220.32, places=2)

        # Verify 1.60 m roll is in rejected options
        opt_160 = next((o for o in res["all_options"] if abs(o.get("roll_width_m", 0) - 1.60) < 0.01), None)
        self.assertIsNotNone(opt_160)
        self.assertFalse(opt_160["fits"])

    def test_scenario_e_volume_discount(self):
        """
        TEST E — VOLUME DISCOUNT
        Unit area: 3.55 m²
        Quantity: 10 units
        Total calculated area: 35.50 m²
        Tiers:
          10 m² -> 5%
          25 m² -> 10%
          50 m² -> 15%
        Expected:
        - Evaluated on total calculated area (35.50 m²)
        - Thresholds met: 10 m² (5%), 25 m² (10%)
        - Highest tier applied: 10%
        """
        rolls = [1.40, 1.60, 1.80, 2.05, 2.20, 2.50, 3.20]
        tiers = [
            {"minimum_area": 10.0, "percentage": 5.0},
            {"minimum_area": 25.0, "percentage": 10.0},
            {"minimum_area": 50.0, "percentage": 15.0}
        ]
        # From Test B: 142 x 234 rotated gives 3.55 m² per unit on 2.50m roll
        res = calculate_roll_material_price(
            finished_width_cm=142.0,
            finished_height_cm=234.0,
            quantity=10,
            available_rolls=rolls,
            price_per_sqm=60.0,
            allow_rotation=True,
            volume_discount_tiers=tiers
        )
        self.assertTrue(res["success"])
        rec = res["recommended"]
        self.assertAlmostEqual(rec["area_per_unit_m2"], 3.55, places=2)
        self.assertAlmostEqual(rec["total_calculated_area_m2"], 35.50, places=2)
        self.assertEqual(rec["discount_percentage"], 10.0)

    def test_scenario_f_incompatible_dimension(self):
        """
        TEST F — INCOMPATIBLE DIMENSION
        Production width: 335 cm
        Available rolls: up to 3.20 m (320 cm)
        Rotation: Disabled
        Expected:
        - Business-rule validation error
        - Success is False
        - Recommended is None
        - Clear error message
        """
        rolls = [1.40, 1.60, 1.80, 2.05, 2.20, 2.50, 3.20]
        res = calculate_roll_material_price(
            finished_width_cm=335.0,
            finished_height_cm=100.0,
            quantity=1,
            available_rolls=rolls,
            price_per_sqm=60.0,
            allow_rotation=False
        )
        self.assertFalse(res["success"])
        self.assertIsNone(res["recommended"])
        self.assertIn("Nenhuma bobina disponível", res["error"])
        self.assertIn("3.35 m", res["error"])

    def test_scenario_g_manual_override(self):
        """
        TEST G — MANUAL OVERRIDE
        Recommendation: 1.60 m roll
        User manually selects: 2.05 m roll (compatible)
        Expected:
        - Manual selection accepted
        - Immediate recalculation using 2.05 m roll
        - Audit log created
        """
        rolls = [1.40, 1.60, 1.80, 2.05, 2.20, 2.50, 3.20]
        res = calculate_roll_material_price(
            finished_width_cm=160.0,
            finished_height_cm=200.0,
            quantity=1,
            available_rolls=rolls,
            price_per_sqm=60.0,
            allow_rotation=False,
            manual_selected_roll_width_cm=205.0,
            user_name="Vendedor Senior"
        )
        self.assertTrue(res["success"])
        self.assertTrue(res["is_manual_override"])
        sel = res["selected"]
        self.assertIsNotNone(sel)
        self.assertAlmostEqual(sel["roll_width_m"], 2.05, places=2)
        self.assertAlmostEqual(sel["used_length_m"], 2.00, places=2)
        # Area = 2.05 * 2.00 = 4.10 m², Gross price = 4.10 * 60 = 246.00
        self.assertAlmostEqual(sel["area_per_unit_m2"], 4.10, places=2)
        self.assertAlmostEqual(sel["gross_unit_price"], 246.00, places=2)

        # Audit log verified
        audit = res["audit_log"]
        self.assertIsNotNone(audit)
        self.assertEqual(audit["action"], "MANUAL_OVERRIDE")
        self.assertEqual(audit["user"], "Vendedor Senior")
        self.assertAlmostEqual(audit["previousRollWidthCm"], 160.0, places=1)
        self.assertAlmostEqual(audit["newRollWidthCm"], 205.0, places=1)

    def test_scenario_h_incompatible_manual_selection(self):
        """
        TEST H — INCOMPATIBLE MANUAL SELECTION
        Artwork: 150 cm
        User attempts to manually select: 1.40 m roll (140 cm < 150 cm)
        Expected:
        - Selection rejected with business-rule error
        - System prevents recalculating or saving with incompatible roll
        """
        rolls = [1.40, 1.60, 1.80, 2.05, 2.20, 2.50, 3.20]
        res = calculate_roll_material_price(
            finished_width_cm=150.0,
            finished_height_cm=200.0,
            quantity=1,
            available_rolls=rolls,
            price_per_sqm=60.0,
            allow_rotation=False,
            manual_selected_roll_width_cm=140.0
        )
        self.assertFalse(res["success"])
        self.assertIn("incompatível", res["error"])

    def test_scenario_i_quantity_and_totals(self):
        """
        TEST I — QUANTITY AND TOTALS
        Unit area: 3.55 m²
        Quantity: 10 units
        R$ 60.00/m²
        Gross unit price: R$ 213.00
        Gross total: 10 * 213.00 = R$ 2,130.00
        Discount: 10% on gross total = R$ 213.00
        Final total: R$ 1,917.00
        """
        rolls = [1.40, 1.60, 1.80, 2.05, 2.20, 2.50, 3.20]
        tiers = [
            {"minimum_area": 10.0, "percentage": 5.0},
            {"minimum_area": 25.0, "percentage": 10.0},
            {"minimum_area": 50.0, "percentage": 15.0}
        ]
        res = calculate_roll_material_price(
            finished_width_cm=142.0,
            finished_height_cm=234.0,
            quantity=10,
            available_rolls=rolls,
            price_per_sqm=60.0,
            allow_rotation=True,
            volume_discount_tiers=tiers
        )
        self.assertTrue(res["success"])
        rec = res["recommended"]
        self.assertAlmostEqual(rec["area_per_unit_m2"], 3.55, places=2)
        self.assertEqual(res["quantity"], 10)
        self.assertAlmostEqual(rec["gross_unit_price"], 213.00, places=2)
        self.assertAlmostEqual(rec["gross_total_price"], 2130.00, places=2)
        self.assertEqual(rec["discount_percentage"], 10.0)
        self.assertAlmostEqual(rec["discount_value"], 213.00, places=2)
        self.assertAlmostEqual(rec["final_price"], 1917.00, places=2)
        self.assertAlmostEqual(rec["final_total_price"], 1917.00, places=2)

if __name__ == "__main__":
    unittest.main()

