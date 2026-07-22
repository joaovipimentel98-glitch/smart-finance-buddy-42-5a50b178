# Reabrir formulários de segredos do WhatsApp

## Objetivo
Permitir que o usuário insira ou atualize os 4 valores necessários para conectar o robô do WhatsApp ao Meta.

## Segredos a solicitar
1. `WHATSAPP_ACCESS_TOKEN` — token de acesso permanente do app no Meta
2. `WHATSAPP_PHONE_NUMBER_ID` — ID do número de telefone comercial
3. `WHATSAPP_VERIFY_TOKEN` — string secreta usada na verificação do webhook
4. `WHATSAPP_APP_SECRET` — App Secret do app no Meta, usado para validar assinatura dos eventos

## Como usar depois
Após salvar, o webhook `/api/public/whatsapp/webhook` estará pronto para ser cadastrado no painel do Meta com a URL e o verify token informados.

## Fora do escopo
- Nenhuma alteração de código
- Nenhuma mudança no banco de dados