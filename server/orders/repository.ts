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

    async findDetailed(db: Db, orderNo: string): Promise<Row | undefined> {
        const [order] = await rows(db, `SELECT o.*,
      p.status AS product_status,
      buyer.nickname AS buyer_nickname,buyer.avatar_asset_id AS buyer_avatar_id,
      buyer.credit_score AS buyer_credit,buyer.certification_status AS buyer_certification,
      seller.nickname AS seller_nickname,seller.avatar_asset_id AS seller_avatar_id,
      seller.credit_score AS seller_credit,seller.certification_status AS seller_certification
      FROM orders o
      JOIN product p ON p.id=o.product_id
      JOIN app_user buyer ON buyer.id=o.buyer_id
      JOIN app_user seller ON seller.id=o.seller_id
      WHERE o.order_no=?`, [orderNo]);
        return order;
    }

    async findStatusLogByRequest(db: Db, orderId: string, requestId: string): Promise<Row | undefined> {
        const [log] = await rows(db, 'SELECT * FROM order_status_log WHERE order_id=? AND request_id=?', [orderId, requestId]);
        return log;
    }

    async history(db: Db, orderId: string): Promise<Row[]> {
        return rows(db, `SELECT from_status,to_status,action,actor_role,created_at
      FROM order_status_log WHERE order_id=? ORDER BY created_at,id`, [orderId]);
    }

    async list(db: Db, side: 'buyer' | 'seller', userId: string, pageSize: number, offset: number) {
        const column = side === 'buyer' ? 'o.buyer_id' : 'o.seller_id';
        const [count] = await rows(db, `SELECT COUNT(*) AS total FROM orders o WHERE ${column}=?`, [userId]);
        const items = await rows(db, `SELECT o.*,
        p.status AS product_status,
        buyer.nickname AS buyer_nickname,buyer.avatar_asset_id AS buyer_avatar_id,
        buyer.credit_score AS buyer_credit,buyer.certification_status AS buyer_certification,
        seller.nickname AS seller_nickname,seller.avatar_asset_id AS seller_avatar_id,
        seller.credit_score AS seller_credit,seller.certification_status AS seller_certification
        FROM orders o
        JOIN product p ON p.id=o.product_id
        JOIN app_user buyer ON buyer.id=o.buyer_id
        JOIN app_user seller ON seller.id=o.seller_id
        WHERE ${column}=? ORDER BY o.id DESC LIMIT ${pageSize} OFFSET ${offset}`, [userId]);
        return { items, total: Number(count.total) };
    }

    async productForUpdate(db: Db, productId: string): Promise<Row | undefined> {
        const [product] = await rows(db, `SELECT p.id,p.seller_id,p.status,p.version,
      seller.status AS seller_status,seller.certification_status AS seller_certification
      FROM product p JOIN app_user seller ON seller.id=p.seller_id
      WHERE p.id=? FOR UPDATE`, [productId]);
        return product;
    }

    async expireCandidates(db: Db): Promise<Row[]> {
        return rows(db, `SELECT order_no,status FROM orders
      WHERE (status='PENDING_PAYMENT' AND created_at<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 15 MINUTE))
         OR (status='PAID' AND updated_at<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 24 HOUR))
      ORDER BY id LIMIT 50`);
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
