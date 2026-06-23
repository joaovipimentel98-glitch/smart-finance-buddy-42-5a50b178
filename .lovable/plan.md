
# Finance AI Dashboard — Plano de Construção

Projeto grande. Vou entregar em fases priorizando o núcleo funcional (importação + dashboard + IA) antes dos refinamentos. Tudo single-user, tema escuro, estilo Nubank/Notion.

## Stack confirmada
- TanStack Start + React + TypeScript + Tailwind v4 (já no template)
- **Lovable Cloud** (Supabase gerenciado) para banco e auth de 1 usuário
- **Lovable AI Gateway** (`google/gemini-3-flash-preview`) — substitui OpenAI direto (mesma qualidade, sem precisar de chave do usuário)
- Recharts para gráficos
- Parsers no servidor: `papaparse` (CSV), `xlsx` (XLSX), `ofx-js` (OFX), `pdf-parse` (PDF). OCR de imagens via Gemini multimodal (mais simples e preciso que Tesseract no Worker).

> Observação: troquei OpenAI por Lovable AI (sem custo de setup, sem chave para você gerenciar) e OCR por Gemini multimodal (Tesseract não roda bem no Worker). Se preferir OpenAI explícito eu troco depois.

## Fase 1 — Fundação (esta entrega)
1. Habilitar Lovable Cloud.
2. Auth simples (email/senha, 1 conta).
3. Schema completo: `transactions`, `uploaded_files`, `category_rules`, `financial_insights`, `goals`, `subscriptions`, `categories` (+ seed das 25 categorias padrão), com RLS por `user_id`.
4. Design system dark (Nubank-like: roxo/violeta acentos, neutros profundos, cards arredondados, tipografia limpa).
5. Layout app: sidebar + topbar, rotas protegidas sob `_authenticated`.
6. Dashboard principal com cards superiores, gráfico de evolução (linha), pizza por categoria, fluxo de caixa, maiores gastos. Lê dados reais.
7. Central de Importação: upload CSV/OFX/XLSX/PDF/JPG/PNG → server function que parseia, categoriza (regras + heurística), salva em batch, atualiza `uploaded_files`.
8. Lista/edição de transações com mudança manual de categoria que cria automaticamente uma `category_rule`.
9. Consultor Financeiro (insights) — geração automática via IA a partir das transações.
10. Chat Financeiro — IA com acesso (via tools) a queries agregadas no banco.

## Fase 2 (próxima iteração, se aprovar Fase 1)
- Detector de assinaturas (job que roda no upload + manual).
- Vazamentos financeiros.
- Metas com progresso.
- Score financeiro 0–100.
- Previsão financeira (30/90/180d).
- Alertas inteligentes.
- Relatório mensal exportável (PDF/Excel).

Faseamento é necessário: a spec equivale a ~3–4 sprints. Entregar tudo numa única resposta resultaria em código superficial e bugs. A Fase 1 já entrega um produto utilizável de ponta a ponta.

## Detalhes técnicos
- Server functions em `src/lib/*.functions.ts`, parsers/IA em `*.server.ts`.
- Upload: arquivo vai como base64 para server fn → parser → normalização → insert em lote.
- Categorização: 1) match em `category_rules` por regex no merchant/description, 2) fallback heurístico por palavras-chave, 3) IA classifica o restante em batch (1 chamada Gemini por upload).
- Chat: `streamText` + tools (`getSpendingByCategory`, `getTopMerchants`, `getMonthlyTotals`, `searchTransactions`) — IA consulta o banco, não recebe dump.
- Insights: server fn agendável (por enquanto on-demand) que roda análises SQL + Gemini para gerar texto e grava em `financial_insights`.
- Tema dark: tokens oklch em `src/styles.css` (primary violeta vibrante, background quase preto, surfaces elevadas).

## O que NÃO está na Fase 1
Multi-conta, planos, compartilhamento (fora do escopo por design).
Relatório PDF/Excel, score, metas, previsão, alertas, vazamentos, assinaturas — Fase 2.

Aprovar para eu começar a implementar a Fase 1?
