import type { Pool } from 'mysql2/promise';
import type { Actor } from '../contracts.ts';
import { ensure, id } from '../common/errors.ts';
import { rows, run, transaction } from '../db/database.ts';
import { pagination } from '../community/rules.ts';

export class FavoriteService {
    pool: Pool;
    constructor(pool: Pool) { this.pool = pool; }
    async set(actor: Actor, productId: string, enabled: boolean) {
        id(productId);
        if (!enabled) {
            await run(this.pool, 'DELETE FROM favorite WHERE user_id=? AND product_id=?', [actor.id, productId]);
            return { productId, favorited: false };
        }
        return transaction(this.pool, async db => {
            const [product] = await rows(db, 'SELECT status,moderation_frozen,seller_id FROM product WHERE id=? FOR UPDATE', [productId]);
            const [seller] = product ? await rows(db, 'SELECT status FROM app_user WHERE id=?', [String(product.seller_id)]) : [];
            const [existing] = await rows(db, 'SELECT product_id FROM favorite WHERE user_id=? AND product_id=?', [actor.id, productId]);
            if (!existing) {
                ensure(product?.status === 'ON_SALE' && !product.moderation_frozen && seller?.status === 'ACTIVE', 404, 'NOT_FOUND', '只能收藏当前上架的商品');
                await run(db, 'INSERT INTO favorite(user_id,product_id) VALUES (?,?)', [actor.id, productId]);
            }
            return { productId, favorited: true };
        });
    }
    async list(actor: Actor, query: Record<string, unknown>) {
        const { page, pageSize, sql } = pagination(query);
        const [count] = await rows(this.pool, 'SELECT COUNT(*) AS n FROM favorite WHERE user_id=?', [actor.id]);
        const products = await rows(this.pool, `SELECT p.id,p.title,p.price_cents,p.status,p.moderation_frozen,u.status AS seller_status,
            (SELECT asset_id FROM product_image WHERE product_id=p.id ORDER BY sort_order LIMIT 1) AS cover_id
            FROM favorite f JOIN product p ON p.id=f.product_id JOIN app_user u ON u.id=p.seller_id WHERE f.user_id=? ORDER BY f.created_at DESC,p.id DESC${sql}`, [actor.id]);
        return { items: products.map(p => ({ productId: String(p.id), title: p.title, priceCents: p.price_cents, status: p.status, available: p.status === 'ON_SALE' && !p.moderation_frozen && p.seller_status === 'ACTIVE', coverId: p.cover_id ? String(p.cover_id) : null })), total: Number(count.n), page, pageSize };
    }
}
