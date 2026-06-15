import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/ai-readiness/route";

describe("GET /api/ai-readiness", () => {
  it("returns offline when Gateway configuration is missing", async () => {
    const originalBase = process.env.LITELLM_BASE_URL;
    const originalKey = process.env.LITELLM_KEY;
    
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_KEY;

    try {
      const response = await GET();
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.status).toBe("offline");
      expect(json.reason).toContain("AI core offline. Gateway failed.");
    } finally {
      process.env.LITELLM_BASE_URL = originalBase;
      process.env.LITELLM_KEY = originalKey;
    }
  });

  it("returns degraded when Gateway is online but Supabase is skipped or failed", async () => {
    const originalBase = process.env.LITELLM_BASE_URL;
    const originalKey = process.env.LITELLM_KEY;
    const originalSupaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalSupaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    process.env.LITELLM_BASE_URL = "https://mock-gateway.v1";
    process.env.LITELLM_KEY = "mock-key";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url: Parameters<typeof fetch>[0]) => {
      if (url.toString().includes('chat/completions')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: "hi" } }] })
        } as Response;
      }
      return { ok: false, status: 500, text: async () => "error" } as Response;
    });

    try {
      const response = await GET();
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.status).toBe("degraded");
      expect(json.reason).toContain("Supabase disconnected");
    } finally {
      process.env.LITELLM_BASE_URL = originalBase;
      process.env.LITELLM_KEY = originalKey;
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupaUrl;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupaKey;
      fetchSpy.mockRestore();
    }
  });
});
