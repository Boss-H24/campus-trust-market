export type Role = 'STUDENT' | 'ADMIN';
export type CertificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
export type ProductStatus = 'PENDING' | 'ON_SALE' | 'REJECTED' | 'OFF_SHELF' | 'LOCKED' | 'SOLD' | 'FROZEN';
export type ProductAction = 'EDIT' | 'SUBMIT' | 'TAKE_DOWN' | 'APPROVE' | 'REJECT';
export type OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'PENDING_DELIVERY' | 'IN_PROGRESS' | 'PENDING_CONFIRMATION' | 'COMPLETED' | 'DISPUTED' | 'REFUNDING' | 'CANCELLED';
export type OrderAction = 'PAY' | 'CANCEL' | 'EXPIRE' | 'ACCEPT' | 'REJECT' | 'START_DELIVERY' | 'MARK_DELIVERED' | 'CONFIRM' | 'REQUEST_REFUND' | 'OPEN_DISPUTE' | 'RESOLVE_COMPLETE' | 'RESOLVE_REFUND' | 'REFUND_SUCCEEDED';
export type CreditEventType = 'COMPLETED' | 'EVALUATION' | 'REPORT' | 'FRAUD';
export type ApiResponse<T> = {
    code: string | 0;
    message: string;
    data: T;
    requestId: string;
};
export type Actor = {
    id: string;
    role: Role;
    status: 'ACTIVE' | 'DISABLED';
    certificationStatus: CertificationStatus;
    creditScore: number;
};
// B 实现时必须同时检查操作者、当前状态、订单版本和事务中的商品状态。
export const ORDER_TRANSITIONS: Record<OrderStatus, Partial<Record<OrderAction, OrderStatus>>> = {
    PENDING_PAYMENT: { PAY: 'PAID', CANCEL: 'CANCELLED', EXPIRE: 'CANCELLED' },
    PAID: { ACCEPT: 'PENDING_DELIVERY', REJECT: 'REFUNDING', REQUEST_REFUND: 'REFUNDING' },
    PENDING_DELIVERY: { START_DELIVERY: 'IN_PROGRESS', REJECT: 'REFUNDING', REQUEST_REFUND: 'REFUNDING' },
    IN_PROGRESS: { MARK_DELIVERED: 'PENDING_CONFIRMATION', OPEN_DISPUTE: 'DISPUTED' },
    PENDING_CONFIRMATION: { CONFIRM: 'COMPLETED', OPEN_DISPUTE: 'DISPUTED' },
    DISPUTED: { RESOLVE_COMPLETE: 'COMPLETED', RESOLVE_REFUND: 'REFUNDING' },
    REFUNDING: { REFUND_SUCCEEDED: 'CANCELLED' }, COMPLETED: {}, CANCELLED: {}
};
export const CREDIT_RULES = { initial: 80, minimum: 0, maximum: 100, completed: 1, stars: { 1: -3, 2: -1, 3: 0, 4: 1, 5: 2 }, report: -5, fraud: -10 } as const;
