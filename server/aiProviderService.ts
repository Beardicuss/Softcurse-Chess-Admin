/**
 * AI Provider Service
 * Manages provider fallback chain, key rotation, and move generation
 */

import { getValidKeysByProvider, getKeysByProvider, logAuditEvent, updateProviderStats } from "./db";

// Provider fallback chain order
const PROVIDER_CHAIN = ["Google Gemini", "Grok", "OpenRouter", "Anthropic", "OpenAI", "xAI", "Mistral", "Cohere"];

interface MoveRequest {
  fen: string;
  moveHistory?: string[];
  difficulty?: string;
}

interface MoveResponse {
  move: string;
  provider: string;
  confidence?: number;
}

class AIProviderService {
  private currentProviderIndex = 0;
  private keyRotationIndex: Record<string, number> = {};

  async getMoveFromAI(request: MoveRequest): Promise<MoveResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < PROVIDER_CHAIN.length; attempt++) {
      const provider = PROVIDER_CHAIN[this.currentProviderIndex];

      try {
        const move = await this.callProvider(provider, request);

        // Log successful usage
        await logAuditEvent("key_used", provider, undefined, {
          fen: request.fen,
          move,
        });

        return {
          move,
          provider,
          confidence: 0.95,
        };
      } catch (error) {
        lastError = error as Error;

        // Log fallback event
        await logAuditEvent("fallback_triggered", provider, undefined, {
          reason: (error as Error).message,
          nextProvider: PROVIDER_CHAIN[(this.currentProviderIndex + 1) % PROVIDER_CHAIN.length],
        });

        // Switch to next provider
        this.currentProviderIndex = (this.currentProviderIndex + 1) % PROVIDER_CHAIN.length;
      }
    }

    throw new Error(`All AI providers failed. Last error: ${lastError?.message}`);
  }

  private async callProvider(provider: string, request: MoveRequest): Promise<string> {
    // Get valid keys for this provider
    const validKeys = await getValidKeysByProvider(provider);

    if (validKeys.length === 0) {
      throw new Error(`No valid keys available for ${provider}`);
    }

    // Rotate through keys for load distribution
    if (!this.keyRotationIndex[provider]) {
      this.keyRotationIndex[provider] = 0;
    }
    const keyIndex = this.keyRotationIndex[provider] % validKeys.length;
    const selectedKey = validKeys[keyIndex];
    this.keyRotationIndex[provider]++;

    // Call the appropriate provider API
    const move = await this.invokeProviderAPI(provider, selectedKey.keyValue, request);
    return move;
  }

  private async invokeProviderAPI(
    provider: string,
    apiKey: string,
    request: MoveRequest
  ): Promise<string> {
    const userPrompt = `FEN: ${request.fen}\nMove history: ${request.moveHistory?.join(" ") || "none"}\nWhat is the best move?`;

    // Difficulty-aware system prompts
    const PROMPTS: Record<string, string> = {
      RECRUIT: `You are a beginner-level chess AI. Given a FEN position, respond with ONLY a move in UCI coordinate notation (e.g., "e2e4", "g1f3"). You should play like a casual player — occasionally make suboptimal moves, miss tactics, and prefer simple piece development. No explanation, just the move.`,
      SOLDIER: `You are an intermediate chess AI. Given a FEN position, respond with ONLY a move in UCI coordinate notation (e.g., "e2e4", "g1f3"). Play a solid, balanced game — use basic tactics, protect your pieces, and develop normally. Don't play perfectly but don't blunder either. No explanation, just the move.`,
      COMMANDER: `You are a strong chess AI. Given a FEN position, respond with ONLY a move in UCI coordinate notation (e.g., "e2e4", "g1f3"). Play aggressively and tactically — look for pins, forks, skewers, and sacrifices. Play at a high club level. No explanation, just the move.`,
      GRANDMASTER: `You are an elite grandmaster-level chess AI. Given a FEN position, respond with ONLY the absolute best move in UCI coordinate notation (e.g., "e2e4", "g1f3"). Evaluate deeply — consider positional advantages, pawn structure, king safety, and long-term plans. Play the strongest possible move. No explanation, just the move.`,
    };
    const systemPrompt = PROMPTS[request.difficulty || "GRANDMASTER"] || PROMPTS.GRANDMASTER;

    switch (provider) {
      case "OpenAI":
        return this.callOpenAI(apiKey, systemPrompt, userPrompt);
      case "Anthropic":
        return this.callAnthropic(apiKey, systemPrompt, userPrompt);
      case "Google Gemini":
        return this.callGoogleGemini(apiKey, systemPrompt, userPrompt);
      case "xAI":
        return this.callXAI(apiKey, systemPrompt, userPrompt);
      case "Grok":
        return this.callGrok(apiKey, systemPrompt, userPrompt);
      case "OpenRouter":
        return this.callOpenRouter(apiKey, systemPrompt, userPrompt);
      case "Mistral":
        return this.callMistral(apiKey, systemPrompt, userPrompt);
      case "Cohere":
        return this.callCohere(apiKey, systemPrompt, userPrompt);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private async callOpenAI(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const move = data.choices[0]?.message.content.trim() || "";
    if (!move) throw new Error("Empty response from OpenAI");
    return move;
  }

  private async callAnthropic(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 10,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { content: Array<{ text: string }> };
    const move = data.content[0]?.text.trim() || "";
    if (!move) throw new Error("Empty response from Anthropic");
    return move;
  }

  private async callGoogleGemini(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 10,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Google Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    const move = data.candidates[0]?.content.parts[0]?.text.trim() || "";
    if (!move) throw new Error("Empty response from Google Gemini");
    return move;
  }

  private async callXAI(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-beta",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      throw new Error(`xAI API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const move = data.choices[0]?.message.content.trim() || "";
    if (!move) throw new Error("Empty response from xAI");
    return move;
  }

  private async callMistral(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      throw new Error(`Mistral API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const move = data.choices[0]?.message.content.trim() || "";
    if (!move) throw new Error("Empty response from Mistral");
    return move;
  }

  private async callCohere(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch("https://api.cohere.com/v1/generate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "command-light",
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        max_tokens: 10,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { generations: Array<{ text: string }> };
    const move = data.generations[0]?.text.trim() || "";
    if (!move) throw new Error("Empty response from Cohere");
    return move;
  }

  private async callGrok(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      throw new Error(`Grok API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const move = data.choices[0]?.message.content.trim() || "";
    if (!move) throw new Error("Empty response from Grok");
    return move;
  }

  private async callOpenRouter(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const move = data.choices[0]?.message.content.trim() || "";
    if (!move) throw new Error("Empty response from OpenRouter");
    return move;
  }

  getCurrentProvider(): string {
    return PROVIDER_CHAIN[this.currentProviderIndex];
  }

  getProviderChain(): string[] {
    return PROVIDER_CHAIN;
  }
}

export const aiProviderService = new AIProviderService();
