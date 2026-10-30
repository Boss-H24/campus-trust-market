import type { PoolConnection } from 'mysql2/promise';
import { CreditService } from '../orders/credit-service.ts';

export type CreditEvent = { userId: string; eventType: 'REPORT_UPHELD'; sourceId: string; delta: number };
export type CreditEventApplier = (db: PoolConnection, event: CreditEvent) => Promise<{ applied: boolean; creditScore: number }>;

// C的举报成立事件映射为B拥有的REPORT账本事件，始终复用处置事务的连接。
export const applyCreditEvent: CreditEventApplier = async (db, event) => {
    return new CreditService().applyEvent(db, { ...event, eventType: 'REPORT' });
};
