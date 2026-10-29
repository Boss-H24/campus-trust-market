import type { Pool } from 'mysql2/promise';
import type { Actor } from '../contracts.ts';
import { ensure, id, text } from '../common/errors.ts';
import { rows, run, transaction } from '../db/database.ts';
import { checkCommunityContent, cursor, pagination, rule } from '../community/rules.ts';
import { ConversationRepository } from './repository.ts';

export class ConversationService {
    pool: Pool;
    repository = new ConversationRepository();
    constructor(pool: Pool) { this.pool = pool; }
    async create(actor: Actor, body: Record<string, unknown>) {
        const productId = id(body.productId);
        return transaction(this.pool, async db => {
            const [snapshot] = await rows(db, 'SELECT seller_id FROM product WHERE id=?', [productId]);
            ensure(snapshot, 404, 'NOT_FOUND', '商品不存在');
            ensure(String(snapshot.seller_id) !== actor.id, 400, 'SELF_CONVERSATION', '不能咨询自己的商品');
            const participants = await rows(db, 'SELECT id,status FROM app_user WHERE id IN (?,?) ORDER BY id FOR UPDATE', [actor.id, String(snapshot.seller_id)]);
            ensure(participants.every(user => user.status === 'ACTIVE'), 409, 'UNAVAILABLE', '参与者账号当前不可用');
            const [product] = await rows(db, 'SELECT * FROM product WHERE id=? FOR UPDATE', [productId]);
            const [existing] = await rows(db, 'SELECT * FROM conversation WHERE product_id=? AND buyer_id=? AND seller_id=? FOR UPDATE', [productId, actor.id, product.seller_id]);
            if (existing) return this.repository.present(existing);
            ensure(product.status === 'ON_SALE' && !product.moderation_frozen, 409, 'UNAVAILABLE', '商品当前不可咨询');
            const result = await run(db, 'INSERT INTO conversation(product_id,buyer_id,seller_id) VALUES (?,?,?)', [productId, actor.id, product.seller_id]);
            return { id: String(result.insertId), productId, buyerId: actor.id, sellerId: String(product.seller_id) };
        });
    }
    async list(actor: Actor, query: Record<string, unknown>) {
        const { page, pageSize, sql } = pagination(query);
        const [count] = await rows(this.pool, 'SELECT COUNT(*) AS n FROM conversation WHERE buyer_id=? OR seller_id=?', [actor.id, actor.id]);
        const result = await rows(this.pool, `SELECT c.*,p.title,u.nickname AS peer_name,
            (SELECT content FROM chat_message WHERE conversation_id=c.id ORDER BY id DESC LIMIT 1) AS last_message
            FROM conversation c JOIN product p ON p.id=c.product_id JOIN app_user u ON u.id=IF(c.buyer_id=?,c.seller_id,c.buyer_id)
            WHERE c.buyer_id=? OR c.seller_id=? ORDER BY c.id DESC${sql}`, [actor.id, actor.id, actor.id]);
        return { items: result.map(row => ({ ...this.repository.present(row), productTitle: row.title, peerName: row.peer_name, lastMessage: row.last_message || '' })), total: Number(count.n), page, pageSize };
    }
    async messages(actor: Actor, conversationId: string, afterId: unknown) {
        id(conversationId);
        ensure(await this.repository.participant(this.pool, conversationId, actor.id), 404, 'NOT_FOUND', '会话不存在或无权访问');
        return this.repository.messages(this.pool, conversationId, cursor(afterId));
    }
    async send(actor: Actor, conversationId: string, body: Record<string, unknown>) {
        id(conversationId);
        const content = text(body.content, '消息', 1, 1000), clientMessageId = text(body.clientMessageId, '消息标识', 1, 80);
        ensure(/^[A-Za-z0-9_-]+$/.test(clientMessageId), 400, 'INVALID_INPUT', '消息标识只能包含字母数字下划线和短横线');
        return transaction(this.pool, async db => {
            // 发送方行锁同时串行化跨会话限频；会话锁让消息ID按提交顺序可见，增量读取不丢消息。
            const [sender] = await rows(db, 'SELECT status FROM app_user WHERE id=? FOR UPDATE', [actor.id]);
            ensure(sender?.status === 'ACTIVE', 403, 'ACCOUNT_DISABLED', '账号已禁用');
            const conversation = await this.repository.participant(db, conversationId, actor.id, true);
            ensure(conversation, 404, 'NOT_FOUND', '会话不存在或无权访问');
            const [existing] = await rows(db, 'SELECT * FROM chat_message WHERE conversation_id=? AND sender_id=? AND client_message_id=?', [conversationId, actor.id, clientMessageId]);
            if (existing) {
                ensure(existing.content === content, 409, 'IDEMPOTENCY_CONFLICT', '同一消息标识不能用于不同内容');
                return this.repository.message(existing);
            }
            const peer = String(conversation.buyer_id) === actor.id ? conversation.seller_id : conversation.buyer_id;
            const [recipient] = await rows(db, 'SELECT status FROM app_user WHERE id=?', [peer]);
            ensure(recipient?.status === 'ACTIVE', 409, 'UNAVAILABLE', '对方账号当前不可用');
            await checkCommunityContent(db, content);
            const [recent] = await rows(db, 'SELECT COUNT(*) AS n FROM chat_message WHERE sender_id=? AND created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE)', [actor.id]);
            ensure(recent.n < await rule(db, 'messages_per_minute'), 429, 'RATE_LIMITED', '消息发送过于频繁，请稍后重试');
            const result = await run(db, 'INSERT INTO chat_message(conversation_id,sender_id,client_message_id,content) VALUES (?,?,?,?)', [conversationId, actor.id, clientMessageId, content]);
            const [message] = await rows(db, 'SELECT * FROM chat_message WHERE id=?', [String(result.insertId)]);
            return this.repository.message(message);
        });
    }
}
