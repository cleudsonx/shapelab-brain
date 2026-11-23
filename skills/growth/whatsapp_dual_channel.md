---
id: skill-growth-whatsapp-dual-channel
version: 1.0.0
status: production-verified
last_verified: 2026-11-22
origin_project: B2B-personal-ia
compatible_subagent: shapelab-backend-qa
stack: [python-3.11, fastapi, httpx, meta-cloud-api, evolution-api]
---

# Skill: Mensageria WhatsApp Dual-Channel com Graceful Degradation

## 1. Objetivo
Garantir entrega resiliente de mensagens transacionais e fluxos conversacionais no WhatsApp usando a **Meta Cloud API Oficial** como canal primário e a **Evolution API** como contingência automática, sem ponto único de falha.

## 2. Contrato de Entrada e Dependências
- **`.env`:** `META_WA_TOKEN`, `META_WA_PHONE_ID`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_FALLBACK_INSTANCE`.
- **Pacotes:** `httpx>=0.27.0`, `pydantic>=2.9.0`.

## 3. Armadilhas Conhecidas (Gotchas de Produção)
- **Limite de 20 Caracteres da Meta:** Botões interativos na Meta Cloud API falham com HTTP 400 se o título ultrapassar 20 caracteres. Trunque ou valide previamente no schema Pydantic.
- **Graceful Degradation para Texto Numérico:** Quando o canal primário falhar ou a instância de contingência não suportar botões nativos, converta automaticamente os botões em lista numerada em texto puro (`*1* - Confirmar\n*2* - Reagendar`) e marque `interactive_degraded: true` no resultado para o parser de webhook saber interpretar a resposta `"1"` ou `"2"`.
- **Roteamento Multi-Instância:** Se a instância dedicada do profissional/tenant estiver desconectada, faça fallback transparente para a instância oficial da plataforma (`EVOLUTION_FALLBACK_INSTANCE`).

## 4. Implementação Agnóstica (Boilerplate)
```python
import httpx
from pydantic import BaseModel, Field


class InteractiveButton(BaseModel):
    id: str
    title: str = Field(max_length=20)


def format_degraded_text(body_text: str, buttons: list[InteractiveButton]) -> str:
    if not buttons:
        return body_text
    options = "\n".join(f"*{idx}* - {btn.title}" for idx, btn in enumerate(buttons, start=1))
    return f"{body_text}\n\nResponda com o número da opção:\n{options}"


async def send_whatsapp_dual_channel(
    phone_e164: str,
    body_text: str,
    buttons: list[InteractiveButton] | None = None,
    meta_token: str = "",
    meta_phone_id: str = "",
    evolution_url: str = "",
    evolution_key: str = "",
    evolution_instance: str = "shapelab-default",
) -> dict:
    buttons = buttons or []

    # 1. Tentativa no Canal Primário (Meta Cloud API Oficial)
    if meta_token and meta_phone_id:
        try:
            meta_url = f"https://graph.facebook.com/v21.0/{meta_phone_id}/messages"
            headers = {"Authorization": f"Bearer {meta_token}", "Content-Type": "application/json"}
            if buttons:
                payload = {
                    "messaging_product": "whatsapp",
                    "to": phone_e164,
                    "type": "interactive",
                    "interactive": {
                        "type": "button",
                        "body": {"text": body_text},
                        "action": {
                            "buttons": [
                                {"type": "reply", "reply": {"id": b.id, "title": b.title[:20]}}
                                for b in buttons[:3]
                            ]
                        },
                    },
                }
            else:
                payload = {
                    "messaging_product": "whatsapp",
                    "to": phone_e164,
                    "type": "text",
                    "text": {"body": body_text},
                }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(meta_url, json=payload, headers=headers)
                if resp.status_code in (200, 201):
                    return {"channel": "meta_cloud", "interactive_degraded": False, "data": resp.json()}
        except httpx.HTTPError:
            pass  # Cai graciosamente para o canal de contingência

    # 2. Fallback Automático com Graceful Degradation (Evolution API)
    degraded_text = format_degraded_text(body_text, buttons)
    evo_endpoint = f"{evolution_url.rstrip('/')}/message/sendText/{evolution_instance}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            evo_endpoint,
            json={"number": phone_e164, "text": degraded_text},
            headers={"apikey": evolution_key, "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        return {
            "channel": "evolution_fallback",
            "interactive_degraded": bool(buttons),
            "data": resp.json(),
        }
```

## 5. Critério de Aceite
1. Com Meta Cloud API online -> envia mensagem interativa com botões nativos (`channel: "meta_cloud"`, `interactive_degraded: false`).
2. Simulando timeout/erro 500 na Meta Cloud API -> faz fallback transparente para Evolution API convertendo botões para opções numéricas (`channel: "evolution_fallback"`, `interactive_degraded: true`).
