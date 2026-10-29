import type { Pool } from 'mysql2/promise';
import { rows, type Db, type Row } from '../db/database.ts';
export class ProductRepository {
    pool: Pool;
    constructor(pool: Pool) { this.pool = pool; }
    async images(db: Db, productId: string) { return (await rows(db, 'SELECT asset_id FROM product_image WHERE product_id=? ORDER BY sort_order', [productId])).map(row => String(row.asset_id)); }
    async find(productId: string) { const [product] = await rows(this.pool, 'SELECT p.*,u.status AS seller_status FROM product p JOIN app_user u ON u.id=p.seller_id WHERE p.id=?', [productId]); return product; }
    async assertImages(db: Db, ownerId: string, imageIds: string[]): Promise<boolean> {
        const assets = await rows(db, `SELECT id FROM upload_asset WHERE owner_id=? AND id IN (${imageIds.map(() => '?').join(',')})`, [ownerId, ...imageIds]);
        return assets.length === imageIds.length;
    }
    async replaceImages(db: Db, productId: string, imageIds: string[]) {
        await db.execute('DELETE FROM product_image WHERE product_id=?', [productId]);
        for (const [index, assetId] of imageIds.entries())
            await db.execute('INSERT INTO product_image (product_id,asset_id,sort_order) VALUES (?,?,?)', [productId, assetId, index]);
    }
    present(product: Row, imageIds: string[]) { return { id: String(product.id), sellerId: String(product.seller_id), categoryId: String(product.category_id), title: product.title, description: product.description, priceCents: product.price_cents, condition: product.condition_label, status: product.status, moderationFrozen: !!product.moderation_frozen, rejectionReason: product.rejection_reason, version: product.version, imageIds, createdAt: product.created_at, updatedAt: product.updated_at }; }
}
