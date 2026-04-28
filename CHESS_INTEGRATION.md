# Chess Game — Neural AI Integration Guide

How to connect **Softcurse's Chess** to the live AI proxy so the game can generate real moves using cloud AI providers.

## Architecture

```
┌─────────────────────┐       ┌──────────────────────────────────┐       ┌─────────────┐
│  Softcurse's Chess   │──────▶│  chess-admin.pages.dev/api       │──────▶│   TiDB Cloud │
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

## Game Modes

| Mode | Description |
|------|-------------|
| **Player vs AI** | Human plays one side, AI plays the other |
| **Player vs Player** | Two humans play locally |
| **AI vs AI** | Spectator mode — both sides played by Neural AI automatically |

## Difficulty Levels (Player vs AI)

| Difficulty | Engine | Speed |
|------------|--------|-------|
| **Recruit** 🌿 | Local Minimax (depth 2) | Instant |
| **Soldier** ⚔ | Local Minimax (depth 3) | ~1s |
| **Commander** 💀 | Local Minimax (depth 4) | 3–8s |
| **Grandmaster** 🧠 | Cloud AI Proxy (8 providers) | 1–5s |

## Integration Points

### `chessEngine.js`
- `toFEN(gs)` — Converts the internal board state to standard FEN notation
- `fromAlg(move)` — Converts UCI notation ("e2e4") to engine coordinates `[fr, ff, tr, tf]`

### `aiEngine.js`
- `getNeuralMove(gs)` — Sends FEN to `chess-admin.pages.dev/api/chess-ai`, returns `{ move, provider }` or `null` on failure

### `BattleChess3D.jsx`
- `doAITurn()` — Routes to `getNeuralMove` when difficulty is GRANDMASTER, falls back to local minimax on proxy failure
- Spectator loop — When mode is `ai_vs_ai`, runs an async loop requesting moves for both sides with a 2s delay

### `ChessUI.jsx`
- GRANDMASTER difficulty button (🧠 purple glow)
- AI VS AI mode button (📽 gold) — skips side selection, goes straight to spectator mode

## API Endpoint

### `POST /api/chess-ai`

**Request:**
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "moveHistory": ["e2e4"]
}
```

**Response:**
```json
{
  "move": "c7c5",
  "provider": "Google Gemini",
  "confidence": 0.95
}
```

## CORS

CORS is enabled on the proxy (`cors()` middleware in Hono). The game works from any origin — localhost, Cloudflare Pages, or any other host.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "All AI providers failed" | Check admin dashboard, add keys, wait for Hunter |
| Move format wrong | Proxy returns UCI ("e2e4"); `fromAlg` handles conversion |
| Spectator mode freezes | Proxy down — falls back to minimax automatically |
| CORS error | Verify `cors()` middleware is active in `functions/api/[[route]].ts` |

### What We Implemented:

*   **Cloud AI Proxy (Cloudflare Pages)**: A backend that routes chess move requests to top-tier AI providers.
*   **TiDB Database Integration**: A serverless database to store and manage AI provider API keys.
*   **Credential Hunter**: An automated pipeline that scrapes, validates, and syncs 22+ API keys across 8 providers (Gemini, Grok, OpenAI, etc.).
*   **Provider Fallback System**: Automatic failover that cycles through providers (Gemini → Grok → OpenRouter → etc.) if one fails or hits rate limits.
*   **Difficulty-Aware AI**: System prompts scaled by skill level (Recruit, Soldier, Commander, Grandmaster).
*   **FEN Generator**: Added `toFEN` to `chessEngine.js` to translate the 3D board state for the AI.
*   **Coordinate Parser**: Added `fromAlg` to `chessEngine.js` to translate AI moves back into game coordinates.
*   **Unified AI Client**: Updated `aiEngine.js` to fetch moves directly from the cloud proxy.
*   **New Game Modes**:
    *   **Grandmaster Mode**: Play against an elite cloud-powered neural engine.
    *   **AI vs AI (Spectator)**: Watch two real AIs play against each other automatically.
*   **Cross-Origin Support**: Fully configured CORS to allow the game to call the proxy from any location (localhost or hosted).
*   **No Local AI**: Removed all local minimax calculations to ensure the game always uses the most advanced cloud models available.
