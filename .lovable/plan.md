# Remover o robô do WhatsApp

## Objetivo
Desfazer toda a funcionalidade de WhatsApp adicionada anteriormente: webhook público, tabelas de pareamento/log, seção no perfil e segredos do Meta.

## Atenção
- As tabelas `whatsapp_pairing_codes` e `whatsapp_messages_log` serão excluídas. Códigos pendentes e histórico de mensagens serão perdidos.
- As colunas `whatsapp_e164` e `whatsapp_verified_at` serão removidas da tabela `profiles`.

## Passos

### 1. Banco de dados
Criar migration para dropar tudo relacionado ao WhatsApp:
- Remover colunas `whatsapp_e164` e `whatsapp_verified_at` de `public.profiles`.
- Dropar tabela `public.whatsapp_pairing_codes`.
- Dropar tabela `public.whatsapp_messages_log`.

### 2. Backend
Excluir os arquivos:
- `src/lib/whatsapp.functions.ts`
- `src/lib/whatsapp/send.server.ts`
- `src/lib/whatsapp/extract.server.ts`
- `src/routes/api/public/whatsapp/webhook.ts`
- Remover diretório vazio `src/lib/whatsapp/`

### 3. Frontend
Editar `src/routes/_authenticated.profile.tsx`:
- Remover import de `getWhatsAppStatus`, `createPairingCode`, `unlinkWhatsApp`.
- Remover componente `WhatsAppSection` inteiro.
- Remover uso `<WhatsAppSection />` no JSX.
- Limpar ícones `MessageCircle` e `Copy` do import do Lucide se não forem usados em outro lugar da página.

### 4. Segredos
Apagar os 4 segredos do WhatsApp salvos no projeto:
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`

### 5. Regeneração de rotas
Após excluir `src/routes/api/public/whatsapp/webhook.ts`, o `src/routeTree.gen.ts` será regenerado automaticamente na próxima inicialização do dev server/build.

## Verificação
- Build sem erros.
- Página `/profile` carrega sem a seção "Robô do WhatsApp".
- Endpoint `/api/public/whatsapp/webhook` não existe mais (404).
- Segredos não aparecem mais na listagem do projeto.