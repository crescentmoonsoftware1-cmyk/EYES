/** @vitest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => ({
    get: () => null,
  }),
}));

import MainContent from "@/components/MainContent";

describe("MainContent", () => {
  it("renders dashboard and loads API-backed summary", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/dashboard/bootstrap")) {
        return new Response(
          JSON.stringify({
            summary: {
              totalMemories: 20000,
              overallRisk: "LIGHT",
              riskCounts: { heavy: 0, direct: 1, light: 3 },
              flaggedItems: [
                {
                  id: "item-1",
                  severity: "LIGHT",
                  platform: "GitHub",
                  date: "Jan 1, 2024",
                  content: "Example flagged item",
                },
              ],
              comparisonData: [
                {
                  eyes: "1 item found",
                  recruiter: "Might find 0",
                },
              ],
            }
          }),
          { status: 200 }
        );
      }

      if (url.includes("/api/memory-feed")) {
        return new Response(
          JSON.stringify({
            events: [],
            timeline: [],
          }),
          { status: 200 }
        );
      }

      if (url.includes("/api/platform-readiness")) {
        return new Response(
          JSON.stringify({
            platforms: [
              {
                id: "github",
                name: "GitHub",
                connected: true,
                status: "connected",
              },
            ],
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    });

    render(<MainContent />);

    expect(await screen.findByRole("heading", { name: "The EYES" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search digital memories...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/indexed/i)).toBeInTheDocument();
      expect(screen.getByText(/20,000/i)).toBeInTheDocument();
    });

    expect(screen.getByText("Memory Feed")).toBeInTheDocument();
    expect(screen.getByText("Time Line")).toBeInTheDocument();
    expect(screen.getByText("Audit")).toBeInTheDocument();

    fetchMock.mockRestore();
  });
});

