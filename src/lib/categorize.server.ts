// Heuristic keyword-based categorizer used as fallback before AI.
const RULES: Array<{ kw: RegExp; category: string; subcategory?: string }> = [
  { kw: /\b(ifood|rappi|ubereats|uber eats|99food)\b/i, category: "Delivery" },
  { kw: /\b(uber|99 ?app|99 ?tax|cabify|lyft)\b/i, category: "Transporte" },
  { kw: /\b(shell|petrobras|ipiranga|posto|combust)\b/i, category: "Combustível" },
  { kw: /\b(netflix|spotify|prime ?video|disney|hbo|youtube ?premium|chatgpt|openai|claude|github|figma|notion)\b/i, category: "Assinaturas", subcategory: "Streaming" },
  { kw: /\b(carrefour|extra|pão de açúcar|atacad|sams|assa[ií]|big|mercado|hortifruti|supermerc)\b/i, category: "Mercado" },
  { kw: /\b(restaurante|rest\b|bar |padaria|burger|pizza|sushi|cafe|coffee|starbucks)\b/i, category: "Restaurante" },
  { kw: /\b(drogaria|farmacia|farmácia|drogasil|raia|pacheco|pague menos)\b/i, category: "Farmácia" },
  { kw: /\b(academia|smartfit|bluefit|crossfit|gym)\b/i, category: "Academia" },
  { kw: /\b(hospital|clinic|consulta|laboratorio|laboratório|dentista)\b/i, category: "Saúde" },
  { kw: /\b(escola|faculdade|udemy|coursera|alura|curso)\b/i, category: "Educação" },
  { kw: /\b(aluguel|condom[ií]nio|imobili)\b/i, category: "Moradia" },
  { kw: /\b(enel|cemig|cpfl|light|eletro)\b/i, category: "Energia" },
  { kw: /\b(sabesp|sanepar|copasa|caesb|sanea)\b/i, category: "Água" },
  { kw: /\b(vivo|claro|tim|oi|net |internet|fibra)\b/i, category: "Internet" },
  { kw: /\b(amazon|magalu|magazine luiza|shopee|mercado ?livre|aliexpress|americanas)\b/i, category: "Compras" },
  { kw: /\b(latam|gol|azul|hotel|booking|airbnb|decolar)\b/i, category: "Viagem" },
  { kw: /\b(cinema|ingresso|show|evento|teatro)\b/i, category: "Lazer" },
  { kw: /\b(salario|salário|sal\.|pagamento|pix recebido|transferencia recebida|transferência recebida|cred|crédito recebido)\b/i, category: "Trabalho" },
  { kw: /\b(investimento|cdb|tesouro|aplica|resgate)\b/i, category: "Investimentos" },
  { kw: /\b(imposto|iptu|ipva|darf|inss|gps)\b/i, category: "Impostos" },
];

export function heuristicCategory(desc: string): { category: string; subcategory?: string; confidence: number } | null {
  for (const r of RULES) {
    if (r.kw.test(desc)) return { category: r.category, subcategory: r.subcategory, confidence: 0.6 };
  }
  return null;
}
