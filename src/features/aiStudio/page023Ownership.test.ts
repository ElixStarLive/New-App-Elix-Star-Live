import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name.name)) acc.push(p);
  }
  return acc;
}

describe("PAGE-023 ownership", () => {
  it("has a single AI Studio page, session, and tools sheet", () => {
    const files = walk(SRC).map((f) => f.replace(/\\/g, "/"));
    const pages = files.filter((f) => /\/pages\/AIStudio/.test(f) && !f.endsWith(".test.tsx"));
    const sessions = files.filter((f) => /\/aiStudio\/aiStudioSession\.ts$/.test(f));
    const sheets = files.filter((f) => /AiStudioToolsSheet\.tsx$/.test(f));
    expect(pages).toEqual([expect.stringMatching(/\/src\/pages\/AIStudio\.tsx$/)]);
    expect(sessions).toHaveLength(1);
    expect(sheets).toHaveLength(1);
    expect(files.some((f) => /AIStudio(Old|New|Fixed|V2)/.test(f))).toBe(false);
    expect(files.some((f) => /AIToolsPanel/.test(f))).toBe(false);
  });

  it("does not introduce a generation API, provider secret, or fake completion timer", () => {
    const scoped = [
      ...walk(join(SRC, "features", "aiStudio")).filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx")),
      join(SRC, "pages", "AIStudio.tsx"),
      join(SRC, "components", "AiStudioToolsSheet.tsx"),
    ];
    const blob = scoped.map((f) => readFileSync(f, "utf8")).join("\n");
    expect(blob).not.toMatch(/\/api\/ai/);
    expect(blob).not.toMatch(/OPENAI|GEMINI|ANTHROPIC|REPLICATE|STABILITY/i);
    expect(blob).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
    expect(blob).not.toMatch(/setTimeout\s*\(/);
    expect(blob).not.toMatch(/apiUploadVideo|createUploadPublishSession/);
    expect(blob).not.toMatch(/getUserMedia/);
  });
});
