## Objetivo

Quando o chat falhar, ter na própria tela `/chat` um painel discreto mostrando:
- Status do usuário (autenticado, token presente/expirando).
- Tamanho da última requisição enviada (bytes/KB e nº de mensagens).
- IDs de correlação para casar com os logs do AI Gateway: `request_id` (gerado pelo client), `X-Lovable-AIG-Run-ID` e `X-Lovable-AIG-Log-ID` retornados pelo gateway.
- Status HTTP da última resposta + erro redigido (sem segredos).

Tudo opt-in: um botão "Diagnóstico" no header do chat abre/fecha o painel; não polui a UI normal.

## Mudanças

### 1. `src/routes/api/chat.ts` (server)
- Ler `X-Request-Id` enviado pelo client (ou gerar um `crypto.randomUUID()` se ausente).
- Passar `initialRunId` do header `X-Lovable-AIG-Run-ID` (se houver) ao criar o provider Lovable — usar o helper `createLovableAiGatewayProvider` do knowledge `ai-sdk-lovable-gateway` em vez do `createOpenAICompatible` cru atual, para capturar headers `X-Lovable-AIG-*` do upstream.
- Encaminhar de volta na resposta (streaming e erro):
  - `X-Request-Id` (eco do client)
  - `X-Lovable-AIG-Run-ID` / `X-Lovable-AIG-Log-ID` via `withLovableAiGatewayRunIdHeader` + `getLovableAiGatewayResponseHeaders` (expõe via `Access-Control-Expose-Headers`).
- Em erros 4xx/5xx, incluir um JSON body `{ error, requestId, provider }` (já redigido por `redactSecrets`) em vez do texto cru.

### 2. `src/lib/ai-gateway.server.ts`
- Substituir o `lovableProvider()` atual pelo helper canônico `createLovableAiGatewayProvider(key, initialRunId?)` (mantém header `X-Lovable-AIG-SDK`, captura `X-Lovable-AIG-Run-ID` por request).
- `getChatModels` passa a aceitar `initialRunId` opcional e devolve também o objeto `gateway` (com `waitForRunId`) para o handler usar no wrap da resposta.

### 3. `src/routes/_authenticated.chat.tsx` (client)
- Novo estado `diagnostics`:
  ```ts
  {
    userId, tokenPresent, tokenExpiresIn,
    lastRequestId, lastRequestBytes, lastMessageCount,
    lastResponseStatus, lastRunId, lastLogId,
    lastErrorRedacted
  }
  ```
- Trocar `DefaultChatTransport` por um pequeno transport custom (ou usar `fetch` middleware) que:
  - Gera `requestId = crypto.randomUUID()` por envio e injeta no header `X-Request-Id`.
  - Mede `JSON.stringify(body).length` antes do POST.
  - Captura `response.status` e headers `X-Lovable-AIG-Run-ID` / `X-Lovable-AIG-Log-ID` / `X-Request-Id` do echo.
  - Atualiza o `diagnostics` state.
- Em `onError`, salva `lastErrorRedacted` (a mensagem já vem redigida do server).
- Botão "Diagnóstico" (ícone `Bug` ou `Activity`) no header abre um painel colapsável `<details>` mostrando todos os campos + botão "Copiar" que copia um JSON para o usuário colar na conversa comigo.

### 4. Sem mudanças em outras telas
Diagnóstico fica isolado em `/chat`. Não toca em insights, importação, etc.

## Detalhes técnicos

```text
client send                server                  gateway
-----------                ------                  -------
X-Request-Id: r1   ─────►  log "[chat] r1 start"
                            createLovableAiGatewayProvider(key)
                            streamText(...)        ───► returns X-Lovable-AIG-Run-ID: g1
                                                         X-Lovable-AIG-Log-ID:  l1
withLovableAiGatewayRunIdHeader wraps response
   ◄───── headers: X-Request-Id: r1, X-Lovable-AIG-Run-ID: g1, X-Lovable-AIG-Log-ID: l1
```

Painel renderizado (exemplo):

```text
Status:    ✓ autenticado (token válido por 58min)
User:      0c285920…a60b
Última req: 3 mensagens · 2.4 KB · id=r1
Resposta:  HTTP 200 · run=g1 · log=l1
Erro:      —
[Copiar diagnóstico]
```

## Verificação

1. Build/typecheck do projeto.
2. Abrir `/chat`, enviar 1 mensagem, abrir painel: ver `lastRunId` e `lastLogId` preenchidos, status 200.
3. Forçar falha (ex.: enviar payload simulado >256KB) e confirmar que o painel mostra status 413 + `requestId`, sem vazar segredos.
4. Rodar `bun test` (passa nos testes existentes de `redact-secrets` e `no-secret-leaks`).

## Fora de escopo

- Não muda o modelo, system prompt, tools ou storage de histórico.
- Não adiciona persistência de threads.
- Não altera UI dos outros caminhos do chat (sugestões, markdown render).
