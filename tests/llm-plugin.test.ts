import { describe, expect, it } from "vitest";
import { parseHints, requestHealHints } from "../src/plugins/llm.js";

describe("optional LLM plugin", () => {
  it("parseHints extracts JSON object from fenced content", () => {
    const hints = parseHints(
      'Here you go:\n```json\n{"hints":[{"field":"title","signals":["h1"],"selectors":[".t"]}]}\n```',
    );
    expect(hints).toEqual([
      { field: "title", signals: ["h1"], selectors: [".t"], note: undefined },
    ]);
  });

  it("disabled plugin has zero impact", async () => {
    const res = await requestHealHints({
      config: {
        enabled: false,
        baseUrl: "https://example.invalid/v1",
        apiKeyEnv: "OPENAI_API_KEY",
        model: "gpt-4o-mini",
        useFor: ["heal_hints"],
      },
      html: "<html></html>",
      fields: [{ name: "title", required: true }],
    });
    expect(res.hints).toEqual([]);
    expect(res.diagnostics).toEqual([]);
  });

  it("mocks HTTP and returns candidate hints", async () => {
    process.env.ADAPARSE_TEST_LLM_KEY = "test-key";
    const res = await requestHealHints({
      config: {
        enabled: true,
        baseUrl: "https://llm.test/v1",
        apiKeyEnv: "ADAPARSE_TEST_LLM_KEY",
        model: "mock",
        useFor: ["heal_hints"],
      },
      html: "<html><h1>X</h1></html>",
      fields: [{ name: "title", required: true }],
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    hints: [{ field: "title", signals: ["h1", "og:title"] }],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });
    expect(res.hints[0]?.field).toBe("title");
    expect(res.diagnostics.some((d) => d.code === "llm_heal_hints")).toBe(true);
    delete process.env.ADAPARSE_TEST_LLM_KEY;
  });

  it("unreachable LLM does not throw", async () => {
    process.env.ADAPARSE_TEST_LLM_KEY = "test-key";
    const res = await requestHealHints({
      config: {
        enabled: true,
        baseUrl: "https://llm.test/v1",
        apiKeyEnv: "ADAPARSE_TEST_LLM_KEY",
        model: "mock",
        useFor: ["heal_hints"],
      },
      html: "<html></html>",
      fields: [{ name: "title", required: true }],
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    expect(res.hints).toEqual([]);
    expect(res.diagnostics[0]?.code).toBe("llm_unreachable");
    delete process.env.ADAPARSE_TEST_LLM_KEY;
  });
});
