import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { trpcServer } from '@hono/trpc-server';
import { appRouter } from '../../server/routers';
import { createContext } from '../../server/_core/context';
import { aiProviderService } from '../../server/aiProviderService';
import { logAuditEvent, upsertUser } from '../../server/db';
import { sdk } from '../../server/_core/sdk';
import { getSessionCookieOptions } from '../../server/_core/cookies';
import { COOKIE_NAME, ONE_YEAR_MS } from '@shared/const';
import { cors } from 'hono/cors';
import { setCookie } from 'hono/cookie';

const app = new Hono().basePath('/api');

app.use('*', async (c, next) => {
    if (c.env) {
        (globalThis as any).__PAGES_ENV__ = c.env;
    }
    // Also try to inject to process for dev parity if it exists playfully
    if (c.env && typeof process !== 'undefined') {
        Object.assign(process.env, c.env);
    }
    await next();
});

app.use('*', cors());

// OAuth has been stripped out. Auth is purely handled by TRPC password validation now.

// Raw Endpoint for Chess AI
app.post('/chess-ai', async (c) => {
    try {
        const body = await c.req.json();
        const { fen, moveHistory, difficulty } = body;

        if (!fen || typeof fen !== 'string') {
            return c.json({
                move: '',
                provider: '',
                error: 'Missing or invalid FEN string',
            }, 400);
        }

        const response = await aiProviderService.getMoveFromAI({
            fen,
            moveHistory,
            difficulty,
        });

        return c.json(response);
    } catch (error) {
        console.error('[Chess AI Endpoint] Error:', error);

        await logAuditEvent('fallback_triggered', undefined, undefined, {
            error: (error as Error).message,
        });

        return c.json({
            move: '',
            provider: '',
            error: `All AI providers failed: ${(error as Error).message}`,
        }, 503);
    }
});

// Status endpoint
app.get('/chess-ai/status', async (c) => {
    try {
        const response = await aiProviderService.getMoveFromAI({
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // Starting position
            moveHistory: [],
        });

        return c.json({
            currentProvider: aiProviderService.getCurrentProvider(),
            providerChain: aiProviderService.getProviderChain(),
            lastTestMove: response.move,
            status: 'operational',
        });
    } catch (error) {
        return c.json({
            currentProvider: aiProviderService.getCurrentProvider(),
            providerChain: aiProviderService.getProviderChain(),
            status: 'degraded',
            error: (error as Error).message,
        }, 503);
    }
});

// tRPC integration
app.use('/trpc/*', trpcServer({
    router: appRouter,
    createContext: createContext,
}));

export const onRequest = handle(app);
