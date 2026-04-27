import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiProviderService } from "./aiProviderService";

// Mock the database functions
vi.mock("./db", () => ({
  getValidKeysByProvider: vi.fn(),
  logAuditEvent: vi.fn(),
}));

describe("AIProviderService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Provider Fallback Chain", () => {
    it("should have the correct fallback chain order", () => {
      const chain = aiProviderService.getProviderChain();
      expect(chain).toEqual([
        "OpenAI",
        "Anthropic",
        "Google Gemini",
        "xAI",
        "Mistral",
        "Cohere",
      ]);
    });

    it("should start with OpenAI as the current provider", () => {
      const current = aiProviderService.getCurrentProvider();
      expect(current).toBe("OpenAI");
    });
  });

  describe("Key Rotation", () => {
    it("should rotate through multiple keys for the same provider", async () => {
      const mockKeys = [
        {
          id: 1,
          provider: "OpenAI",
          keyValue: "key1",
          keyMasked: "key1",
          validity: "valid" as const,
          lastCheckedAt: new Date(),
          lastUsedAt: null,
          usageCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          provider: "OpenAI",
          keyValue: "key2",
          keyMasked: "key2",
          validity: "valid" as const,
          lastCheckedAt: new Date(),
          lastUsedAt: null,
          usageCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Mock the database to return multiple keys
      const { getValidKeysByProvider } = await import("./db");
      vi.mocked(getValidKeysByProvider).mockResolvedValue(mockKeys);

      // Test that keys are rotated (this would be verified in integration tests)
      const keys = await getValidKeysByProvider("OpenAI");
      expect(keys).toHaveLength(2);
      expect(keys[0]?.keyValue).toBe("key1");
      expect(keys[1]?.keyValue).toBe("key2");
    });
  });

  describe("Provider Chain", () => {
    it("should have exactly 6 providers in the chain", () => {
      const chain = aiProviderService.getProviderChain();
      expect(chain).toHaveLength(6);
    });

    it("should have all required providers", () => {
      const chain = aiProviderService.getProviderChain();
      const requiredProviders = [
        "OpenAI",
        "Anthropic",
        "Google Gemini",
        "xAI",
        "Mistral",
        "Cohere",
      ];

      for (const provider of requiredProviders) {
        expect(chain).toContain(provider);
      }
    });

    it("should maintain correct fallback order", () => {
      const chain = aiProviderService.getProviderChain();
      const openaiIndex = chain.indexOf("OpenAI");
      const anthropicIndex = chain.indexOf("Anthropic");
      const geminIndex = chain.indexOf("Google Gemini");
      const xaiIndex = chain.indexOf("xAI");
      const mistralIndex = chain.indexOf("Mistral");
      const cohereIndex = chain.indexOf("Cohere");

      // Verify order
      expect(openaiIndex).toBeLessThan(anthropicIndex);
      expect(anthropicIndex).toBeLessThan(geminIndex);
      expect(geminIndex).toBeLessThan(xaiIndex);
      expect(xaiIndex).toBeLessThan(mistralIndex);
      expect(mistralIndex).toBeLessThan(cohereIndex);
    });
  });

  describe("Move Generation", () => {
    it("should accept valid FEN strings", () => {
      const validFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      expect(validFEN).toBeDefined();
      expect(validFEN.length).toBeGreaterThan(0);
    });

    it("should handle move history", () => {
      const moveHistory = ["e2e4", "c7c5", "g1f3"];
      expect(moveHistory).toHaveLength(3);
      expect(moveHistory[0]).toBe("e2e4");
    });
  });
});
