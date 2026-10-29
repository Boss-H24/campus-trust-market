import type { Express, Request, Response, RequestHandler } from 'express';
import type { Pool } from 'mysql2/promise';
import { ConversationService } from '../conversations/service.ts';
import { FavoriteService } from '../favorites/service.ts';
import { ModerationService } from '../moderation/service.ts';
import type { CreditEventApplier } from '../moderation/credit.ts';

export function registerCommunityRoutes(app: Express, pool: Pool, auth: RequestHandler, admin: RequestHandler,
    ok: (req: Request, res: Response, data: unknown, status?: number) => unknown, applyCredit?: CreditEventApplier) {
    const conversations = new ConversationService(pool), favorites = new FavoriteService(pool), moderation = new ModerationService(pool, applyCredit);
    app.post('/api/conversations', auth, async (req, res) => ok(req, res, await conversations.create(req.actor!, req.body || {}), 201));
    app.get('/api/conversations', auth, async (req, res) => ok(req, res, await conversations.list(req.actor!, req.query)));
    app.get('/api/conversations/:id/messages', auth, async (req, res) => ok(req, res, await conversations.messages(req.actor!, String(req.params.id), req.query.afterId)));
    app.post('/api/conversations/:id/messages', auth, async (req, res) => ok(req, res, await conversations.send(req.actor!, String(req.params.id), req.body || {}), 201));
    app.put('/api/favorites/:productId', auth, async (req, res) => ok(req, res, await favorites.set(req.actor!, String(req.params.productId), true)));
    app.delete('/api/favorites/:productId', auth, async (req, res) => ok(req, res, await favorites.set(req.actor!, String(req.params.productId), false)));
    app.get('/api/favorites', auth, async (req, res) => ok(req, res, await favorites.list(req.actor!, req.query)));
    app.post('/api/reports', auth, async (req, res) => ok(req, res, await moderation.createReport(req.actor!, req.body || {}), 201));
    app.get('/api/reports', auth, async (req, res) => ok(req, res, await moderation.reports(req.actor!, req.query)));
    app.get('/api/admin/reports', auth, admin, async (req, res) => ok(req, res, await moderation.reports(req.actor!, req.query, true)));
    app.post('/api/admin/reports/:id/resolve', auth, admin, async (req, res) => ok(req, res, await moderation.resolve(req.actor!, String(req.params.id), req.body || {})));
    app.patch('/api/admin/reports/:id', auth, admin, async (req, res) => ok(req, res, await moderation.progress(req.actor!, String(req.params.id), req.body || {})));
    app.get('/api/admin/reports/:id/evidence', auth, admin, async (req, res) => ok(req, res, await moderation.evidence(req.actor!, String(req.params.id), req.query)));
    app.get('/api/admin/users', auth, admin, async (req, res) => ok(req, res, await moderation.users(req.actor!, req.query)));
    app.patch('/api/admin/users/:id', auth, admin, async (req, res) => ok(req, res, await moderation.user(req.actor!, String(req.params.id), req.body || {})));
    app.post('/api/admin/products/:id/moderation', auth, admin, async (req, res) => ok(req, res, await moderation.unfreeze(req.actor!, String(req.params.id), req.body || {})));
    app.get('/api/admin/categories', auth, admin, async (req, res) => ok(req, res, await moderation.categories(req.actor!)));
    app.post('/api/admin/categories', auth, admin, async (req, res) => ok(req, res, await moderation.category(req.actor!, req.body || {}), 201));
    app.patch('/api/admin/categories', auth, admin, async (req, res) => ok(req, res, await moderation.category(req.actor!, req.body || {}, true)));
    app.get('/api/admin/rules', auth, admin, async (req, res) => ok(req, res, await moderation.rules(req.actor!)));
    app.patch('/api/admin/rules/:key', auth, admin, async (req, res) => ok(req, res, await moderation.updateRule(req.actor!, String(req.params.key), req.body || {})));
    app.get('/api/admin/logs', auth, admin, async (req, res) => ok(req, res, await moderation.logs(req.actor!, req.query)));
}
