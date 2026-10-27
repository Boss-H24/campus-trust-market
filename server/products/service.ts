import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool, PoolConnection } from 'mysql2/promise';
import type { Actor } from '../contracts.ts';
import type { Config } from '../config.ts';
import { ensure, id, text } from '../common/errors.ts';
import { rows, run, transaction, audit } from '../db/database.ts';
import { UserService } from '../users/service.ts';
import { normalizeTitle, nextProductState, validateProduct, validateImage, type ProductInput } from './rules.ts';
import { ProductRepository } from './repository.ts';
export class ProductService {
    pool: Pool;
    config: Config;
    repository: ProductRepository;
    users: UserService;
    constructor(pool: Pool, config: Config, users: UserService) { this.pool = pool; this.config = config; this.users = users; this.repository = new ProductRepository(pool); }
    async upload(actor: Actor, body: Record<string, unknown>) {
        const image = validateImage(body.base64, body.contentType), storageKey = randomUUID() + '.' + image.extension;
        await mkdir(this.config.uploadDir, { recursive: true });
        const path = join(this.config.uploadDir, storageKey);
        await writeFile(path, image.bytes, { flag: 'wx' });
        try {
            const result = await run(this.pool, 'INSERT INTO upload_asset (owner_id,storage_key,content_type,byte_size) VALUES (?,?,?,?)', [actor.id, storageKey, image.contentType, image.bytes.length]);
            return { id: String(result.insertId), contentType: image.contentType, byteSize: image.bytes.length };
        }
        catch (error) {
            await unlink(path).catch(() => { });
            throw error;
        }
    }
    async media(assetId: string, actor?: Actor) {
        id(assetId);
        const [asset] = await rows(this.pool, `SELECT a.*,
      EXISTS(SELECT 1 FROM product_image pi JOIN product p ON p.id=pi.product_id JOIN app_user u ON u.id=p.seller_id WHERE pi.asset_id=a.id AND p.status='ON_SALE' AND u.status='ACTIVE') AS published,
      EXISTS(SELECT 1 FROM app_user u WHERE u.avatar_asset_id=a.id AND u.status='ACTIVE') AS avatar
      FROM upload_asset a WHERE a.id=?`, [assetId]);
        ensure(asset && (Number(asset.published) === 1 || Number(asset.avatar) === 1 || actor?.id === String(asset.owner_id) || actor?.role === 'ADMIN'), 404, 'NOT_FOUND', '图片不存在或无权访问');
        return { path: join(this.config.uploadDir, asset.storage_key), contentType: asset.content_type };
    }
    async checkSeller(db: PoolConnection, actor: Actor) {
        const [user] = await rows(db, 'SELECT status,certification_status,credit_score FROM app_user WHERE id=? FOR UPDATE', [actor.id]);
        ensure(user?.status === 'ACTIVE', 403, 'ACCOUNT_DISABLED', '账号已禁用');
        ensure(user.certification_status === 'VERIFIED', 403, 'CERTIFICATION_REQUIRED', '请先完成学生实名认证');
        ensure(user.credit_score >= 60, 403, 'LOW_CREDIT', '信誉分低于60，暂不能发布商品');
    }
    async checkInput(db: PoolConnection, actor: Actor, input: ProductInput, excludedId: string | null = null) {
        const [category] = await rows(db, 'SELECT id FROM category WHERE id=? AND active=1', [input.categoryId]);
        ensure(category, 400, 'INVALID_CATEGORY', '商品分类不存在或已停用');
        ensure(await this.repository.assertImages(db, actor.id, input.imageIds), 403, 'ASSET_FORBIDDEN', '只能使用自己上传的商品图片');
        const [duplicate] = await rows(db, 'SELECT id FROM product WHERE seller_id=? AND normalized_title=? AND price_cents=? AND created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 24 HOUR) AND (? IS NULL OR id<>?) LIMIT 1', [actor.id, normalizeTitle(input.title), input.priceCents, excludedId, excludedId]);
        ensure(!duplicate, 409, 'DUPLICATE_PRODUCT', '24小时内已发布相同标题及价格的商品，请编辑原商品');
    }
    async create(actor: Actor, body: Record<string, unknown>) {
        const input = validateProduct(body);
        const productId = await transaction(this.pool, async (db) => {
            // 同一卖家行锁使频率限制、去重、插入在多进程下仍保持原子性。
            await this.checkSeller(db, actor);
            await this.checkInput(db, actor, input);
            const [recent] = await rows(db, 'SELECT COUNT(*) AS n FROM product WHERE seller_id=? AND created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE)', [actor.id]);
            ensure(recent.n < 5, 429, 'RATE_LIMITED', '每分钟最多发布5件商品，请稍后重试');
            const result = await run(db, 'INSERT INTO product (seller_id,category_id,title,normalized_title,description,price_cents,condition_label) VALUES (?,?,?,?,?,?,?)', [actor.id, input.categoryId, input.title, normalizeTitle(input.title), input.description, input.priceCents, input.condition]);
            const pid = String(result.insertId);
            await this.repository.replaceImages(db, pid, input.imageIds);
            await audit(db, actor.id, 'PRODUCT_CREATED', pid);
            return pid;
        });
        return this.detail(productId, actor);
    }
    async edit(actor: Actor, productId: string, body: Record<string, unknown>) {
        id(productId);
        const input = validateProduct(body);
        await transaction(this.pool, async (db) => {
            await this.checkSeller(db, actor);
            const [product] = await rows(db, 'SELECT seller_id,status FROM product WHERE id=? FOR UPDATE', [productId]);
            ensure(product, 404, 'NOT_FOUND', '商品不存在');
            ensure(String(product.seller_id) === actor.id, 403, 'FORBIDDEN', '只能修改自己的商品');
            const status = nextProductState(product.status, 'EDIT');
            await this.checkInput(db, actor, input, productId);
            await run(db, "UPDATE product SET category_id=?,title=?,normalized_title=?,description=?,price_cents=?,condition_label=?,status=?,rejection_reason='',version=version+1 WHERE id=?", [input.categoryId, input.title, normalizeTitle(input.title), input.description, input.priceCents, input.condition, status, productId]);
            await this.repository.replaceImages(db, productId, input.imageIds);
            await audit(db, actor.id, 'PRODUCT_EDITED', productId);
        });
        return this.detail(productId, actor);
    }
    async changeStatus(actor: Actor, productId: string, body: Record<string, unknown>, admin = false) {
        id(productId);
        ensure(admin ? actor.role === 'ADMIN' : actor.role === 'STUDENT', 403, 'FORBIDDEN', '没有操作权限');
        const allowed = admin ? ['APPROVE', 'REJECT'] : ['SUBMIT', 'TAKE_DOWN'];
        ensure(allowed.includes(String(body.action)), 400, 'INVALID_INPUT', '请提交允许的业务动作');
        if (admin)
            ensure(Number.isSafeInteger(body.expectedVersion) && Number(body.expectedVersion) >= 0, 400, 'INVALID_INPUT', '请携带审核版本并刷新列表');
        const action = String(body.action), reason = action === 'REJECT' ? text(body.reason, '驳回理由', 1, 200) : '';
        await transaction(this.pool, async (db) => {
            if (!admin && action === 'SUBMIT')
                await this.checkSeller(db, actor);
            const [product] = await rows(db, 'SELECT seller_id,status,version FROM product WHERE id=? FOR UPDATE', [productId]);
            ensure(product, 404, 'NOT_FOUND', '商品不存在');
            ensure(admin || String(product.seller_id) === actor.id, 403, 'FORBIDDEN', '只能操作自己的商品');
            if (admin)
                ensure(Number(product.version) === body.expectedVersion, 409, 'STALE_REVIEW', '商品内容已更新，请刷新后重新审核');
            const status = nextProductState(product.status, action);
            await run(db, 'UPDATE product SET status=?,rejection_reason=?,version=version+1 WHERE id=?', [status, reason, productId]);
            await audit(db, actor.id, 'PRODUCT_' + action, productId);
        });
        return this.detail(productId, actor);
    }
    async detail(productId: string, actor?: Actor) {
        id(productId);
        const product = await this.repository.find(productId);
        ensure(product && ((product.status === 'ON_SALE' && product.seller_status === 'ACTIVE') || actor?.id === String(product.seller_id) || actor?.role === 'ADMIN'), 404, 'NOT_FOUND', '商品不存在或尚未上架');
        return { ...this.repository.present(product, await this.repository.images(this.pool, productId)), seller: this.users.present(await this.users.repository.profile(String(product.seller_id)), false) };
    }
    async list(query: Record<string, unknown>, actor?: Actor) {
        const scope = query.scope || 'public';
        ensure(['public', 'mine', 'admin'].includes(String(scope)), 400, 'INVALID_INPUT', '查询范围无效');
        if (scope !== 'public')
            ensure(actor, 401, 'UNAUTHORIZED', '请先登录');
        if (scope === 'admin')
            ensure(actor?.role === 'ADMIN', 403, 'FORBIDDEN', '需要管理员权限');
        function integer(value: unknown, fallback: number, max: number, min = 0) { if (value === undefined)
            return fallback; ensure(typeof value === 'string' && /^\d+$/.test(value), 400, 'INVALID_INPUT', '分页或价格格式错误'); const n = Number(value); ensure(Number.isSafeInteger(n) && n >= min && n <= max, 400, 'INVALID_INPUT', '分页或价格超出范围'); return n; }
        const page = integer(query.page, 1, 10000, 1), pageSize = integer(query.pageSize, 20, 100, 1), params: any[] = [], clauses: string[] = [];
        if (scope === 'public')
            clauses.push("p.status='ON_SALE'", "u.status='ACTIVE'");
        else if (scope === 'mine') {
            clauses.push('p.seller_id=?');
            params.push(actor!.id);
        }
        if (query.status !== undefined) {
            const statuses = ['PENDING', 'ON_SALE', 'REJECTED', 'OFF_SHELF', 'LOCKED', 'SOLD', 'FROZEN'];
            ensure(statuses.includes(String(query.status)), 400, 'INVALID_INPUT', '商品状态无效');
            ensure(scope !== 'public' || query.status === 'ON_SALE', 400, 'INVALID_INPUT', '公开查询仅支持上架商品');
            clauses.push('p.status=?');
            params.push(query.status);
        }
        if (query.categoryId !== undefined) {
            clauses.push('p.category_id=?');
            params.push(id(query.categoryId));
        }
        if (query.keyword !== undefined) {
            const keyword = text(query.keyword, '关键词', 0, 50);
            clauses.push("p.title LIKE ? ESCAPE '='");
            params.push('%' + keyword.replace(/[=%_]/g, char => '=' + char) + '%');
        }
        const min = integer(query.minPriceCents, 0, 100000000), max = integer(query.maxPriceCents, 100000000, 100000000);
        ensure(min <= max, 400, 'INVALID_INPUT', '最低价不能高于最高价');
        clauses.push('p.price_cents BETWEEN ? AND ?');
        params.push(min, max);
        const where = clauses.join(' AND '), from = ' FROM product p JOIN app_user u ON u.id=p.seller_id WHERE ' + where;
        const [count] = await rows(this.pool, 'SELECT COUNT(*) AS total' + from, params);
        // LIMIT/OFFSET 来自上面严格校验过的整数，其余输入全部使用参数化查询。
        const products = await rows(this.pool, 'SELECT p.*' + from + ` ORDER BY p.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params);
        const images = products.length ? await rows(this.pool, `SELECT product_id,asset_id FROM product_image WHERE product_id IN (${products.map(() => '?').join(',')}) ORDER BY sort_order`, products.map(p => p.id)) : [];
        return { items: products.map(p => this.repository.present(p, images.filter(image => image.product_id === p.id).map(image => String(image.asset_id)))), total: Number(count.total), page, pageSize };
    }
}
