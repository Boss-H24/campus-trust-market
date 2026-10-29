import type { Pool } from 'mysql2/promise';
import type { Actor } from '../contracts.ts';
import { CREDIT_RULES } from '../contracts.ts';
import { ensure, id, text } from '../common/errors.ts';
import { rows, run, transaction, audit } from '../db/database.ts';
import { cursor, pagination, rule, ruleValue } from '../community/rules.ts';
import { ConversationRepository } from '../conversations/repository.ts';
import { presentReport } from './repository.ts';
import { applyCreditEvent, type CreditEventApplier } from './credit.ts';

function administrator(actor: Actor) { ensure(actor.role === 'ADMIN', 403, 'FORBIDDEN', '需要管理员权限'); }
function version(value: unknown) { ensure(Number.isSafeInteger(value) && Number(value) >= 0, 400, 'INVALID_INPUT', '请携带当前版本'); return value; }
export class ModerationService {
    pool: Pool;
    applyCredit: CreditEventApplier;
    constructor(pool: Pool, applyCredit: CreditEventApplier = applyCreditEvent) { this.pool = pool; this.applyCredit = applyCredit; }
    async createReport(actor: Actor, body: Record<string, unknown>) {
        ensure(body.targetType === 'PRODUCT' || body.targetType === 'USER', 400, 'INVALID_INPUT', '举报对象类型无效');
        const targetId = id(body.targetId), reason = text(body.reason, '举报原因', 1, 100), description = text(body.description ?? '', '举报说明', 0, 1000);
        return transaction(this.pool, async db => {
            await rows(db, 'SELECT id FROM app_user WHERE id=? FOR UPDATE', [actor.id]);
            const [target] = body.targetType === 'PRODUCT'
                ? await rows(db, "SELECT p.seller_id AS user_id FROM product p JOIN app_user u ON u.id=p.seller_id WHERE p.id=? AND u.role='STUDENT' AND (p.status='ON_SALE' OR EXISTS(SELECT 1 FROM conversation WHERE product_id=p.id AND (buyer_id=? OR seller_id=?)))", [targetId, actor.id, actor.id])
                : await rows(db, "SELECT id AS user_id FROM app_user WHERE id=? AND role='STUDENT'", [targetId]);
            ensure(target, 404, 'NOT_FOUND', '举报对象不存在或无权访问');
            ensure(String(target.user_id) !== actor.id, 400, 'SELF_REPORT', '不能举报自己或自己的商品');
            const [recent] = await rows(db, 'SELECT COUNT(*) AS n FROM report WHERE reporter_id=? AND created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE)', [actor.id]);
            ensure(recent.n < await rule(db, 'reports_per_minute'), 429, 'RATE_LIMITED', '举报过于频繁，请稍后重试');
            const [duplicate] = await rows(db, "SELECT id FROM report WHERE reporter_id=? AND target_type=? AND target_id=? AND status IN ('PENDING','INVESTIGATING')", [actor.id, body.targetType, targetId]);
            ensure(!duplicate, 409, 'REPORT_PENDING', '该对象已有待处理举报，请勿重复提交');
            const result = await run(db, 'INSERT INTO report(reporter_id,target_type,target_id,target_user_id,reason,description) VALUES (?,?,?,?,?,?)', [actor.id, body.targetType, targetId, String(target.user_id), reason, description]);
            const [report] = await rows(db, 'SELECT * FROM report WHERE id=?', [String(result.insertId)]);
            return presentReport(report);
        });
    }
    async reports(actor: Actor, query: Record<string, unknown>, admin = false) {
        if (admin) administrator(actor);
        const { page, pageSize, sql } = pagination(query), clauses: string[] = [], params: any[] = [];
        if (!admin) { clauses.push('reporter_id=?'); params.push(actor.id); }
        if (query.status !== undefined) {
            ensure(['PENDING', 'INVESTIGATING', 'UPHELD', 'REJECTED', 'CLOSED'].includes(String(query.status)), 400, 'INVALID_INPUT', '举报状态无效');
            clauses.push('status=?'); params.push(query.status);
        }
        const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
        const [count] = await rows(this.pool, 'SELECT COUNT(*) AS n FROM report' + where, params);
        const result = await rows(this.pool, 'SELECT * FROM report' + where + ' ORDER BY id DESC' + sql, params);
        return { items: result.map(row => presentReport(row, admin)), total: Number(count.n), page, pageSize };
    }
    async progress(actor: Actor, reportId: string, body: Record<string, unknown>) {
        administrator(actor); id(reportId); version(body.expectedVersion);
        ensure(body.action === 'INVESTIGATE' || body.action === 'CLOSE', 400, 'INVALID_INPUT', '工单动作无效');
        return transaction(this.pool, async db => {
            const [report] = await rows(db, 'SELECT * FROM report WHERE id=? FOR UPDATE', [reportId]);
            ensure(report, 404, 'NOT_FOUND', '举报不存在');
            ensure(report.version === body.expectedVersion, 409, 'STALE_REVIEW', '工单已更新，请刷新');
            ensure(body.action === 'INVESTIGATE' ? report.status === 'PENDING' : ['UPHELD', 'REJECTED'].includes(report.status), 409, 'INVALID_STATE', '当前状态不能执行此动作');
            await run(db, 'UPDATE report SET status=?,version=version+1 WHERE id=?', [body.action === 'INVESTIGATE' ? 'INVESTIGATING' : 'CLOSED', reportId]);
            await audit(db, actor.id, 'REPORT_' + body.action, reportId);
            const [updated] = await rows(db, 'SELECT * FROM report WHERE id=?', [reportId]);
            return presentReport(updated, true);
        });
    }
    async resolve(actor: Actor, reportId: string, body: Record<string, unknown>) {
        administrator(actor); id(reportId);
        ensure(body.decision === 'UPHELD' || body.decision === 'REJECTED', 400, 'INVALID_INPUT', '处理结论无效');
        ensure(['NONE', 'TAKE_DOWN', 'FREEZE_PRODUCT', 'DISABLE_USER'].includes(String(body.action)), 400, 'INVALID_INPUT', '处置动作无效');
        ensure(body.decision === 'UPHELD' || body.action === 'NONE', 400, 'INVALID_INPUT', '驳回举报不能执行处罚');
        const reason = text(body.reason, '处理理由', 1, 200);
        return transaction(this.pool, async db => {
            // B/C共用锁顺序：目标用户 → 商品 → 工单；信誉服务复用当前连接，禁止内部提交。
            const [snapshot] = await rows(db, 'SELECT * FROM report WHERE id=?', [reportId]);
            ensure(snapshot, 404, 'NOT_FOUND', '举报不存在');
            await rows(db, 'SELECT id FROM app_user WHERE id=? FOR UPDATE', [String(snapshot.target_user_id)]);
            let product;
            if (snapshot.target_type === 'PRODUCT') [product] = await rows(db, 'SELECT * FROM product WHERE id=? FOR UPDATE', [String(snapshot.target_id)]);
            const [report] = await rows(db, 'SELECT * FROM report WHERE id=? FOR UPDATE', [reportId]);
            ensure(report.status === 'PENDING' || report.status === 'INVESTIGATING', 409, 'REPORT_RESOLVED', '该举报已处理，请刷新查看结果');
            ensure(actor.id !== String(report.target_user_id) && actor.id !== String(report.reporter_id), 403, 'CONFLICT_OF_INTEREST', '不能处理与自己有关的举报');
            if (body.decision === 'UPHELD') {
                ensure(!['TAKE_DOWN', 'FREEZE_PRODUCT'].includes(String(body.action)) || product, 400, 'INVALID_INPUT', '商品处置只适用于商品举报');
                await this.applyCredit(db, { userId: String(report.target_user_id), eventType: 'REPORT_UPHELD', sourceId: reportId, delta: CREDIT_RULES.report });
                if (product && ['TAKE_DOWN', 'FREEZE_PRODUCT'].includes(String(body.action))) {
                    ensure(product.status !== 'SOLD', 409, 'INVALID_STATE', '已售商品不能下架或冻结，请使用账号处置');
                    const frozen = body.action === 'FREEZE_PRODUCT' || product.status === 'LOCKED' || !!product.moderation_frozen;
                    const status = product.status === 'LOCKED' ? 'LOCKED' : frozen ? 'FROZEN' : 'OFF_SHELF';
                    await run(db, 'UPDATE product SET moderation_frozen=?,status=?,version=version+1 WHERE id=?', [frozen, status, String(report.target_id)]);
                }
                if (body.action === 'DISABLE_USER') {
                    await run(db, "UPDATE app_user SET status='DISABLED' WHERE id=? AND role='STUDENT'", [String(report.target_user_id)]);
                    await run(db, 'DELETE FROM auth_session WHERE user_id=?', [String(report.target_user_id)]);
                }
            }
            await run(db, 'UPDATE report SET status=?,decision=?,action=?,resolution_reason=?,reviewed_by=?,version=version+1 WHERE id=?', [body.decision, body.decision, body.action, reason, actor.id, reportId]);
            await audit(db, actor.id, 'REPORT_RESOLVED', reportId, { decision: String(body.decision), action: String(body.action) });
            const [updated] = await rows(db, 'SELECT * FROM report WHERE id=?', [reportId]);
            return presentReport(updated, true);
        });
    }
    async evidence(actor: Actor, reportId: string, query: Record<string, unknown>) {
        administrator(actor); id(reportId);
        const afterId = cursor(query.afterId), conversationId = query.conversationId === undefined ? null : id(query.conversationId);
        return transaction(this.pool, async db => {
            const [report] = await rows(db, 'SELECT * FROM report WHERE id=?', [reportId]);
            ensure(report, 404, 'NOT_FOUND', '举报不存在');
            ensure(actor.id !== String(report.reporter_id) && actor.id !== String(report.target_user_id), 403, 'CONFLICT_OF_INTEREST', '不能查阅与自己有关的举报凭证');
            const conversations = await rows(db, `SELECT c.id,c.product_id FROM conversation c WHERE
                ((c.buyer_id=? AND c.seller_id=?) OR (c.seller_id=? AND c.buyer_id=?))
                ${report.target_type === 'PRODUCT' ? 'AND c.product_id=?' : ''} ORDER BY c.id DESC LIMIT 100`,
                [String(report.reporter_id), String(report.target_user_id), String(report.reporter_id), String(report.target_user_id), ...(report.target_type === 'PRODUCT' ? [String(report.target_id)] : [])]);
            if (!conversationId) return { conversations: conversations.map(c => ({ id: String(c.id), productId: String(c.product_id) })) };
            ensure(conversations.some(c => String(c.id) === conversationId), 403, 'EVIDENCE_FORBIDDEN', '该会话不属于本举报授权范围');
            await audit(db, actor.id, 'REPORT_EVIDENCE_READ', reportId, { conversationId });
            return new ConversationRepository().messages(db, conversationId, afterId);
        });
    }
    async users(actor: Actor, query: Record<string, unknown>) {
        administrator(actor);
        const { page, pageSize, sql } = pagination(query);
        const [count] = await rows(this.pool, "SELECT COUNT(*) AS n FROM app_user WHERE role='STUDENT'");
        const items = await rows(this.pool, "SELECT id,nickname,status,credit_score AS creditScore,certification_status AS certificationStatus FROM app_user WHERE role='STUDENT' ORDER BY id DESC" + sql);
        return { items: items.map(u => ({ ...u, id: String(u.id) })), total: Number(count.n), page, pageSize };
    }
    async user(actor: Actor, userId: string, body: Record<string, unknown>) {
        administrator(actor); id(userId);
        ensure(Object.keys(body).every(key => ['action', 'reason'].includes(key)), 400, 'INVALID_INPUT', '只能禁用或恢复账号，不能修改身份和信誉');
        ensure(body.action === 'DISABLE' || body.action === 'ENABLE', 400, 'INVALID_INPUT', '账号动作无效');
        const reason = text(body.reason, '处置理由', 1, 200);
        return transaction(this.pool, async db => {
            const [user] = await rows(db, 'SELECT id,role FROM app_user WHERE id=? FOR UPDATE', [userId]);
            ensure(user, 404, 'NOT_FOUND', '用户不存在');
            ensure(user.role !== 'ADMIN' && actor.id !== userId, 403, 'FORBIDDEN', '不能处置管理员账号');
            const status = body.action === 'DISABLE' ? 'DISABLED' : 'ACTIVE';
            await run(db, 'UPDATE app_user SET status=? WHERE id=?', [status, userId]);
            if (status === 'DISABLED') await run(db, 'DELETE FROM auth_session WHERE user_id=?', [userId]);
            await audit(db, actor.id, 'USER_' + body.action, userId, { reasonProvided: String(!!reason) });
            return { id: userId, status };
        });
    }
    async unfreeze(actor: Actor, productId: string, body: Record<string, unknown>) {
        administrator(actor); id(productId); version(body.expectedVersion); text(body.reason, '恢复理由', 1, 200);
        ensure(body.action === 'UNFREEZE', 400, 'INVALID_INPUT', '恢复动作无效');
        return transaction(this.pool, async db => {
            const [product] = await rows(db, 'SELECT * FROM product WHERE id=? FOR UPDATE', [productId]);
            ensure(product, 404, 'NOT_FOUND', '商品不存在');
            ensure(product.version === body.expectedVersion, 409, 'STALE_REVIEW', '商品已更新，请刷新');
            ensure(product.moderation_frozen || product.status === 'FROZEN', 409, 'INVALID_STATE', '商品未冻结');
            await run(db, "UPDATE product SET moderation_frozen=0,status=IF(status='FROZEN','OFF_SHELF',status),version=version+1 WHERE id=?", [productId]);
            await audit(db, actor.id, 'PRODUCT_UNFROZEN', productId);
            return { id: productId, moderationFrozen: false };
        });
    }
    async categories(actor: Actor) { administrator(actor); return { items: (await rows(this.pool, 'SELECT id,name,active FROM category ORDER BY id')).map(item => ({ id: String(item.id), name: item.name, active: !!item.active })) }; }
    async category(actor: Actor, body: Record<string, unknown>, update = false) {
        administrator(actor);
        const name = text(body.name, '分类名称', 1, 30);
        if (update) { id(body.id); ensure(typeof body.active === 'boolean', 400, 'INVALID_INPUT', '分类启用状态无效'); }
        return transaction(this.pool, async db => {
            let categoryId: string;
            if (update) {
                const [category] = await rows(db, 'SELECT id FROM category WHERE id=? FOR UPDATE', [body.id]);
                ensure(category, 404, 'NOT_FOUND', '分类不存在');
                categoryId = String(body.id);
                await run(db, 'UPDATE category SET name=?,active=? WHERE id=?', [name, body.active, categoryId]);
            } else {
                const result = await run(db, 'INSERT INTO category(name) VALUES (?)', [name]);
                categoryId = String(result.insertId);
            }
            await audit(db, actor.id, update ? 'CATEGORY_UPDATED' : 'CATEGORY_CREATED', categoryId);
            return { id: categoryId, name, active: update ? body.active : true };
        });
    }
    async rules(actor: Actor) { administrator(actor); return { items: await rows(this.pool, 'SELECT rule_key AS `key`,value,version FROM platform_rule ORDER BY rule_key') }; }
    async updateRule(actor: Actor, key: string, body: Record<string, unknown>) {
        administrator(actor); version(body.expectedVersion);
        const value = ruleValue(key, body.value);
        return transaction(this.pool, async db => {
            const result = await run(db, 'UPDATE platform_rule SET value=?,version=version+1,updated_by=? WHERE rule_key=? AND version=?', [JSON.stringify(value), actor.id, key, body.expectedVersion]);
            ensure(result.affectedRows === 1, 409, 'STALE_REVIEW', '规则已更新，请刷新');
            await audit(db, actor.id, 'RULE_UPDATED', key);
            return { key, value, version: Number(body.expectedVersion) + 1 };
        });
    }
    async logs(actor: Actor, query: Record<string, unknown>) {
        administrator(actor);
        const { page, pageSize, sql } = pagination(query), [count] = await rows(this.pool, 'SELECT COUNT(*) AS n FROM operation_log');
        const items = await rows(this.pool, 'SELECT id,actor_id AS actorId,action,target,created_at AS createdAt FROM operation_log ORDER BY id DESC' + sql);
        return { items, total: Number(count.n), page, pageSize };
    }
}
