import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Static scan: ensure no source file logs/returns a raw secret env var value
 * or hardcodes one. We forbid:
 *   - String literals matching common OpenAI/Bearer secret shapes
 *   - process.env.OPENAI_API_KEY / LOVABLE_API_KEY / SUPABASE_SERVICE_ROLE_KEY
 *     used directly inside console.* or thrown error templates without redactSecrets
 */

const ROOT = join(process.cwd(), "src");
const SECRET_NAMES = ["OPENAI_API_KEY", "LOVABLE_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const FILE_EXT = /\.(ts|tsx|js|jsx)$/;
const SKIP_DIRS = new Set(["__tests__", "node_modules"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (FILE_EXT.test(name)) out.push(full);
  }
  return out;
}

describe("no secret leaks in source", () => {
  const files = walk(ROOT);

  it("does not hardcode sk- style OpenAI keys", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Look for sk- followed by 20+ chars in a string literal context
      if (/["'`]sk-[A-Za-z0-9_-]{20,}["'`]/.test(src)) offenders.push(f);
    }
    expect(offenders, `Hardcoded sk- secret found in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("does not console.log a raw secret env var", () => {
    const offenders: string[] = [];
    const re = new RegExp(
      `console\\.(log|info|warn|error|debug)\\([^)]*process\\.env\\.(${SECRET_NAMES.join("|")})`,
      "s",
    );
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (re.test(src)) offenders.push(f);
    }
    expect(offenders, `Secret env logged directly in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("does not throw/return a raw secret env var in error templates", () => {
    const offenders: string[] = [];
    const re = new RegExp(
      `(throw\\s+new\\s+Error|return\\s+new\\s+Response)\\([^)]*process\\.env\\.(${SECRET_NAMES.join("|")})`,
      "s",
    );
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (re.test(src)) offenders.push(f);
    }
    expect(offenders, `Secret returned/thrown in: ${offenders.join(", ")}`).toEqual([]);
  });
});
