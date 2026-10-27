import test from 'node:test';
import assert from 'node:assert/strict';
import { maskName, maskPhone, maskStudentId, PrivacyService } from '../common/privacy.ts';
import { validateProduct, normalizeTitle, nextProductState, validateImage, checkContent } from '../products/rules.ts';
import { ORDER_TRANSITIONS } from '../contracts.ts';
test('隐私：姓名、手机号和学号脱敏，短字符串不泄露', () => {
    assert.equal(maskName('王小明'), '王**');
    assert.equal(maskName('张'), '*');
    assert.equal(maskPhone('13812345678'), '138****5678');
    assert.equal(maskPhone('123'), '***');
    assert.equal(maskStudentId('2023010101'), '2023****01');
    assert.equal(maskStudentId('12'), '**');
});
test('加密：随机 IV、可还原、篡改拒绝；索引独立且稳定', () => {
    const privacy = new PrivacyService('11'.repeat(32), '22'.repeat(32));
    const first = privacy.encrypt('13812345678');
    assert.notEqual(first, privacy.encrypt('13812345678'));
    assert.equal(privacy.decrypt(first), '13812345678');
    assert.ok(!first.includes('13812345678'));
    assert.throws(() => privacy.decrypt(first.slice(0, -4) + 'AAAA'));
    assert.equal(privacy.identityHash('学校', '20230001'), privacy.identityHash('学校', '20230001'));
    assert.notEqual(privacy.identityHash('学校', '20230001'), privacy.identityHash('另校', '20230001'));
    assert.throws(() => new PrivacyService('bad', 'bad'));
});
test('商品：标题边界、零元商品、整数分、图片与描述校验', () => {
    const good = { title: '教材', description: '干净整洁', priceCents: 0, categoryId: '1', condition: 'GOOD', imageIds: ['1'] };
    assert.equal(validateProduct(good).priceCents, 0);
    assert.equal(validateProduct({ ...good, title: '书'.repeat(50) }).title.length, 50);
    for (const patch of [{ title: '书' }, { title: '书'.repeat(51) }, { priceCents: -1 }, { priceCents: 0.5 }, { priceCents: '10' }, { description: '' }, { imageIds: [] }, { imageIds: ['1', '1'] }, { categoryId: '1 OR 1=1' }, { condition: 'FAKE' }]) {
        assert.throws(() => validateProduct({ ...good, ...patch }));
    }
});
test('内容规则：全角归一化、联系方式与违禁词拦截', () => {
    assert.equal(normalizeTitle(' ＡＢＣ   教材 '), 'abc 教材');
    assert.throws(() => checkContent('联系 13812345678'));
    assert.throws(() => checkContent('微信：abc123'));
    assert.throws(() => checkContent('出售枪支'));
    assert.doesNotThrow(() => checkContent('高等数学教材，九成新'));
});
test('商品动作：编辑重审、审核驳回、下架再提交，锁定售出禁止卖家变更', () => {
    assert.equal(nextProductState('ON_SALE', 'EDIT'), 'PENDING');
    assert.equal(nextProductState('PENDING', 'APPROVE'), 'ON_SALE');
    assert.equal(nextProductState('PENDING', 'REJECT'), 'REJECTED');
    assert.equal(nextProductState('ON_SALE', 'TAKE_DOWN'), 'OFF_SHELF');
    assert.equal(nextProductState('OFF_SHELF', 'SUBMIT'), 'PENDING');
    for (const state of ['LOCKED', 'SOLD', 'FROZEN'])
        assert.throws(() => nextProductState(state, 'EDIT'));
    assert.throws(() => nextProductState('PENDING', 'TAKE_DOWN'));
    assert.throws(() => nextProductState('ON_SALE', 'APPROVE'));
});
test('图片：内容类型和文件签名一致，拒绝伪装与超限', () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
    assert.equal(validateImage(png.toString('base64'), 'image/png').extension, 'png');
    assert.throws(() => validateImage(png.toString('base64'), 'image/jpeg'));
    assert.throws(() => validateImage(Buffer.from('<script>').toString('base64'), 'image/png'));
    assert.throws(() => validateImage(Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64'), 'image/png'));
    assert.throws(() => validateImage('not base64', 'image/png'));
});
test('订单契约：有付款的取消经过退款；未付款不能直接完成', () => {
    assert.equal(ORDER_TRANSITIONS.PAID.REQUEST_REFUND, 'REFUNDING');
    assert.equal(ORDER_TRANSITIONS.PENDING_DELIVERY.REJECT, 'REFUNDING');
    assert.equal(ORDER_TRANSITIONS.REFUNDING.REFUND_SUCCEEDED, 'CANCELLED');
    assert.equal(ORDER_TRANSITIONS.PENDING_PAYMENT.CONFIRM, undefined);
});
