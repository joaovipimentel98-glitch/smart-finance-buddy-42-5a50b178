import { describe, it, expect, beforeAll } from "vitest";

// Set env BEFORE importing the module so the redactor sees them.
beforeAll(() => {
  process.env.OPENAI_API_KEY = "sk-test-OPENAI-SECRET-1234567890ABCDEF";
  process.env.LOVABLE_API_KEY = "lov-test-LOVABLE-SECRET-ABCDEFGH12345678";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "srv-role-secret-ABCDEFGHIJKLMNOP";
});

async function loadRedact() {
  const mod = await import("../ai-gateway.server");
  return mod.redactSecrets;
}

describe("redactSecrets", () => {
  it("removes the literal OPENAI_API_KEY value", async () => {
    const redact = await loadRedact();
    const out = redact(`boom: ${process.env.OPENAI_API_KEY} happened`);
    expect(out).not.toContain(process.env.OPENAI_API_KEY!);
    expect(out).toContain("[REDACTED]");
  });

  it("removes the LOVABLE_API_KEY value", async () => {
    const redact = await loadRedact();
    const out = redact(`key=${process.env.LOVABLE_API_KEY}`);
    expect(out).not.toContain(process.env.LOVABLE_API_KEY!);
  });

  it("removes the SUPABASE_SERVICE_ROLE_KEY value", async () => {
    const redact = await loadRedact();
    const out = redact(`role=${process.env.SUPABASE_SERVICE_ROLE_KEY}`);
    expect(out).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY!);
  });

  it("redacts generic sk-* OpenAI-style keys not in env", async () => {
    const redact = await loadRedact();
    const out = redact("failed with sk-abcdefghijklmnop1234567890XYZ");
    expect(out).not.toMatch(/sk-abcdefghijklmnop/);
    expect(out).toContain("[REDACTED]");
  });

  it("redacts Bearer tokens", async () => {
    const redact = await loadRedact();
    const out = redact("Authorization: Bearer abcdef1234567890ABCDEF.tok");
    expect(out).not.toMatch(/Bearer\s+abcdef/);
    expect(out).toContain("Bearer [REDACTED]");
  });

  it("returns plain text unchanged", async () => {
    const redact = await loadRedact();
    expect(redact("hello world")).toBe("hello world");
  });

  it("redacts a secret that appears multiple times", async () => {
    const redact = await loadRedact();
    const s = process.env.OPENAI_API_KEY!;
    const out = redact(`${s} and again ${s}`);
    expect(out.split("[REDACTED]").length - 1).toBeGreaterThanOrEqual(2);
    expect(out).not.toContain(s);
  });
});
