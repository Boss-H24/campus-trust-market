import test from 'node:test';
import assert from 'node:assert/strict';
import {
    actionActor,
    creditDeltaForStars,
    nextOrderState,
    validateEvaluation,
    validateOrderNo,
    validateRequestId
} from '../orders/rules.ts';

test('订单规则：动作角色和状态唯一映射', () => {
    assert.equal(actionActor('PAY'), 'BUYER');
    assert.equal(actionActor('ACCEPT'), 'SELLER');
    assert.equal(actionActor('RESOLVE_REFUND'), 'ADMIN');
    assert.equal(actionActor('EXPIRE'), 'SYSTEM');
    assert.equal(nextOrderState('PENDING_PAYMENT', 'PAY'), 'PAID');
    assert.equal(nextOrderState('REFUNDING', 'REFUND_SUCCEEDED'), 'CANCELLED');
    assert.throws(() => nextOrderState('PAID', 'CONFIRM'));
});

test('订单规则：请求编号与订单号边界', () => {
    assert.equal(validateRequestId('req_12345678'), 'req_12345678');
    assert.throws(() => validateRequestId('short'));
    assert.throws(() => validateRequestId('req with spaces'));
    assert.match(validateOrderNo('CM20261029120000ABCDEFGH'), /^CM/);
    assert.throws(() => validateOrderNo('ORDER-1'));
});

test('评价与信誉：星级、正文和边界分值', () => {
    assert.deepEqual(validateEvaluation({ stars: 5, content: ' 交易顺利 ' }), { stars: 5, content: '交易顺利' });
    assert.deepEqual(validateEvaluation({ stars: 3 }), { stars: 3, content: '' });
    assert.throws(() => validateEvaluation({ stars: 0 }));
    assert.throws(() => validateEvaluation({ stars: 4.5 }));
    assert.throws(() => validateEvaluation({ stars: 5, content: '好'.repeat(501) }));
    assert.equal(creditDeltaForStars(1), -3);
    assert.equal(creditDeltaForStars(3), 0);
    assert.equal(creditDeltaForStars(5), 2);
});
