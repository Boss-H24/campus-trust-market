import { randomBytes } from 'node:crypto';
import type { Pool } from 'mysql2/promise';
import { ORDER_TRANSITIONS, type Actor, type OrderAction, type OrderStatus } from '../contracts.ts';
import { ensure, id } from '../common/errors.ts';
import { audit, rows, run, transaction, type Db, type Row } from '../db/database.ts';
import { CreditService } from './credit-service.ts';
import { OrderRepository } from './repository.ts';
import { actionActor, creditDeltaForStars, nextOrderState, validateEvaluation, validateOrderAction, validateOrderNo, validateRequestId } from './rules.ts';

type ViewerRole = 'BUYER' | 'SELLER' | 'ADMIN';

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

    private version(value: unknown): number {
        ensure(Number.isSafeInteger(value) && Number(value) >= 0, 400, 'INVALID_INPUT', '订单版本格式错误');
        return Number(value);
    }

    private integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
        if (value === undefined)
            return fallback;
        ensure(typeof value === 'string' && /^\d+$/.test(value), 400, 'INVALID_INPUT', '分页参数格式错误');
        const parsed = Number(value);
        ensure(Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum, 400, 'INVALID_INPUT', '分页参数超出范围');
        return parsed;
    }

    private viewerRole(actor: Actor, order: Row): ViewerRole | null {
        if (String(order.buyer_id) === actor.id)
            return 'BUYER';
        if (String(order.seller_id) === actor.id)
            return 'SELLER';
        return actor.role === 'ADMIN' ? 'ADMIN' : null;
    }

    private availableActions(status: OrderStatus, role: ViewerRole): OrderAction[] {
        return (Object.keys(ORDER_TRANSITIONS[status]) as OrderAction[]).filter(action => {
            const actor = actionActor(action);
            return actor !== 'SYSTEM' && actor === role;
        });
    }

    private party(row: Row, prefix: 'buyer' | 'seller') {
        return {
            id: String(row[`${prefix}_id`]),
            nickname: row[`${prefix}_nickname`],
            avatarId: row[`${prefix}_avatar_id`] === null ? null : String(row[`${prefix}_avatar_id`]),
            certificationStatus: row[`${prefix}_certification`],
            creditScore: Number(row[`${prefix}_credit`])
        };
    }

    private async evaluationRows(db: Db, orderId: string): Promise<Row[]> {
        return rows(db, `SELECT e.id,e.reviewer_id,e.reviewee_id,e.stars,e.content,e.created_at,
      reviewer.nickname AS reviewer_nickname
      FROM evaluation e JOIN app_user reviewer ON reviewer.id=e.reviewer_id
      WHERE e.order_id=? ORDER BY e.id`, [orderId]);
    }

    private async presentDetail(db: Db, row: Row, actor: Actor) {
        const role = this.viewerRole(actor, row);
        ensure(role, 404, 'NOT_FOUND', '订单不存在或无权查看');
        const history = await this.repository.history(db, String(row.id));
        const evaluations = await this.evaluationRows(db, String(row.id));
        const myEvaluation = evaluations.find(evaluation => String(evaluation.reviewer_id) === actor.id);
        return {
            ...this.repository.present(row),
            product: {
                id: String(row.product_id),
                title: row.product_title,
                status: row.product_status,
                imageIds: await this.repository.imageIds(db, String(row.product_id))
            },
            buyer: this.party(row, 'buyer'),
            seller: this.party(row, 'seller'),
            role,
            actions: this.availableActions(row.status as OrderStatus, role),
            canEvaluate: row.status === 'COMPLETED' && (role === 'BUYER' || role === 'SELLER') && !myEvaluation,
            myEvaluation: myEvaluation ? this.presentEvaluation(myEvaluation) : null,
            evaluations: evaluations.map(evaluation => this.presentEvaluation(evaluation)),
            history: history.map(entry => ({
                fromStatus: entry.from_status,
                toStatus: entry.to_status,
                action: entry.action,
                actorRole: entry.actor_role,
                createdAt: entry.created_at
            }))
        };
    }

    private presentEvaluation(evaluation: Row) {
        return {
            id: String(evaluation.id),
            reviewerId: String(evaluation.reviewer_id),
            reviewerNickname: evaluation.reviewer_nickname,
            stars: Number(evaluation.stars),
            content: evaluation.content,
            createdAt: evaluation.created_at
        };
    }

    private async releaseProduct(db: Db, productId: string): Promise<void> {
        const product = await this.repository.productForUpdate(db, productId);
        if (!product || product.status !== 'LOCKED' || product.seller_status !== 'ACTIVE' || product.seller_certification !== 'VERIFIED')
            return;
        await run(db, "UPDATE product SET status='ON_SALE',version=version+1 WHERE id=? AND status='LOCKED'", [productId]);
    }

    private async removeProductFromSale(db: Db, productId: string): Promise<void> {
        const product = await this.repository.productForUpdate(db, productId);
        if (!product || product.status !== 'LOCKED')
            return;
        await run(db, "UPDATE product SET status='SOLD',version=version+1 WHERE id=? AND status='LOCKED'", [productId]);
    }

    private async applyCompletionCredit(db: Db, order: Row): Promise<void> {
        const userIds = [String(order.buyer_id), String(order.seller_id)].sort((left, right) => Number(left) - Number(right));
        for (const userId of userIds)
            await this.credit.applyEvent(db, { userId, eventType: 'COMPLETED', sourceId: String(order.order_no), delta: 1 });
    }

    private async finishTransition(db: Db, order: Row, nextStatus: OrderStatus): Promise<void> {
        if (nextStatus === 'COMPLETED') {
            await this.removeProductFromSale(db, String(order.product_id));
            await this.applyCompletionCredit(db, order);
        }
        else if (nextStatus === 'CANCELLED') {
            await this.releaseProduct(db, String(order.product_id));
        }
    }

    async create(actor: Actor, body: Record<string, unknown>) {
        ensure(actor.role === 'STUDENT', 403, 'FORBIDDEN', '管理员不能作为买家下单');
        const productId = id(body.productId), requestId = validateRequestId(body.requestId);
        await this.sweepExpired();
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
        return this.detail(actor, orderNo);
    }

    async list(actor: Actor, query: Record<string, unknown>) {
        ensure(query.side === 'buyer' || query.side === 'seller', 400, 'INVALID_INPUT', '请选择买家或卖家订单');
        const page = this.integer(query.page, 1, 1, 10000);
        const pageSize = this.integer(query.pageSize, 20, 1, 100);
        await this.sweepExpired();
        const result = await this.repository.list(this.pool, query.side, actor.id, pageSize, (page - 1) * pageSize);
        return {
            items: await Promise.all(result.items.map(async row => ({
                ...this.repository.present(row),
                product: {
                    id: String(row.product_id),
                    title: row.product_title,
                    status: row.product_status,
                    imageIds: await this.repository.imageIds(this.pool, String(row.product_id))
                },
                buyer: this.party(row, 'buyer'),
                seller: this.party(row, 'seller'),
                role: query.side === 'buyer' ? 'BUYER' : 'SELLER'
            }))),
            total: result.total,
            page,
            pageSize
        };
    }

    async detail(actor: Actor, orderNoValue: unknown) {
        const orderNo = validateOrderNo(orderNoValue);
        await this.sweepExpired();
        const order = await this.repository.findDetailed(this.pool, orderNo);
        ensure(order, 404, 'NOT_FOUND', '订单不存在或无权查看');
        return this.presentDetail(this.pool, order, actor);
    }

    async act(actor: Actor, orderNoValue: unknown, body: Record<string, unknown>, forcedAction?: OrderAction) {
        const orderNo = validateOrderNo(orderNoValue);
        const action = forcedAction || validateOrderAction(body.action);
        const requestId = validateRequestId(body.requestId);
        const requestedVersion = this.version(body.version);
        await this.sweepExpired();
        await transaction(this.pool, async db => {
            const order = await this.repository.findByNo(db, orderNo, true);
            ensure(order, 404, 'NOT_FOUND', '订单不存在或无权查看');
            const role = this.viewerRole(actor, order);
            ensure(role, 404, 'NOT_FOUND', '订单不存在或无权查看');
            const previous = await this.repository.findStatusLogByRequest(db, String(order.id), requestId);
            if (previous) {
                ensure(previous.action === action && previous.actor_id !== null && String(previous.actor_id) === actor.id, 409, 'IDEMPOTENCY_CONFLICT', 'requestId已用于其他订单操作');
                return;
            }
            ensure(Number(order.version) === requestedVersion, 409, 'STALE_ORDER', '订单状态已更新，请刷新后重试');
            const expectedRole = actionActor(action);
            ensure(expectedRole !== 'SYSTEM', 403, 'ORDER_ACTION_FORBIDDEN', '该动作只能由系统执行');
            ensure(expectedRole === role, 403, 'ORDER_ACTION_FORBIDDEN', '当前用户无权执行此订单动作');
            const nextStatus = nextOrderState(order.status, action);
            const updated = await run(db, 'UPDATE orders SET status=?,version=version+1 WHERE id=? AND version=?', [nextStatus, order.id, requestedVersion]);
            ensure(updated.affectedRows === 1, 409, 'STALE_ORDER', '订单状态已更新，请刷新后重试');
            await this.finishTransition(db, order, nextStatus);
            await this.repository.insertLog(db, {
                orderId: String(order.id),
                fromStatus: order.status,
                toStatus: nextStatus,
                action,
                actorId: actor.id,
                actorRole: expectedRole,
                requestId
            });
            await audit(db, actor.id, 'ORDER_' + action, orderNo, { fromStatus: order.status, toStatus: nextStatus });
        });
        return this.detail(actor, orderNo);
    }

    async evaluate(actor: Actor, orderNoValue: unknown, body: Record<string, unknown>) {
        const orderNo = validateOrderNo(orderNoValue);
        const input = validateEvaluation(body);
        const evaluationId = await transaction(this.pool, async db => {
            const order = await this.repository.findByNo(db, orderNo, true);
            ensure(order, 404, 'NOT_FOUND', '订单不存在');
            const role = this.viewerRole(actor, order);
            ensure(role === 'BUYER' || role === 'SELLER', 403, 'EVALUATION_FORBIDDEN', '只有交易双方可以评价');
            ensure(order.status === 'COMPLETED', 409, 'EVALUATION_NOT_ALLOWED', '订单完成后才能评价');
            const [existing] = await rows(db, 'SELECT id FROM evaluation WHERE order_id=? AND reviewer_id=?', [order.id, actor.id]);
            ensure(!existing, 409, 'EVALUATION_EXISTS', '你已经评价过这笔订单');
            const revieweeId = role === 'BUYER' ? String(order.seller_id) : String(order.buyer_id);
            const result = await run(db, 'INSERT INTO evaluation (order_id,reviewer_id,reviewee_id,stars,content) VALUES (?,?,?,?,?)', [
                order.id, actor.id, revieweeId, input.stars, input.content
            ]);
            const insertedId = String(result.insertId);
            await this.credit.applyEvent(db, {
                userId: revieweeId,
                eventType: 'EVALUATION',
                sourceId: insertedId,
                delta: creditDeltaForStars(input.stars)
            });
            await audit(db, actor.id, 'ORDER_EVALUATED', orderNo, { stars: String(input.stars) });
            return insertedId;
        });
        const [evaluation] = await rows(this.pool, `SELECT e.id,e.order_id,e.reviewer_id,e.reviewee_id,e.stars,e.content,e.created_at,
      reviewer.nickname AS reviewer_nickname FROM evaluation e
      JOIN app_user reviewer ON reviewer.id=e.reviewer_id WHERE e.id=?`, [evaluationId]);
        ensure(evaluation, 500, 'INTERNAL_ERROR', '评价读取失败');
        return this.presentEvaluation(evaluation);
    }

    async userEvaluations(userIdValue: unknown, query: Record<string, unknown>) {
        const userId = id(userIdValue);
        const page = this.integer(query.page, 1, 1, 10000);
        const pageSize = this.integer(query.pageSize, 20, 1, 100);
        const [user] = await rows(this.pool, 'SELECT id FROM app_user WHERE id=?', [userId]);
        ensure(user, 404, 'NOT_FOUND', '用户不存在');
        const [count] = await rows(this.pool, 'SELECT COUNT(*) AS total FROM evaluation WHERE reviewee_id=?', [userId]);
        const items = await rows(this.pool, `SELECT e.id,e.stars,e.content,e.created_at,reviewer.nickname AS reviewer_nickname
      FROM evaluation e JOIN app_user reviewer ON reviewer.id=e.reviewer_id
      WHERE e.reviewee_id=? ORDER BY e.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, [userId]);
        return {
            items: items.map(evaluation => this.presentEvaluation(evaluation)),
            total: Number(count.total),
            page,
            pageSize
        };
    }

    async sweepExpired(): Promise<void> {
        const candidates = await this.repository.expireCandidates(this.pool);
        for (const candidate of candidates) {
            await transaction(this.pool, async db => {
                const [order] = await rows(db, `SELECT * FROM orders WHERE order_no=? AND (
          (status='PENDING_PAYMENT' AND created_at<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 15 MINUTE))
          OR (status='PAID' AND updated_at<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 24 HOUR))
        ) FOR UPDATE`, [candidate.order_no]);
                if (!order)
                    return;
                const action: OrderAction = order.status === 'PENDING_PAYMENT' ? 'EXPIRE' : 'REQUEST_REFUND';
                const nextStatus = nextOrderState(order.status, action);
                const requestId = (order.status === 'PENDING_PAYMENT' ? 'expire_' : 'refund_timeout_') + String(order.order_no);
                const updated = await run(db, 'UPDATE orders SET status=?,version=version+1 WHERE id=? AND version=?', [nextStatus, order.id, order.version]);
                if (updated.affectedRows !== 1)
                    return;
                await this.finishTransition(db, order, nextStatus);
                await this.repository.insertLog(db, {
                    orderId: String(order.id),
                    fromStatus: order.status,
                    toStatus: nextStatus,
                    action,
                    actorId: null,
                    actorRole: 'SYSTEM',
                    requestId
                });
            });
        }
    }
}
