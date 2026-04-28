# Chess Game — Neural AI Integration Guide

How to connect **Softcurse's Chess** to the live AI proxy so the game can generate real moves using cloud AI providers.

## Architecture

```
┌─────────────────────┐       ┌──────────────────────────────────┐       ┌─────────────┐
│  Softcurse's Chess   │──────▶│  chess-admin.pages.dev/api/trpc  │──────▶│   TiDB Cloud │
│  (Three.js Frontend) │  HTTP │  (Cloudflare Edge Functions)     │  SQL  │   (Key Pool) │
└─────────────────────┘       └──────────────────────────────────┘       └─────────────┘
                                         │
                                         │ Fallback Chain
                                         ▼
                              ┌──────────────────────┐
                              │  1. Google Gemini     │
                              │  2. Grok (Groq Cloud) │
                              │  3. OpenRouter        │
                              │  4. Anthropic         │
                              │  5. OpenAI            │
                              │  6. xAI               │
                              │  7. Mistral           │
                              │  8. Cohere            │
                              └──────────────────────┘
```

**How it works:** The chess game sends the board position (FEN) to the proxy. The proxy picks the first provider with a valid key, asks it for the best move, and returns it. If a provider fails, it instantly falls back to the next one in the chain.

---

## Integration Steps

### 1. Add Neural AI Difficulty

In your chess game UI, add "Neural AI" as a difficulty option alongside the existing minimax levels:

```jsx
const DIFFICULTY_LEVELS = [
  { id: "easy",      label: "Easy (Minimax Depth 2)" },
  { id: "medium",    label: "Medium (Minimax Depth 4)" },
  { id: "hard",      label: "Hard (Minimax Depth 6)" },
  { id: "neural_ai", label: "Neural AI (Cloud Providers)" },
  { id: "ai_vs_ai",  label: "AI vs AI (Spectator Mode)" },
];
```

### 2. AI vs AI — Spectator Mode

When the player selects "AI vs AI", both sides are played by Neural AI automatically. The player watches the game unfold in real-time.

```javascript
async function runAIvsAILoop(game, board, delay = 2000) {
  while (!game.isGameOver()) {
    const fen = game.fen();
    const history = game.history();

    try {
      const move = await getNeuralAIMove(fen, history);
      game.move(move);
      board.position(game.fen()); // update the 3D board
    } catch (error) {
      console.error("AI vs AI: provider chain exhausted, stopping game");
      break;
    }

    // Pause between moves so the spectator can follow
    await new Promise(r => setTimeout(r, delay));
  }

  if (game.isCheckmate()) console.log("Checkmate!");
  if (game.isDraw()) console.log("Draw!");
}

// Start when player picks AI vs AI
if (difficulty === "ai_vs_ai") {
  runAIvsAILoop(game, board, 2000);
}
```

Key behaviors:
- **Turn delay**: 2 second pause between moves (configurable)
- **Auto-stop**: Halts on checkmate, stalemate, draw, or provider failure
- **No player input**: Board interaction is disabled during spectator mode

### 3. Call the Proxy

When the player selects Neural AI, send the current position to the proxy instead of running local minimax:

```javascript
const PROXY_URL = "https://chess-admin.pages.dev";

async function getNeuralAIMove(fen, moveHistory) {
  const response = await fetch(`${PROXY_URL}/api/trpc/chessAI.getMove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      json: { fen, moveHistory }
    }),
  });

  if (!response.ok) {
    throw new Error(`Proxy error: ${response.status}`);
  }

  const data = await response.json();
  const result = data.result.data.json;

  console.log(`Neural AI (${result.provider}): ${result.move}`);
  return result.move; // e.g. "e2e4", "Nf3"
}
```

### 3. Wire It Into Your AI Engine

```javascript
export async function getAIMove(fen, moveHistory, difficulty) {
  if (difficulty === "neural_ai") {
    try {
      return await getNeuralAIMove(fen, moveHistory);
    } catch (error) {
      console.warn("Neural AI failed, falling back to minimax:", error);
      return getMinimaxMove(fen, 4); // graceful fallback
    }
  }
  // existing minimax logic for easy/medium/hard
  return getMinimaxMove(fen, depthForDifficulty(difficulty));
}
```

### 4. Add Loading State

Neural AI moves take 1–5 seconds depending on the provider. Show a thinking indicator:

```jsx
{isAIThinking && difficulty === "neural_ai" && (
  <div className="ai-thinking-overlay">
    <Spinner />
    <p>Neural AI is analyzing the position...</p>
  </div>
)}
```

---

## API Reference

### `POST /api/trpc/chessAI.getMove`

Generate the best move for a board position.

**Request:**
```json
{
  "json": {
    "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    "moveHistory": ["e2e4"]
  }
}
```

**Response:**
```json
{
  "result": {
    "data": {
      "json": {
        "move": "c7c5",
        "provider": "Google Gemini",
        "confidence": 0.95
      }
    }
  }
}
```

### `GET /api/trpc/chessAI.getStatus`

Check which provider is active and the full fallback chain.

**Response:**
```json
{
  "result": {
    "data": {
      "json": {
        "currentProvider": "Google Gemini",
        "providerChain": ["Google Gemini", "Grok", "OpenRouter", "Anthropic", "OpenAI", "xAI", "Mistral", "Cohere"],
        "stats": [...]
      }
    }
  }
}
```

---

## Provider Fallback Chain

| Priority | Provider           | Model                      | Speed   |
|----------|--------------------|-----------------------------|---------|
| 1        | **Google Gemini**  | Gemini 1.5 Flash            | ~1s     |
| 2        | **Grok**           | Llama 3.3 70B (Groq Cloud)  | ~0.5s   |
| 3        | **OpenRouter**     | Gemini 2.0 Flash            | ~1s     |
| 4        | **Anthropic**      | Claude 3.5 Sonnet           | ~2s     |
| 5        | **OpenAI**         | GPT-4o Mini                 | ~2s     |
| 6        | **xAI**            | Grok Beta                   | ~2s     |
| 7        | **Mistral**        | Mistral Small               | ~1.5s   |
| 8        | **Cohere**         | Command Light               | ~1s     |

If all 8 providers fail, the `getMove` endpoint throws an error. Your game should catch this and fall back to local minimax.

---

## Key Management

Keys come from two sources:

1. **Credential Hunter** — Automated GitHub Action that scrapes publicly leaked API keys from GitHub commits every 12 hours and syncs them into TiDB.
2. **Manual injection** — Add your own keys via the admin dashboard at `chess-admin.pages.dev/admin`.

The system automatically rotates through available valid keys per provider to distribute load and handle rate limits.

---

## Admin Dashboard

Access at **`https://chess-admin.pages.dev/admin`** (password-protected):

- **Provider cards** — View valid/total key counts, request stats, last sync time
- **Fallback chain** — Visual display of the active provider order
- **Key management** — Add, edit, validate individual keys
- **Batch validation** — Run diagnostics on all keys for a provider
- **Audit logs** — Track key usage, fallback events, and sync history

---

## CORS Configuration

If your chess game runs on a different domain, you may need to configure CORS. The proxy currently allows all origins (`Access-Control-Allow-Origin: *`). For production, restrict this to your game's domain in `functions/api/[[route]].ts`.

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "All AI providers failed" | No valid keys for any provider | Check admin dashboard, add keys manually, or wait for next Hunter run |
| High latency (5s+) | Provider under load | System auto-falls back to faster providers; add timeout in game |
| Move format wrong | AI returned notation your engine can't parse | Normalize the move string (strip spaces, handle "Nf3" vs "g1f3") |
| CORS error | Game domain not allowed | Update CORS headers in the edge function |
