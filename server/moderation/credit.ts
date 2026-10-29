import type { PoolConnection } from 'mysql2/promise';
import { AppError, ensure } from '../common/errors.ts';

export type CreditEvent = { userId: string; eventType: 'REPORT_UPHELD'; sourceId: string; delta: number };
export type CreditEventApplier = (db: PoolConnection, event: CreditEvent) => Promise<{ applied: boolean; creditScore: number }>;

// B拥有credit_event和信誉写入。未合入B时回滚整个举报处理，绝不假装扣分成功。
export const applyCreditEvent: CreditEventApplier = async (db, event) => {
    const path = new URL('../credit/service.' + (import.meta.url.endsWith('.ts') ? 'ts' : 'js'), import.meta.url);
    let module: any;
    try { module = await import(path.href); }
    catch (error: any) {
        if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === path.href)
            throw new AppError(503, 'CREDIT_SERVICE_UNAVAILABLE', 'B的信誉服务尚未接入，举报保持待处理，请稍后重试');
        throw error;
    }
    ensure(typeof module.CreditService?.applyEvent === 'function', 503, 'CREDIT_SERVICE_UNAVAILABLE', 'B的信誉服务接口不兼容，请核对交接契约');
    return module.CreditService.applyEvent(db, event);
};
