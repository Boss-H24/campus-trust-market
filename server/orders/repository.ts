import type { Pool } from 'mysql2/promise';
import { rows, run, type Db, type Row } from '../db/database.ts';

export type NewOrder = {
    orderNo: string;
    productId: string;
    buyerId: string;
    sellerId: string;
    productTitle: string;
    amountCents: number;
    productVersion: number;
    requestId: string;
};

export class OrderRepository {
    pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    async findByBuyerRequest(db: Db, buyerId: string, requestId: string): Promise<Row | undefined> {
        const [order] = await rows(db, 'SELECT * FROM orders WHERE buyer_id=? AND buyer_request_id=?', [buyerId, requestId]);
        return order;
    }

    async findByNo(db: Db, orderNo: string, forUpdate = false): Promise<Row | undefined> {
        const [order] = await rows(db, `SELECT * FROM orders WHERE order_no=?${forUpdate ? ' FOR UPDATE' : ''}`, [orderNo]);
        return order;
    }

    async insert(db: Db, input: NewOrder): Promise<string> {
        const result = await run(db, `INSERT INTO orders
      (order_no,product_id,buyer_id,seller_id,product_title,amount_cents,product_version,buyer_request_id)
      VALUES (?,?,?,?,?,?,?,?)`, [
            input.orderNo, input.productId, input.buyerId, input.sellerId, input.productTitle,
            input.amountCents, input.productVersion, input.requestId
        ]);
        return String(result.insertId);
    }

    async insertLog(db: Db, input: {
        orderId: string;
        fromStatus: string | null;
        toStatus: string;
        action: string;
        actorId: string | null;
        actorRole: 'BUYER' | 'SELLER' | 'ADMIN' | 'SYSTEM';
        requestId: string;
    }): Promise<void> {
        await run(db, `INSERT INTO order_status_log
      (order_id,from_status,to_status,action,actor_id,actor_role,request_id)
      VALUES (?,?,?,?,?,?,?)`, [
            input.orderId, input.fromStatus, input.toStatus, input.action,
            input.actorId, input.actorRole, input.requestId
        ]);
    }

    async imageIds(db: Db, productId: string): Promise<string[]> {
        return (await rows(db, 'SELECT asset_id FROM product_image WHERE product_id=? ORDER BY sort_order', [productId]))
            .map(row => String(row.asset_id));
    }

    present(row: Row) {
        return {
            orderNo: row.order_no,
            productId: String(row.product_id),
            buyerId: String(row.buyer_id),
            sellerId: String(row.seller_id),
            amountCents: Number(row.amount_cents),
            status: row.status,
            version: Number(row.version),
            productTitle: row.product_title,
            productVersion: Number(row.product_version),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}
