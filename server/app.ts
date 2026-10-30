import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'mysql2/promise';
import type { Config } from './config.ts';
import type { Actor } from './contracts.ts';
import { AppError, ensure } from './common/errors.ts';
import { rows } from './db/database.ts';
import { UserService, hashToken } from './users/service.ts';
import { ProductService } from './products/service.ts';
import { OrderService } from './orders/service.ts';
declare global {
    namespace Express {
        interface Request {
            actor?: Actor;
            requestId: string;
        }
    }
}
export function createApp(config: Config, pool: Pool) {
    const app = express(), users = new UserService(pool, config), products = new ProductService(pool, config, users), orders = new OrderService(pool);
    app.disable('x-powered-by');
    const ok = (req: Request, res: Response, data: unknown, status = 200) => res.status(status).json({ code: 0, message: '成功', data, requestId: req.requestId });
    app.use((req, res, next) => { req.requestId = randomUUID(); res.set({ 'X-Request-Id': req.requestId, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" }); next(); });
    app.use(express.json({ limit: '8mb', strict: true }));
    app.use((req, res, next) => { if (req.body !== undefined)
        ensure(req.body !== null && typeof req.body === 'object' && !Array.isArray(req.body), 400, 'INVALID_INPUT', '请求正文必须为JSON对象'); next(); });
    const bearer = (req: Request) => { const header = req.header('authorization'); if (!header)
        return ''; ensure(/^Bearer [A-Za-z0-9_-]{20,100}$/.test(header), 401, 'UNAUTHORIZED', '登录状态无效'); return header.slice(7); };
    app.use(async (req, res, next) => { if (['/api/health', '/api/auth/login', '/api/auth/dev-login'].includes(req.path)) {
        next();
        return;
    } const token = bearer(req); if (token) {
        const actor = await users.repository.findBySession(hashToken(token));
        ensure(actor, 401, 'UNAUTHORIZED', '登录已失效，请重新登录');
        ensure(actor.status === 'ACTIVE', 403, 'ACCOUNT_DISABLED', '账号已禁用');
        req.actor = actor;
    } next(); });
    const auth = (req: Request, res: Response, next: NextFunction) => { ensure(req.actor, 401, 'UNAUTHORIZED', '请先登录'); next(); };
    const admin = (req: Request, res: Response, next: NextFunction) => { ensure(req.actor?.role === 'ADMIN', 403, 'FORBIDDEN', '需要管理员权限'); next(); };
    // ponytail: 单进程入口限流，发布限流在数据库事务中；多实例部署时入口限流迁移到网关。
    const limits = new Map<string, {
        count: number;
        until: number;
    }>();
    const rate = (name: string, maximum: number) => (req: Request, res: Response, next: NextFunction) => { const now = Date.now(), key = name + ':' + (req.actor?.id || req.ip); let entry = limits.get(key); if (!entry || entry.until < now) {
        entry = { count: 0, until: now + 60000 };
        limits.set(key, entry);
    } if (limits.size > 10000) {
        for (const [k, v] of limits)
            if (v.until < now)
                limits.delete(k);
        ensure(limits.size <= 10000, 429, 'RATE_LIMITED', '请求繁忙，请稍后重试');
    } ensure(++entry.count <= maximum, 429, 'RATE_LIMITED', '请求过于频繁，请稍后重试'); next(); };
    app.get('/api/health', async (req, res) => { await rows(pool, 'SELECT 1'); ok(req, res, { status: 'ok', database: 'mysql', demoLoginEnabled: config.demoEnabled, wechatLoginEnabled: !!(config.wechatAppId && config.wechatAppSecret), schoolName: config.schoolName }); });
    app.post('/api/auth/dev-login', rate('login', 30), async (req, res) => ok(req, res, await users.devLogin(req.body || {})));
    app.post('/api/auth/login', rate('login', 30), async (req, res) => ok(req, res, await users.wechatLogin(req.body || {})));
    app.post('/api/auth/logout', auth, async (req, res) => { await users.logout(bearer(req)); ok(req, res, null); });
    app.get('/api/users/me', auth, async (req, res) => ok(req, res, await users.me(req.actor!.id)));
    app.patch('/api/users/me', auth, async (req, res) => ok(req, res, await users.update(req.actor!, req.body || {})));
    app.post('/api/certifications', auth, rate('certification', 10), async (req, res) => ok(req, res, await users.submitCertification(req.actor!, req.body || {}), 201));
    app.get('/api/certifications/status', auth, async (req, res) => { const user = await users.me(req.actor!.id); ok(req, res, { id: user.certificationId, version: user.certificationVersion, status: user.certificationStatus, rejectionReason: user.rejectionReason, school: user.school, maskedName: user.maskedName, maskedStudentId: user.maskedStudentId, maskedPhone: user.maskedPhone }); });
    app.get('/api/admin/certifications', auth, admin, async (req, res) => ok(req, res, await users.certifications(req.actor!)));
    app.post('/api/admin/certifications/:id/audit', auth, admin, async (req, res) => ok(req, res, await users.auditCertification(req.actor!, String(req.params.id), req.body || {})));
    app.get('/api/categories', async (req, res) => ok(req, res, { items: await rows(pool, 'SELECT id,name FROM category WHERE active=1 ORDER BY id') }));
    app.post('/api/uploads', auth, rate('upload', 60), async (req, res) => ok(req, res, await products.upload(req.actor!, req.body || {}), 201));
    // 路径由已鉴权的数据库资产记录决定；允许默认 .runtime 上传目录。
    app.get('/api/media/:id', async (req, res, next) => { const asset = await products.media(String(req.params.id), req.actor); res.type(asset.contentType).sendFile(asset.path, { dotfiles: 'allow' }, error => { if (error)
        next(error); }); });
    app.get('/api/products', async (req, res) => ok(req, res, await products.list(req.query, req.actor)));
    app.get('/api/admin/products', auth, admin, async (req, res) => ok(req, res, await products.list({ ...req.query, scope: 'admin' }, req.actor)));
    app.post('/api/products', auth, async (req, res) => ok(req, res, await products.create(req.actor!, req.body || {}), 201));
    app.get('/api/products/:id', async (req, res) => ok(req, res, await products.detail(String(req.params.id), req.actor)));
    app.put('/api/products/:id', auth, async (req, res) => ok(req, res, await products.edit(req.actor!, String(req.params.id), req.body || {})));
    app.put('/api/products/:id/status', auth, async (req, res) => ok(req, res, await products.changeStatus(req.actor!, String(req.params.id), req.body || {})));
    app.post('/api/products/:id/audit', auth, admin, async (req, res) => ok(req, res, await products.changeStatus(req.actor!, String(req.params.id), req.body || {}, true)));
    app.post('/api/orders', auth, async (req, res) => ok(req, res, await orders.create(req.actor!, req.body || {}), 201));
    app.get('/api/orders', auth, async (req, res) => ok(req, res, await orders.list(req.actor!, req.query)));
    app.get('/api/orders/:orderNo', auth, async (req, res) => ok(req, res, await orders.detail(req.actor!, String(req.params.orderNo))));
    app.post('/api/orders/:orderNo/pay', auth, async (req, res) => ok(req, res, await orders.act(req.actor!, String(req.params.orderNo), req.body || {}, 'PAY')));
    app.put('/api/orders/:orderNo/status', auth, async (req, res) => ok(req, res, await orders.act(req.actor!, String(req.params.orderNo), req.body || {})));
    app.post('/api/orders/:orderNo/confirm', auth, async (req, res) => ok(req, res, await orders.act(req.actor!, String(req.params.orderNo), req.body || {}, 'CONFIRM')));
    app.post('/api/orders/:orderNo/evaluations', auth, async (req, res) => ok(req, res, await orders.evaluate(req.actor!, String(req.params.orderNo), req.body || {}), 201));
    app.get('/api/users/:id/evaluations', async (req, res) => ok(req, res, await orders.userEvaluations(String(req.params.id), req.query)));
    app.use((req, res) => { throw new AppError(404, 'NOT_FOUND', '接口不存在'); });
    app.use((error: any, req: Request, res: Response, next: NextFunction) => {
        if (res.headersSent) {
            next(error);
            return;
        }
        const mapped = error instanceof AppError ? error : error?.code === 'ER_DUP_ENTRY' ? new AppError(409, 'CONFLICT', '数据已存在，请刷新后重试') : error?.type === 'entity.too.large' ? new AppError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大') : error instanceof SyntaxError ? new AppError(400, 'INVALID_JSON', 'JSON格式错误') : error?.code === 'ENOENT' ? new AppError(404, 'NOT_FOUND', '图片文件不存在') : new AppError(500, 'INTERNAL_ERROR', '服务暂不可用，请稍后重试');
        if (mapped.status >= 500)
            console.error(JSON.stringify({ requestId: req.requestId, code: mapped.code }));
        res.status(mapped.status).json({ code: mapped.code, message: mapped.message, data: null, requestId: req.requestId });
    });
    return app;
}
