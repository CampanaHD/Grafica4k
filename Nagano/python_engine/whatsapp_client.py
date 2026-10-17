"""
WhatsApp Business Cloud API Integration Client for Brazilian Print Shop.
Generates compliant Portuguese customer notification messages and handles API delivery queues.
"""

from typing import Dict, Any, Optional

class WhatsAppClient:
    def __init__(self, phone_number_id: Optional[str] = None, access_token: Optional[str] = None):
        self.phone_number_id = phone_number_id or ""
        self.access_token = access_token or ""

    def format_quotation_message(self, data: Dict[str, Any], validity_days: int = 7) -> str:
        """
        Formats quotation message strictly following Brazilian Portuguese requirements.
        """
        cliente = data.get("customer_name", "Cliente")
        pedido = data.get("description", "Serviço Gráfico")
        cores = data.get("colors", "4x0 (Colorido)")
        
        w = data.get("width_cm", 0)
        h = data.get("height_cm", 0)
        medida = f"{w:.0f}x{h:.0f} cm" if w and h else data.get("dimensions_text", "Sob Medida")
        
        material = data.get("material_name", "Lona Frontlight")
        quantidade = str(data.get("quantity", 1))
        enobrecimento = data.get("enobrecimento", "Sem verniz/laminação")
        acabamento = data.get("finishing_text", "Bainha e Ilhós")
        instalacao = data.get("installation_text", "Não inclusa")
        total = f"{data.get('total_amount', 0.0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        prazo = data.get("deadline_text", "3 dias úteis")
        obs = data.get("notes", "Sem observações adicionais.")

        lines = [
            "📄 Orçamento Finalizado!",
            "",
            f"Cliente: **{cliente}**",
            "",
            f"Pedido: **{pedido}**",
            f"Cores: **{cores}**",
            f"Medida: **{medida}**",
            f"Material: **{material}**",
            f"Quantidade: **{quantidade}**",
            f"Enobrecimento: **{enobrecimento}**",
            f"Acabamento: **{acabamento}**",
            f"Instalação: **{instalacao}**",
            "",
            f"Total: R$ {total}",
            "",
            f"Prazo Máximo: **{prazo}**",
            "",
            "> Considerar prazo de produção após a aprovação do layout!",
            "",
            "Observações:",
            obs,
            "",
            f"Orçamento válido por {validity_days} dias."
        ]
        return "\n".join(lines)

    def queue_notification(self, recipient_phone: str, message_text: str, event_type: str) -> Dict[str, Any]:
        """
        Queues WhatsApp message for cloud delivery.
        """
        clean_phone = "".join(filter(str.isdigit, recipient_phone or ""))
        if len(clean_phone) == 10 or len(clean_phone) == 11:
            clean_phone = "55" + clean_phone  # Add Brazil country code if omitted
            
        return {
            "success": True,
            "status": "QUEUED",
            "recipient": clean_phone,
            "event_type": event_type,
            "message": message_text
        }
