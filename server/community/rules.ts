import { ensure, text } from '../common/errors.ts';
import { rows, type Db } from '../db/database.ts';

export const RULE_LIMITS: Record<string, [number, number]> = {
    publish_per_minute: [1, 100], messages_per_minute: [1, 120], reports_per_minute: [1, 30], publish_min_credit: [0, 100]
};
export async function rule(db: Db, key: string): Promise<any> {
    const [entry] = await rows(db, 'SELECT value FROM platform_rule WHERE rule_key=?', [key]);
    ensure(entry, 503, 'RULE_UNAVAILABLE', '平台规则尚未初始化，请先执行迁移');
    return typeof entry.value === 'string' ? JSON.parse(entry.value) : entry.value;
}
export function ruleValue(key: string, value: unknown): unknown {
    if (key === 'blocked_keywords') {
        ensure(Array.isArray(value) && value.length <= 100, 400, 'INVALID_INPUT', '关键词最多100项');
        return [...new Set(value.map(word => text(word, '关键词', 1, 30).normalize('NFKC').toLowerCase()))];
    }
    const bounds = RULE_LIMITS[key];
    ensure(bounds && Number.isSafeInteger(value) && Number(value) >= bounds[0] && Number(value) <= bounds[1], 400, 'INVALID_INPUT', '规则名称或数值无效');
    return value;
}
export async function checkCommunityContent(db: Db, content: string) {
    const normalized = content.normalize('NFKC').toLowerCase();
    const compact = normalized.replace(/[\s\p{P}\p{Cf}]/gu, '');
    ensure(!/(?:1[3-9]\d{9})|(?:微信|微.?信|wechat|weixin|v信|vx|qq|手机号|电话|加我)/i.test(compact), 400, 'CONTACT_BLOCKED', '请通过站内咨询沟通，不要发布联系方式');
    ensure(!/(?:https?:|www\.|二维码|扫码|站外|私下转账|外部链接)/i.test(normalized), 400, 'CONTACT_BLOCKED', '请勿发送站外引流或转账信息');
    const keywords: string[] = await rule(db, 'blocked_keywords');
    ensure(!keywords.some(word => compact.includes(word.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{Cf}]/gu, ''))), 400, 'CONTENT_BLOCKED', '内容包含平台禁止的信息');
}
export function pagination(query: Record<string, unknown>) {
    function number(value: unknown, fallback: number, maximum: number) {
        if (value === undefined) return fallback;
        ensure(typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number(value) <= maximum, 400, 'INVALID_INPUT', '分页参数无效');
        return Number(value);
    }
    const page = number(query.page, 1, 10000), pageSize = number(query.pageSize, 20, 100);
    return { page, pageSize, sql: ` LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}` };
}
export function cursor(value: unknown): string {
    if (value === undefined) return '0';
    ensure(typeof value === 'string' && /^(0|[1-9]\d{0,18})$/.test(value), 400, 'INVALID_INPUT', '消息游标无效');
    return value;
}
