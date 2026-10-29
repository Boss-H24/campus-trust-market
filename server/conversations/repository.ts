import { rows, type Db, type Row } from '../db/database.ts';

export class ConversationRepository {
    async participant(db: Db, conversationId: string, userId: string, lock = false) {
        const [conversation] = await rows(db, 'SELECT * FROM conversation WHERE id=? AND (buyer_id=? OR seller_id=?)' + (lock ? ' FOR UPDATE' : ''), [conversationId, userId, userId]);
        return conversation;
    }
    present(row: Row) { return { id: String(row.id), productId: String(row.product_id), buyerId: String(row.buyer_id), sellerId: String(row.seller_id) }; }
    message(row: Row) { return { id: String(row.id), conversationId: String(row.conversation_id), senderId: String(row.sender_id), clientMessageId: row.client_message_id, content: row.content, createdAt: row.created_at }; }
    async messages(db: Db, conversationId: string, afterId: string) {
        // 取51条探测下一页；使用字符串游标，避免bigint转换为JS number丢失精度。
        const result = await rows(db, 'SELECT * FROM chat_message WHERE conversation_id=? AND id>? ORDER BY id LIMIT 51', [conversationId, afterId]);
        const items = result.slice(0, 50).map(row => this.message(row));
        return { items, nextAfterId: items.at(-1)?.id || afterId, hasMore: result.length > 50 };
    }
}
