import type { Db } from '../db/database.ts';
import { rows, run } from '../db/database.ts';
import { ensure } from '../common/errors.ts';
import { CREDIT_RULES, type CreditEventType } from '../contracts.ts';
import { validateCreditEvent } from './rules.ts';

export type CreditEventInput = {
    userId: string;
    eventType: CreditEventType;
    sourceId: string;
    delta: number;
};

export class CreditService {
    async applyEvent(db: Db, input: CreditEventInput): Promise<{ applied: boolean; creditScore: number }> {
        ensure(/^[1-9]\d{0,18}$/.test(input.userId), 400, 'INVALID_INPUT', '用户编号格式错误');
        ensure(typeof input.sourceId === 'string' && /^[A-Za-z0-9:_-]{1,80}$/.test(input.sourceId), 400, 'INVALID_INPUT', '信誉事件来源格式错误');
        ensure(Number.isSafeInteger(input.delta), 400, 'INVALID_INPUT', '信誉事件分值无效');
        const eventType = validateCreditEvent(input.eventType);
        const [user] = await rows(db, 'SELECT credit_score FROM app_user WHERE id=? FOR UPDATE', [input.userId]);
        ensure(user, 404, 'NOT_FOUND', '用户不存在');
        const current = Number(user.credit_score);
        const result = await run(db, 'INSERT IGNORE INTO credit_event (user_id,event_type,source_id,delta) VALUES (?,?,?,?)', [
            input.userId, eventType, input.sourceId, input.delta
        ]);
        if (result.affectedRows !== 1)
            return { applied: false, creditScore: current };
        const creditScore = Math.min(CREDIT_RULES.maximum, Math.max(CREDIT_RULES.minimum, current + input.delta));
        await run(db, 'UPDATE app_user SET credit_score=? WHERE id=?', [creditScore, input.userId]);
        return { applied: true, creditScore };
    }
}
