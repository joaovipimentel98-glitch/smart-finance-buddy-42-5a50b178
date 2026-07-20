// AI-based extraction of a transaction from free-text WhatsApp messages.
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableGateway, CHAT_MODEL, redactSecrets } from "@/lib/ai-gateway.server";

const ExtractSchema = z.object({
  is_transaction: z.boolean(),
  amount: z.number().nullable(),
  description: z.string().nullable(),
  merchant: z.string().nullable(),
  transaction_type: z.enum(["debit", "credit"]).nullable(),
  category: z.string().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
});

export type ExtractedTx = z.infer<typeof ExtractSchema>;

export async function extractTransactionFromText(
  text: string,
  categories: string[],
): Promise<ExtractedTx> {
  const gw = createLovableGateway();
  const catList = categories.length ? categories.join(", ") : "Alimentação, Transporte, Compras, Outros";
  const prompt = `Você recebe uma mensagem de WhatsApp de um usuário registrando um gasto ou receita pessoal em português brasileiro.

Extraia os campos. Se a mensagem NÃO for um gasto/receita (ex.: saudação, dúvida), retorne is_transaction=false e os outros campos como null.

Regras:
- amount: número positivo em reais (ex.: "50", "R$ 12,50" -> 12.5).
- transaction_type: "debit" para gastos, "credit" para recebimentos (salário, pix recebido, reembolso).
- category: escolha exatamente uma da lista: ${catList}. Se nada encaixar, use "Outros".
- description: frase curta descrevendo o que foi (ex.: "Almoço no iFood").
- merchant: estabelecimento se identificável (ex.: "iFood", "Uber"), senão null.
- confidence: "high" se claramente um gasto com valor, "medium" se ambíguo, "low" se você adivinhou.

Mensagem: """${text.slice(0, 500)}"""`;

  try {
    const { experimental_output } = await generateText({
      model: gw.provider(CHAT_MODEL),
      prompt,
      experimental_output: Output.object({ schema: ExtractSchema }),
    });
    return experimental_output;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) {
      const raw = (e as { text?: string }).text ?? "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return ExtractSchema.parse(JSON.parse(match[0]));
        } catch { /* fallthrough */ }
      }
    }
    console.error("[whatsapp/extract] fail:", redactSecrets(e instanceof Error ? e.message : String(e)));
    return {
      is_transaction: false, amount: null, description: null, merchant: null,
      transaction_type: null, category: null, confidence: "low",
    };
  }
}
