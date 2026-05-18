import { describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/ai-readiness/route";

describe("GET /api/ai-readiness", () => {
  it("returns offline when both keys are missing", async () => {
    const originalAnthropic = process.env.ANTHROPIC_API_KEY;
    const originalGemini = process.env.GEMINI_API_KEY;
    
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      const response = await GET();
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.status).toBe("offline");
      expect(json.reason).toContain("Both Anthropic and Gemini probes failed");
    } finally {
      process.env.ANTHROPIC_API_KEY = originalAnthropic;
      process.env.GEMINI_API_KEY = originalGemini;
    }
  });

  it("returns degraded when only one key is missing", async () => {
    const originalAnthropic = process.env.ANTHROPIC_API_KEY;
    const originalGemini = process.env.GEMINI_API_KEY;
    
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    delete process.env.GEMINI_API_KEY;

    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url: Parameters<typeof fetch>[0]) => {
      if (url.toString().includes('anthropic')) {
        return { ok: true, status: 200, text: async () => "{}" } as Response;
      }
      return { ok: false, status: 500, text: async () => "error" } as Response;
    });

    try {
      const response = await GET();
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.status).toBe("degraded");
      expect(json.reason).toContain("degraded");
    } finally {
      process.env.ANTHROPIC_API_KEY = originalAnthropic;
      process.env.GEMINI_API_KEY = originalGemini;
      fetchSpy.mockRestore();
    }
  });
});
