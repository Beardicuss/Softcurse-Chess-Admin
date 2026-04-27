# Deployment & Scheduling Guide

## Step 1: Deploy the Project

1. Open the Management UI (click "View" on the project card)
2. Click the **Publish** button in the top-right corner
3. Wait for deployment to complete (typically 2-5 minutes)
4. Note the deployed URL (e.g., `https://chess-ai-proxy.manus.space`)

## Step 2: Set Up 12-Hour Credential Refresh Schedule

After deployment, the credential-hunter script will run every 12 hours to refresh the API key pool.

### Automatic Scheduling

Once the project is deployed, you can create a scheduled task that runs the credential-hunter script every 12 hours.

### Manual Setup (if needed)

If you need to manually set up the schedule, use this configuration:

**Schedule Type**: Cron  
**Cron Expression**: `0 */12 * * *` (every 12 hours)  
**Task Name**: `credential-hunter-refresh`  
**Prompt**: 
```
Run the credential-hunter script to refresh the API key pool:
1. Execute: node scripts/credential-hunter.js
2. The script will:
   - Scan for newly leaked API keys
   - Validate each key with provider APIs
   - Store valid keys in the database
   - Remove invalid keys
   - Update provider statistics
3. Log results to audit_logs table
```

## Step 3: Verify Deployment

### Check Admin Dashboard

1. Navigate to `https://[your-deployed-url]/admin/keys`
2. Log in with your admin account
3. Verify you can see:
   - Provider overview with key counts
   - Active provider indicator
   - Fallback chain visualization
   - Usage statistics

### Test the API

```bash
# Test move generation
curl -X POST https://[your-deployed-url]/api/chess-ai \
  -H "Content-Type: application/json" \
  -d '{
    "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "moveHistory": []
  }'

# Expected response:
# {
#   "move": "e2e4",
#   "provider": "OpenAI",
#   "confidence": 0.95
# }
```

### Check Provider Status

```bash
curl https://[your-deployed-url]/api/chess-ai/status
```

## Step 4: Integrate into Your Chess Game

See `CHESS_INTEGRATION.md` and `EXAMPLE_AIENGINE_INTEGRATION.js` for detailed instructions.

### Quick Integration Steps

1. Copy `EXAMPLE_AIENGINE_INTEGRATION.js` code into your `aiEngine.js`
2. Add "Neural AI" to your difficulty selection UI
3. Update your game loop to call `/api/chess-ai` when Neural AI is selected
4. Test with a few moves to verify it works

## Monitoring After Deployment

### Daily Checks

- Visit admin dashboard to verify key pool health
- Check that active provider is operational
- Monitor failed request count

### Weekly Checks

- Review audit logs for any errors
- Verify credential-hunter ran successfully
- Check that new keys are being discovered

### Monthly Checks

- Analyze usage patterns
- Review provider performance metrics
- Optimize key rotation if needed

## Troubleshooting Deployment

### Admin Dashboard Not Loading

**Problem**: 404 or authentication error when accessing `/admin/keys`

**Solution**:
1. Verify you're logged in with an admin account
2. Check that the project is fully deployed
3. Clear browser cache and try again

### API Endpoint Not Responding

**Problem**: 404 or timeout when calling `/api/chess-ai`

**Solution**:
1. Verify the project is deployed
2. Check that the URL is correct
3. Verify the request format matches the API spec
4. Check server logs for errors

### Credential-Hunter Not Running

**Problem**: Key pool not updating after 12 hours

**Solution**:
1. Verify the project is deployed
2. Check that the scheduled task is active
3. Check server logs for credential-hunter errors
4. Manually trigger key validation from admin dashboard
5. Verify credential-hunter script exists at `scripts/credential-hunter.js`

### No Valid Keys Available

**Problem**: All providers showing 0 valid keys

**Solution**:
1. Manually trigger key validation from admin dashboard
2. Check that credential-hunter script has run
3. Verify the script has write access to the database
4. Check audit logs for validation errors
5. Ensure your credential-hunter script is configured correctly

## Performance Optimization

### Database

- Indexes are created on frequently queried columns
- Audit logs are automatically cleaned up after 30 days
- Provider stats are updated in real-time

### API

- Responses are cached for 5 seconds
- Key rotation happens in the background
- Fallback chain ensures fast failover

### Frontend

- Admin dashboard uses pagination for large key lists
- Charts are rendered client-side
- Real-time updates via WebSocket (if configured)

## Security Checklist

- [ ] Project is deployed to a secure HTTPS URL
- [ ] Admin dashboard requires authentication
- [ ] Database credentials are secure
- [ ] API keys are masked in logs and UI
- [ ] Audit logs are enabled
- [ ] Rate limiting is configured
- [ ] CORS is properly configured

## Rollback Plan

If something goes wrong after deployment:

1. **Immediate Rollback**: Use the "Rollback" button in the Management UI to restore the previous version
2. **Partial Rollback**: Disable specific providers from the admin dashboard
3. **Full Rollback**: Deploy the previous checkpoint

## Next Steps

1. ✅ Deploy the project
2. ✅ Verify admin dashboard works
3. ✅ Test API endpoints
4. ✅ Set up 12-hour credential refresh
5. ✅ Integrate into chess game
6. ✅ Test Neural AI difficulty mode
7. ✅ Monitor for 24 hours
8. ✅ Optimize based on usage patterns

## Support

For issues or questions:
1. Check the admin dashboard for system status
2. Review audit logs for error details
3. Check server logs for technical errors
4. Consult `README_SETUP.md` for detailed documentation
5. Review `CHESS_INTEGRATION.md` for integration issues
