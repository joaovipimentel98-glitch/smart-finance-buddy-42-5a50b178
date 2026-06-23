// File parsers (server-only). Produce a normalized list of raw transactions.
import Papa from "papaparse";
import * as XLSX from "xlsx";

export type RawTxn = {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // positive number
  transaction_type: "credit" | "debit";
  merchant?: string;
};

function normalizeAmount(raw: string | number): number {
  if (typeof raw === "number") return raw;
  // Normalize unicode minus/dash variants to ASCII '-'
  const normalized = String(raw).replace(/[−–—]/g, "-");
  // Detect negative sign before stripping currency symbols
  const isNegative = /-/.test(normalized);
  const s = normalized.replace(/[^\d,.]/g, "").trim();
  if (!s) return NaN;
  // Brazilian format: 1.234,56 -> 1234.56
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let cleaned = s;
  if (hasComma && hasDot) cleaned = s.replace(/\./g, "").replace(",", ".");
  else if (hasComma) cleaned = s.replace(",", ".");
  const v = parseFloat(cleaned);
  return isNaN(v) ? NaN : (isNegative ? -v : v);
}

function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // YYYYMMDD
  const m1 = /^(\d{4})(\d{2})(\d{2})/.exec(s);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  // DD/MM/YYYY or DD-MM-YYYY
  const m2 = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/.exec(s);
  if (m2) {
    const y = m2[3].length === 2 ? `20${m2[3]}` : m2[3];
    return `${y}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
  }
  // YYYY-MM-DD
  const m3 = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m3) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export function parseOFX(text: string): RawTxn[] {
  const txns: RawTxn[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const b of blocks) {
    const end = b.indexOf("</STMTTRN>");
    const body = end >= 0 ? b.slice(0, end) : b;
    const get = (tag: string) => {
      const m = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i").exec(body);
      return m ? m[1].trim() : "";
    };
    const dtRaw = get("DTPOSTED");
    const amtRaw = get("TRNAMT");
    const memo = get("MEMO") || get("NAME");
    const date = normalizeDate(dtRaw);
    const amt = normalizeAmount(amtRaw);
    if (!date || isNaN(amt) || !memo) continue;
    txns.push({
      date,
      description: memo,
      amount: Math.abs(amt),
      transaction_type: amt < 0 ? "debit" : "credit",
    });
  }
  return txns;
}

const DATE_KEYS = ["data", "date", "dt", "data movimento", "data de lançamento", "data lançamento"];
const DESC_KEYS = [
  "descricao", "descrição", "description", "historico", "histórico", "memo", "lançamento", "lancamento", "details",
  "origem / destino", "origem/destino", "origem", "destino", "favorecido", "estabelecimento", "beneficiario", "beneficiário", "contraparte",
];
const AMOUNT_KEYS = ["valor", "amount", "value", "vlr", "valor (r$)", "valor r$"];
const DEBIT_KEYS = ["debito", "débito", "saida", "saída", "withdrawal"];
const CREDIT_KEYS = ["credito", "crédito", "entrada", "deposit", "deposito", "depósito"];
const TYPE_KEYS = ["tipo", "type", "operacao", "operação"];

function pick(row: Record<string, unknown>, keys: string[]): string | undefined {
  const lower = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.replace(/^\uFEFF/, "").toLowerCase().trim(), v]),
  );
  for (const k of keys) if (k in lower && lower[k] != null && lower[k] !== "") return String(lower[k]);
  return undefined;
}

function rowToTxn(row: Record<string, unknown>): RawTxn | null {
  const dateRaw = pick(row, DATE_KEYS);
  const desc = pick(row, DESC_KEYS);
  if (!dateRaw || !desc) return null;
  const date = normalizeDate(dateRaw);
  if (!date) return null;

  let amount: number;
  let type: "credit" | "debit";

  const debit = pick(row, DEBIT_KEYS);
  const credit = pick(row, CREDIT_KEYS);
  if (debit && normalizeAmount(debit) > 0) {
    amount = normalizeAmount(debit);
    type = "debit";
  } else if (credit && normalizeAmount(credit) > 0) {
    amount = normalizeAmount(credit);
    type = "credit";
  } else {
    const amtRaw = pick(row, AMOUNT_KEYS);
    if (!amtRaw) return null;
    const v = normalizeAmount(amtRaw);
    if (isNaN(v)) return null;
    amount = Math.abs(v);
    const typeStr = pick(row, TYPE_KEYS);
    // Signed amount takes priority — it's the most reliable signal
    if (v < 0) type = "debit";
    else if (v > 0 && typeStr && /(enviad|pagament|compra|saida|saída|debit|withdraw|transfer.*enviad)/i.test(typeStr)) type = "debit";
    else if (typeStr && /(recebid|entrada|deposit|credit|devolvid|estorno|reembolso)/i.test(typeStr)) type = "credit";
    else type = v < 0 ? "debit" : "credit";
  }

  return { date, description: desc.trim(), amount, transaction_type: type, merchant: desc.trim().slice(0, 80) };
}

export function parseCSV(text: string): RawTxn[] {
  // Strip BOM if present
  const cleaned = text.replace(/^\uFEFF/, "");
  const res = Papa.parse<Record<string, unknown>>(cleaned, {
    header: true,
    skipEmptyLines: true,
    delimitersToGuess: [",", ";", "\t", "|"],
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });
  return res.data.map(rowToTxn).filter((t): t is RawTxn => t != null);
}

export function parseXLSX(buffer: ArrayBuffer): RawTxn[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const out: RawTxn[] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { raw: false });
    for (const r of rows) {
      const t = rowToTxn(r);
      if (t) out.push(t);
    }
  }
  return out;
}
