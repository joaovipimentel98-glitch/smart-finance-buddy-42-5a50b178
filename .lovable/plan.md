
# Bot WhatsApp para lançar gastos

Fluxo: usuário manda "gastei 35 no ifood ontem" → Meta entrega no webhook do app → IA extrai os campos → transação é criada na conta do usuário → bot responde confirmando.

## O que você precisa fazer no Meta (fora do app)

1. Criar um app em **developers.facebook.com** → produto **WhatsApp**.
2. Anotar: `Phone Number ID`, `WhatsApp Business Account ID`, gerar um **Permanent Access Token** e escolher um **Verify Token** (string aleatória sua).
3. Cadastrar o webhook apontando pra `https://smart-finance-buddy-42.lovable.app/api/public/whatsapp/webhook` e assinar o campo `messages`.

Depois disso eu peço esses valores via `add_secret` (`META_WA_TOKEN`, `META_WA_PHONE_ID`, `META_WA_VERIFY_TOKEN`).

## O que eu construo no app

### 1. Banco (migration)
- Coluna `profiles.whatsapp_e164` (text, unique) — número normalizado (+55...).
- Coluna `profiles.whatsapp_verified_at` (timestamptz).
- Tabela `whatsapp_pairing_codes` (user_id, code, expires_at) — pra confirmar posse do número.
- Tabela `whatsapp_messages_log` (wa_message_id unique, user_id, direction, body, created_at) — dedupe + auditoria.
- RLS + GRANTs padrão.

### 2. UI de perfil (`/_authenticated/profile`)
- Campo "Número do WhatsApp" + botão **Vincular**.
- Ao clicar: gera código de 6 dígitos, mostra na tela e instrui o usuário a mandar `#vincular 123456` pro bot. Quando o webhook receber esse comando vindo desse número, grava `whatsapp_e164` + `whatsapp_verified_at`.
- Estado "Vinculado ✓" + botão desvincular.

### 3. Webhook público (`src/routes/api/public/whatsapp/webhook.ts`)
- `GET`: responde o handshake do Meta (`hub.challenge`) validando `hub.verify_token`.
- `POST`:
  - Valida assinatura `X-Hub-Signature-256` com HMAC-SHA256 do body cru usando o App Secret.
  - Faz parse do payload, ignora status/reactions, processa só `messages[].type === "text"`.
  - Dedupe por `wa_message_id`.
  - Resolve o `user_id` pelo `from` (E.164). Se não achar: responde "número não vinculado, cadastre em [link]".
  - Se corpo começa com `#vincular <código>`: valida o código não expirado e conclui pareamento.
  - Caso contrário: chama a extração via IA (abaixo) e insere a transação com `supabaseAdmin`.
  - Envia resposta pelo Graph API: `POST /v22.0/{phone_id}/messages` confirmando (ex.: "✓ R$ 35,00 · Delivery · iFood · 12/07"). Em erro de parsing, pede reformulação.

### 4. Extração com IA (`src/lib/whatsapp/extract.server.ts`)
- Usa Lovable AI Gateway (`LOVABLE_API_KEY`, modelo `google/gemini-3.5-flash`) com AI SDK.
- Recebe: texto do usuário + lista de categorias existentes do usuário + data atual (fuso America/Sao_Paulo).
- Retorna JSON: `{ amount, transaction_type, description, category, merchant?, date }`. Sem `.min/.max` no schema; validação em código.
- Se `amount` ausente ou <= 0, retorna erro pro webhook responder pedindo reformulação.

### 5. Segurança
- `App Secret` do Meta em `META_WA_APP_SECRET` (assinatura do webhook).
- Verify token comparado com `timingSafeEqual`.
- Rate limit simples por número (contagem em `whatsapp_messages_log` últimos 60s).
- Nunca logar tokens; erros do Graph vão pra `console.error` no server function log.

## Arquivos criados/editados
- `supabase/migrations/*_whatsapp.sql` (nova)
- `src/routes/api/public/whatsapp/webhook.ts` (nova)
- `src/lib/whatsapp/extract.server.ts` (nova)
- `src/lib/whatsapp/send.server.ts` (nova — wrapper do Graph API)
- `src/lib/whatsapp/pairing.functions.ts` (nova — gerar/consultar código)
- `src/routes/_authenticated.profile.tsx` (editar — seção WhatsApp)

## Secrets que vou pedir depois de você criar o app no Meta
- `META_WA_TOKEN` (Permanent Access Token)
- `META_WA_PHONE_ID`
- `META_WA_VERIFY_TOKEN`
- `META_WA_APP_SECRET`

## Fora do escopo desta iteração
- Envio de áudio / imagem de comprovante (dá pra adicionar depois com Whisper + Vision).
- Templates aprovados pra iniciar conversa proativamente (só respondemos dentro da janela de 24h).
- Múltiplos números por usuário.
