import { ensure, text } from '../common/errors.ts';
import { CREDIT_RULES, ORDER_TRANSITIONS, type CreditEventType, type OrderAction, type OrderStatus } from '../contracts.ts';

const requestIdPattern = /^[A-Za-z0-9_-]{8,64}$/;
const orderNoPattern = /^CM[A-Z0-9]{16,30}$/;

const actionRoles: Record<OrderAction, 'BUYER' | 'SELLER' | 'ADMIN' | 'SYSTEM'> = {
    PAY: 'BUYER',
    CANCEL: 'BUYER',
    EXPIRE: 'SYSTEM',
    ACCEPT: 'SELLER',
    REJECT: 'SELLER',
    START_DELIVERY: 'SELLER',
    MARK_DELIVERED: 'SELLER',
    CONFIRM: 'BUYER',
    REQUEST_REFUND: 'BUYER',
    OPEN_DISPUTE: 'BUYER',
    RESOLVE_COMPLETE: 'ADMIN',
    RESOLVE_REFUND: 'ADMIN',
    REFUND_SUCCEEDED: 'ADMIN'
};

export function validateRequestId(value: unknown): string {
    ensure(typeof value === 'string' && requestIdPattern.test(value), 400, 'INVALID_INPUT', 'requestId格式错误');
    return value;
}

export function validateOrderNo(value: unknown): string {
    ensure(typeof value === 'string' && orderNoPattern.test(value), 400, 'INVALID_INPUT', '订单号格式错误');
    return value;
}

export function validateOrderAction(value: unknown): OrderAction {
    ensure(typeof value === 'string' && Object.hasOwn(actionRoles, value), 400, 'INVALID_INPUT', '请提交允许的订单动作');
    return value as OrderAction;
}

export function actionActor(action: string): 'BUYER' | 'SELLER' | 'ADMIN' | 'SYSTEM' {
    ensure(Object.hasOwn(actionRoles, action), 400, 'INVALID_INPUT', '请提交允许的订单动作');
    return actionRoles[action as OrderAction];
}

export function nextOrderState(current: string, action: string): OrderStatus {
    ensure(Object.hasOwn(ORDER_TRANSITIONS, current), 409, 'INVALID_ORDER_STATE', '订单状态无效');
    const normalizedAction = validateOrderAction(action);
    const next = ORDER_TRANSITIONS[current as OrderStatus][normalizedAction];
    ensure(next, 409, 'INVALID_ORDER_STATE', '当前订单状态不允许此操作');
    return next;
}

export function validateEvaluation(body: Record<string, unknown>): { stars: number; content: string } {
    ensure(typeof body.stars === 'number' && Number.isSafeInteger(body.stars) && body.stars >= 1 && body.stars <= 5, 400, 'INVALID_INPUT', '评价星级应为1～5的整数');
    const content = body.content === undefined || body.content === null ? '' : text(body.content, '评价内容', 0, 500);
    return { stars: body.stars, content };
}

export function creditDeltaForStars(stars: number): number {
    ensure(Number.isSafeInteger(stars) && stars >= 1 && stars <= 5, 400, 'INVALID_INPUT', '评价星级应为1～5的整数');
    return CREDIT_RULES.stars[stars as keyof typeof CREDIT_RULES.stars];
}

export function validateCreditEvent(eventType: string): CreditEventType {
    ensure(['COMPLETED', 'EVALUATION', 'REPORT', 'FRAUD'].includes(eventType), 400, 'INVALID_INPUT', '信誉事件类型无效');
    return eventType as CreditEventType;
}
