import { randomBytes } from 'node:crypto';
import type { Pool } from 'mysql2/promise';
import type { Actor } from '../contracts.ts';
import { ensure, id } from '../common/errors.ts';
import { audit, rows, run, transaction } from '../db/database.ts';
import { CreditService } from './credit-service.ts';
import { OrderRepository } from './repository.ts';
import { validateRequestId } from './rules.ts';

export class OrderService {
    pool: Pool;
    repository: OrderRepository;
    credit: CreditService;

    constructor(pool: Pool) {
        this.pool = pool;
        this.repository = new OrderRepository(pool);
        this.credit = new CreditService();
    }

    orderNo(): string {
        const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
        return `CM${stamp}${randomBytes(5).toString('hex').toUpperCase()}`;
    }

    async create(actor: Actor, body: Record<string, unknown>) {
        ensure(actor.role === 'STUDENT', 403, 'FORBIDDEN', '管理员不能作为买家下单');
        const productId = id(body.productId), requestId = validateRequestId(body.requestId);
        const orderNo = await transaction(this.pool, async db => {
            const [buyer] = await rows(db, 'SELECT status,certification_status FROM app_user WHERE id=? FOR UPDATE', [actor.id]);
            ensure(buyer?.status === 'ACTIVE', 403, 'ACCOUNT_DISABLED', '账号已禁用');
            const duplicate = await this.repository.findByBuyerRequest(db, actor.id, requestId);
            if (duplicate)
                return String(duplicate.order_no);
            ensure(buyer.certification_status === 'VERIFIED', 403, 'CERTIFICATION_REQUIRED', '请先完成学生实名认证');

            const [reference] = await rows(db, 'SELECT seller_id FROM product WHERE id=?', [productId]);
            ensure(reference, 404, 'NOT_FOUND', '商品不存在');
            const sellerId = String(reference.seller_id);
            ensure(sellerId !== actor.id, 403, 'SELF_PURCHASE', '不能购买自己发布的商品');

            const userIds = [actor.id, sellerId].sort((left, right) => Number(left) - Number(right));
            const users = new Map<string, any>();
            for (const userId of userIds) {
                const [user] = await rows(db, 'SELECT id,status,certification_status FROM app_user WHERE id=? FOR UPDATE', [userId]);
                ensure(user, 404, 'NOT_FOUND', '交易用户不存在');
                users.set(userId, user);
            }
            const seller = users.get(sellerId);
            ensure(seller?.status === 'ACTIVE', 403, 'ACCOUNT_DISABLED', '卖家账号已禁用');
            ensure(seller.certification_status === 'VERIFIED', 403, 'CERTIFICATION_REQUIRED', '卖家尚未完成实名认证');
            ensure(users.get(actor.id)?.certification_status === 'VERIFIED', 403, 'CERTIFICATION_REQUIRED', '请先完成学生实名认证');

            const [product] = await rows(db, `SELECT id,seller_id,title,price_cents,status,version
        FROM product WHERE id=? FOR UPDATE`, [productId]);
            ensure(product && String(product.seller_id) === sellerId, 409, 'PRODUCT_UNAVAILABLE', '商品当前不可购买');
            ensure(product.status === 'ON_SALE', 409, 'PRODUCT_UNAVAILABLE', '商品已下架、锁定或售出');
            const locked = await run(db, "UPDATE product SET status='LOCKED',version=version+1 WHERE id=? AND status='ON_SALE' AND version=?", [productId, product.version]);
            ensure(locked.affectedRows === 1, 409, 'PRODUCT_UNAVAILABLE', '商品状态已变化，请刷新后重试');

            const nextOrderNo = this.orderNo();
            const orderId = await this.repository.insert(db, {
                orderNo: nextOrderNo,
                productId,
                buyerId: actor.id,
                sellerId,
                productTitle: product.title,
                amountCents: Number(product.price_cents),
                productVersion: Number(product.version),
                requestId
            });
            await this.repository.insertLog(db, {
                orderId,
                fromStatus: null,
                toStatus: 'PENDING_PAYMENT',
                action: 'CREATE',
                actorId: actor.id,
                actorRole: 'BUYER',
                requestId
            });
            await audit(db, actor.id, 'ORDER_CREATED', nextOrderNo, { productId });
            return nextOrderNo;
        });
        const order = await this.repository.findByNo(this.pool, orderNo);
        ensure(order, 500, 'INTERNAL_ERROR', '订单创建后读取失败');
        return this.repository.present(order);
    }
}
