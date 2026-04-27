# Chess Game Neural AI Integration Guide

This document explains how to integrate the Neural AI difficulty mode into your chess game frontend.

## Overview

The chess-ai-proxy system provides a `/api/chess-ai` endpoint and tRPC procedures that power a "Neural AI" difficulty mode. This mode uses a fallback chain of real AI providers (OpenAI, Anthropic, Google Gemini, xAI, Mistral, Cohere) to generate chess moves.

## Integration Steps

### 1. Add Neural AI to Difficulty Selection

In your chess game UI (e.g., `ChessUI.jsx` or similar), add "Neural AI" to the difficulty options:
not always avaible all keys so need a smart fallback system.

```jsx
const DIFFICULTY_LEVELS = [
  { id: "easy", label: "Easy (Minimax Depth 2)" },
  { id: "medium", label: "Medium (Minimax Depth 4)" },
  { id: "hard", label: "Hard (Minimax Depth 6)" },
  { id: "Neural AI", label: "Neural AI (Real AI Providers)" }, // NEW
];
```

### 2. Update AI Engine Selection

In your `aiEngine.js` or AI selection logic, add a case for "Neural AI":

```javascript
export async function getAIMove(fen, moveHistory, difficulty) {
  if (difficulty === "Neural AI") {
    return getNeuralAIMove(fen, moveHistory);
  }
  // ... existing minimax logic for other difficulties
}

async function getNeuralAIMove(fen, moveHistory) {
  try {
    const response = await fetch("/api/chess-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen, moveHistory }),
    });

    if (!response.ok) {
      throw new Error(`AI endpoint failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`Neural AI (${data.provider}): ${data.move}`);
    return data.move;
  } catch (error) {
    console.error("Neural AI failed, falling back to minimax:", error);
    // Fallback to minimax if Neural AI fails
    return getMiniaxMove(fen, 4);
  }
}
```

### 3. Update Game State Management

When the player selects "Neural AI" difficulty, ensure the game properly waits for the AI response:

```jsx
const handleDifficultySelect = async (difficulty) => {
  setDifficulty(difficulty);
  setGameStarted(true);
  
  if (difficulty === "Neural AI") {
    // Show a loading indicator
    setIsAIThinking(true);
  }
};

const handleAIMove = async () => {
  try {
    setIsAIThinking(true);
    const move = await getAIMove(currentFEN, moveHistory, difficulty);
    // Apply move to board
    applyMove(move);
  } catch (error) {
    console.error("AI move failed:", error);
    // Handle error gracefully
  } finally {
    setIsAIThinking(false);
  }
};
```

### 4. Add Loading State UI

Show the user which AI provider is being used:

```jsx
{isAIThinking && difficulty === "Neural AI" && (
  <div className="ai-status">
    <Spinner />
    <p>Neural AI is thinking...</p>
    <p className="provider-info">Using {currentProvider}</p>
  </div>
)}
```

## API Endpoints

### POST /api/chess-ai

Generate the best move for a given position.

**Request:**
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "moveHistory": ["e2e4", "c7c5"]
}
```

**Response:**
```json
{
  "move": "g1f3",
  "provider": "OpenAI",
  "confidence": 0.95
}
```

### GET /api/chess-ai/status

Get the current AI provider status and key pool information.

**Response:**
```json
{
  "currentProvider": "OpenAI",
  "providerChain": ["OpenAI", "Anthropic", "Google Gemini", "xAI", "Mistral", "Cohere"],
  "lastTestMove": "e2e4",
  "status": "operational"
}
```

## tRPC Integration (Alternative)

If using React with tRPC, you can call the procedures directly:

```tsx
import { trpc } from "@/lib/trpc";

function ChessGame() {
  const getMovesMutation = trpc.chessAI.getMove.useMutation();
  const statusQuery = trpc.chessAI.getStatus.useQuery();

  const handleNeuralAIMove = async () => {
    const response = await getMovesMutation.mutateAsync({
      fen: currentFEN,
      moveHistory,
    });
    console.log(`Move: ${response.move} from ${response.provider}`);
  };

  return (
    <div>
      {statusQuery.data && (
        <p>Current Provider: {statusQuery.data.currentProvider}</p>
      )}
      <button onClick={handleNeuralAIMove} disabled={getMovesMutation.isPending}>
        {getMovesMutation.isPending ? "AI Thinking..." : "Get Neural AI Move"}
      </button>
    </div>
  );
}
```

## Admin Dashboard

Access the admin dashboard at `/admin/keys` to:

- View the key pool status for each provider
- See valid key counts and last refresh times
- Manually validate keys
- Trigger batch validation for a provider

## Fallback Chain

The Neural AI system automatically falls back through this chain if a provider fails:

1. **OpenAI** - GPT-4o Mini
2. **Anthropic** - Claude 3.5 Sonnet
3. **Google Gemini** - Gemini 1.5 Flash
4. **xAI** - Grok Beta
5. **Mistral** - Mistral Small
6. **Cohere** - Command Light

If all providers fail, the system returns an error and your game should fall back to minimax.

## Key Rotation

The system automatically rotates through available keys for each provider to distribute load and handle rate limits. This is transparent to the frontend.

## Monitoring

Check the audit logs in the database to track:

- Key usage patterns
- Provider fallback events
- Validation results
- Refresh cycles

## Troubleshooting

### "All AI providers failed"

This means either:
1. No valid keys are available for any provider
2. All providers are rate-limited or experiencing issues
3. The credential-hunter script hasn't run yet (runs every 12 hours)

**Solution:** 
- Check the admin dashboard to see key pool status
- Manually trigger key validation from the admin dashboard
- Check the audit logs for error details

### High Latency

Neural AI moves may take 2-5 seconds depending on provider load. Consider:
- Adding a loading indicator
- Setting a timeout (e.g., 10 seconds) and falling back to minimax
- Using the easier difficulty levels for faster responses

### Rate Limiting

If you see "rate_limited" status for keys:
- The system will automatically rotate to other keys
- Wait 1-2 hours for the rate limit to reset
- The credential-hunter script will mark the key as invalid after multiple failures

## Performance Tips

1. **Cache FEN positions** - Don't request moves for the same position twice
2. **Use move history** - Provide the full move history for better context
3. **Set timeouts** - Don't wait indefinitely for AI responses
4. **Fallback gracefully** - Always have a fallback to minimax or random moves
5. **Batch validate keys** - Run key validation during off-peak hours

## Support

For issues or questions:
1. Check the admin dashboard for key pool status
2. Review the audit logs for error details
3. Check the browser console for error messages
4. Verify the `/api/chess-ai` endpoint is responding
