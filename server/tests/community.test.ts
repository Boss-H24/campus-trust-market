import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ruleValue, cursor, pagination } from '../community/rules.ts';

function pageHarness(name: string, request: (path: string, options?: any) => Promise<any>, wxOverrides: Record<string, unknown> = {}) {
    let definition: any, nextTimer = 0;
    const timers = new Map<number, { callback: () => unknown; delay: number }>();
    const storage: Record<string, unknown> = { token: 'buyer-session-token' };
    const api = { request, decorate: async (item: unknown) => item, error: (page: any, error: Error) => page.setData({ error: error.message }) };
    const wx = { getStorageSync: (key: string) => storage[key], showToast() {}, ...wxOverrides };
    vm.runInNewContext(readFileSync('miniprogram/pages/' + name + '/' + name + '.js', 'utf8'), {
        Page: (value: any) => definition = value, require: () => api, wx, Set, Promise,
        setTimeout: (callback: () => unknown, delay: number) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
        clearTimeout: (id: number) => timers.delete(id)
    });
    const page = { ...definition, data: structuredClone(definition.data), setData(patch: Record<string, unknown>) { Object.assign(this.data, patch); } };
    return { page, timers, storage };
}

test('C规则：配置边界、未知键、bigint游标及恶意分页输入', () => {
    assert.equal(ruleValue('publish_min_credit', 100), 100);
    assert.deepEqual(ruleValue('blocked_keywords', ['测试', '测试']), ['测试']);
    for (const [key, value] of [['publish_min_credit', 101], ['messages_per_minute', 0], ['messages_per_minute', '2'], ['unknown', 10], ['blocked_keywords', ['']]] as const) assert.throws(() => ruleValue(key, value));
    assert.equal(cursor('9007199254740993'), '9007199254740993');
    for (const value of ['-1', ['1'], '1 OR 1=1', '01']) assert.throws(() => cursor(value));
    assert.throws(() => pagination({ pageSize: '1; DROP TABLE report' }));
});

test('C聊天：前台每3秒轮询，50条续页立即读取，隐藏/退出取消定时器', async () => {
    let calls = 0;
    const { page, timers } = pageHarness('chat', async path => path === '/api/users/me' ? { id: 'buyer' } : (++calls, { items: [{ id: String(calls), senderId: 'seller', content: '回复' }], nextAfterId: String(calls), hasMore: calls === 1 }));
    page.onLoad({ id: '88' }); await page.onShow();
    assert.equal(timers.size, 1); assert.equal([...timers.values()][0].delay, 0);
    const timer = [...timers.entries()][0]; timers.delete(timer[0]); await timer[1].callback();
    assert.equal(page.data.items.length, 2); assert.equal([...timers.values()][0].delay, 3000);
    page.onHide(); assert.equal(timers.size, 0);
    await page.onShow(); assert.equal(timers.size, 1); page.onUnload(); assert.equal(timers.size, 0);
});

test('C聊天：隐藏前在途响应不污染重进页面，切换账号清理消息及草稿', async () => {
    let finish: (value: unknown) => void = () => {};
    const { page, timers, storage } = pageHarness('chat', async path => path === '/api/users/me' ? { id: 'buyer' } : new Promise(resolve => { finish = resolve; }));
    page.onLoad({ id: '88' });
    const showing = page.onShow(); await new Promise(resolve => setImmediate(resolve));
    page.onHide(); finish({ items: [{ id: 'private', content: '私有消息' }], nextAfterId: 'private', hasMore: false }); await showing;
    assert.equal(page.data.items.length, 0); assert.equal(timers.size, 0);
    page.setData({ content: '旧账号草稿', items: [{ id: 'old' }] }); storage.token = 'different-account';
    const next = page.onShow(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.data.content, ''); assert.equal(page.data.items.length, 0);
    page.onHide(); finish({ items: [], nextAfterId: '0', hasMore: false }); await next;
});

test('C聊天：响应丢失重发沿用消息幂等键，发送不推进增量游标', async () => {
    const sent: any[] = [];
    const { page } = pageHarness('chat', async (path, options) => {
        sent.push(structuredClone(options.data)); if (sent.length === 1) throw new Error('网络中断'); return { id: '99' };
    });
    page.onLoad({ id: '88' }); page.active = true; page.generation = 1; page.setData({ content: '咨询内容' });
    await page.send(); assert.equal(page.data.content, '咨询内容');
    await page.send(); assert.equal(sent[0].clientMessageId, sent[1].clientMessageId); assert.equal(page.data.content, ''); assert.equal(page.afterId, '0');
});

test('C监管：保留A审核版本，409后刷新列表，失败提示仍可见', async () => {
    const requests: any[] = [];
    const { page } = pageHarness('admin', async (path, options) => {
        requests.push({ path, ...options });
        if (path.endsWith('/audit')) throw new Error('商品内容已更新，请刷新后重新审核');
        if (path === '/api/users/me') return { id: 'admin', role: 'ADMIN' };
        return { items: [{ id: '1', version: 4 }], total: 1 };
    });
    page.setData({ mode: 'products' }); await page.sendAudit('1', 'APPROVE', '', 3);
    assert.equal(requests[0].data.expectedVersion, 3); assert.equal(page.data.items[0].version, 4);
    assert.match(page.data.error, /已刷新/); assert.equal(page.data.busy, false);
});

test('C列表：切换模式丢弃旧请求结果，翻页不重复第一页', async () => {
    let finish: (value: unknown) => void = () => {};
    const requests: string[] = [];
    const { page } = pageHarness('community', async path => {
        requests.push(path);
        if (path.includes('conversations')) return new Promise(resolve => { finish = resolve; });
        return { items: [{ id: path.includes('page=2') ? '2' : '1', status: 'PENDING' }], total: 2 };
    });
    const old = page.load(true); await page.choose({ currentTarget: { dataset: { mode: 'reports' } } });
    finish({ items: [{ id: 'private-old-chat' }], total: 1 }); await old;
    assert.equal(page.data.items[0].id, '1'); await page.onReachBottom();
    assert.equal(page.data.items.length, 2); assert.ok(requests.includes('/api/reports?page=2'));
});

test('C平台规则：英文关键词完整保留，空数值不会意外设置为0', async () => {
    let input = 'normal, 新关键词', sent: any;
    const { page } = pageHarness('admin', async () => ({}), { showModal: (options: any) => options.success({ confirm: true, content: input }) });
    page.setData({ items: [{ key: 'blocked_keywords', valueText: '', version: 2 }] });
    page.mutate = async (path: string, method: string, body: unknown) => { sent = body; };
    await page.editRule({ currentTarget: { dataset: { key: 'blocked_keywords' } } });
    assert.deepEqual(Array.from(sent.value), ['normal', '新关键词']);
    input = ''; sent = undefined; page.setData({ items: [{ key: 'publish_min_credit', valueText: '60', version: 1 }] });
    await page.editRule({ currentTarget: { dataset: { key: 'publish_min_credit' } } });
    assert.equal(sent, undefined); assert.match(page.data.error, /请输入/);
});
