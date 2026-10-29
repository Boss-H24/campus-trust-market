import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createPool, rows, run } from '../db/database.ts';
import { migrate } from '../db/migrate.ts';
import { seed } from '../db/seed.ts';
import { getConfig } from '../config.ts';
import { createApp } from '../app.ts';
import { AppError } from '../common/errors.ts';
import type { Actor } from '../contracts.ts';
import type { CreditEventApplier } from '../moderation/credit.ts';

const config = getConfig();
assert.equal(process.env.TEST_DB_NAME, config.database + '_test');
config.database = process.env.TEST_DB_NAME!;
config.wechatAppId = ''; config.wechatAppSecret = '';
const pool = createPool(config), tokens: Record<string, string> = {}, actors: Record<string, Actor> = {};
let server: Server, defaultServer: Server, base: string, defaultBase: string, directory: string;
let productId: string, conversationId: string, secondConversationId: string;
// 仅测试夹具中的信誉适配器。生产C模块不拥有信誉账本，不声称此夹具为B实现。
let failCredit = false;
const ledgerAdapter: CreditEventApplier = async (db, event) => {
    if (failCredit) throw new AppError(503, 'TEST_CREDIT_FAILURE', '测试信誉服务失败');
    const result = await run(db, 'INSERT IGNORE INTO c_test_credit_event(event_type,source_id,user_id,delta) VALUES (?,?,?,?)', [event.eventType, event.sourceId, event.userId, event.delta]);
    if (result.affectedRows) await run(db, 'UPDATE app_user SET credit_score=GREATEST(0,LEAST(100,credit_score+?)) WHERE id=?', [event.delta, event.userId]);
    const [user] = await rows(db, 'SELECT credit_score FROM app_user WHERE id=?', [event.userId]);
    return { applied: result.affectedRows === 1, creditScore: user.credit_score };
};
async function listen(app: ReturnType<typeof createApp>) {
    const instance = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => instance.once('listening', resolve));
    const address = instance.address(); assert.ok(address && typeof address !== 'string');
    return { instance, url: `http://127.0.0.1:${address.port}` };
}
async function api(path: string, account = 'buyer', method = 'GET', body?: unknown, url = base) {
    const response = await fetch(url + path, { method, headers: { ...(tokens[account] ? { Authorization: 'Bearer ' + tokens[account] } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, ...await response.json() };
}
async function login(account: string) {
    const result = await api('/api/auth/dev-login', '', 'POST', { account, password: config.demoPassword });
    assert.equal(result.status, 200, result.message); tokens[account] = result.data.token; actors[account] = result.data.user;
}
async function report(targetId = productId, account = 'buyer', targetType = 'PRODUCT') {
    const result = await api('/api/reports', account, 'POST', { targetType, targetId, reason: '虚假描述', description: '与站内说明不符' });
    assert.equal(result.status, 201, result.message); return result.data;
}
before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'campus-community-test-')); config.uploadDir = join(directory, 'uploads');
    await migrate(pool);
    const db = await pool.getConnection();
    try {
        await db.query('SET FOREIGN_KEY_CHECKS=0');
        for (const table of ['chat_message', 'conversation', 'favorite', 'report', 'operation_log', 'product_image', 'product', 'upload_asset', 'user_certification', 'student_roster', 'auth_session', 'app_user', 'category']) await db.query('TRUNCATE TABLE ' + table);
    } finally { await db.query('SET FOREIGN_KEY_CHECKS=1'); db.release(); }
    await seed(pool, config);
    await run(pool, 'CREATE TABLE IF NOT EXISTS c_test_credit_event(event_type VARCHAR(40),source_id VARCHAR(30),user_id BIGINT UNSIGNED,delta INT,PRIMARY KEY(event_type,source_id,user_id))');
    await run(pool, 'TRUNCATE TABLE c_test_credit_event');
    ({ instance: server, url: base } = await listen(createApp(config, pool, ledgerAdapter)));
    ({ instance: defaultServer, url: defaultBase } = await listen(createApp(config, pool)));
    for (const account of ['seller', 'buyer', 'admin', 'newstudent', 'outsider']) await login(account);
    productId = (await api('/api/products')).data.items[0].id;
});
after(async () => {
    for (const instance of [server, defaultServer]) if (instance) { instance.closeAllConnections(); await new Promise<void>(resolve => instance.close(() => resolve())); }
    await run(pool, 'DROP TABLE IF EXISTS c_test_credit_event');
    await pool.end();
    if (directory) await rm(directory, { recursive: true, force: true });
});

test('C-CHAT：并发创建复用会话、自聊拦截、未认证可咨询、参与者隔离（含管理员）', async () => {
    assert.equal((await api('/api/conversations', '', 'POST', { productId })).status, 401);
    assert.equal((await api('/api/conversations', 'seller', 'POST', { productId })).status, 400);
    const result = await Promise.all([api('/api/conversations', 'buyer', 'POST', { productId }), api('/api/conversations', 'buyer', 'POST', { productId })]);
    assert.ok(result.every(r => r.status === 201)); assert.equal(result[0].data.id, result[1].data.id); conversationId = result[0].data.id;
    const other = await api('/api/conversations', 'newstudent', 'POST', { productId }); assert.equal(other.status, 201); secondConversationId = other.data.id;
    for (const account of ['outsider', 'admin', 'newstudent']) {
        assert.equal((await api(`/api/conversations/${conversationId}/messages`, account)).status, 404);
        assert.equal((await api(`/api/conversations/${conversationId}/messages`, account, 'POST', { clientMessageId: 'foreign', content: '测试消息' })).status, 404);
    }
    assert.equal((await api('/api/conversations', 'outsider')).data.total, 0);
    assert.equal((await api('/api/conversations?page=0')).status, 400);
});

test('C-MESSAGE：并发重试仅留一条、同键异内容冲突、双向回复及内容校验', async () => {
    const path = `/api/conversations/${conversationId}/messages`, body = { clientMessageId: 'same-message', content: '请问商品还在吗？' };
    const result = await Promise.all([api(path, 'buyer', 'POST', body), api(path, 'buyer', 'POST', body)]);
    assert.ok(result.every(r => r.status === 201)); assert.equal(result[0].data.id, result[1].data.id);
    assert.equal((await api(path, 'buyer', 'POST', { ...body, content: '修改正文' })).status, 409);
    assert.equal((await api(path, 'seller', 'POST', { clientMessageId: 'seller-reply', content: '还在，可以校内交接' })).status, 201);
    for (const content of ['', 'a'.repeat(1001), '加微信abc123', '１ ３ ８ １ ２ ３ ４ ５ ６ ７ ８', 'https://example.com', '扫码私下转账', '枪支']) assert.equal((await api(path, 'buyer', 'POST', { clientMessageId: 'bad-' + Math.random().toString(36).slice(2), content })).status, 400, content);
    assert.equal((await api(path + '?afterId=-1')).status, 400);
    const messages = await api(path); assert.equal(messages.data.items.length, 2);
    const tail = await api(path + '?afterId=' + messages.data.nextAfterId); assert.equal(tail.data.items.length, 0);
});

test('C-CURSOR：超过50条分批读取，bigint游标无精度丢失，跨页不重不漏', async () => {
    for (let i = 0; i < 55; i++) await run(pool, 'INSERT INTO chat_message(conversation_id,sender_id,client_message_id,content) VALUES (?,?,?,?)', [conversationId, actors.seller.id, 'fixture-' + i, '分页夹具消息' + i]);
    const first = await api(`/api/conversations/${conversationId}/messages`); assert.equal(first.data.items.length, 50); assert.equal(first.data.hasMore, true);
    const second = await api(`/api/conversations/${conversationId}/messages?afterId=${first.data.nextAfterId}`); assert.equal(second.data.items.length, 7); assert.equal(second.data.hasMore, false);
    assert.equal(new Set([...first.data.items, ...second.data.items].map(item => item.id)).size, 57);
    assert.equal((await api(`/api/conversations/${conversationId}/messages?afterId=9007199254740993`)).data.items.length, 0);
});

test('C-FAVORITE：并发收藏/取消幂等、隔离账号、下架不消失且标记不可用', async () => {
    const path = '/api/favorites/' + productId;
    assert.ok((await Promise.all([api(path, 'buyer', 'PUT'), api(path, 'buyer', 'PUT')])).every(r => r.status === 200));
    assert.equal((await api('/api/favorites')).data.total, 1); assert.equal((await api('/api/favorites', 'seller')).data.total, 0);
    await run(pool, "UPDATE product SET status='OFF_SHELF' WHERE id=?", [productId]);
    assert.equal((await api('/api/favorites')).data.items[0].available, false);
    assert.equal((await api(path, 'buyer', 'PUT')).status, 200);
    for (let i = 0; i < 2; i++) assert.equal((await api(path, 'buyer', 'DELETE')).status, 200);
    assert.equal((await api('/api/favorites')).data.total, 0);
    await run(pool, "UPDATE product SET status='ON_SALE' WHERE id=?", [productId]);
});

test('C-REPORT：重复举报拦截、本人查询、普通用户监管越权、关联凭证授权', async () => {
    const entry = await report();
    assert.equal((await api('/api/reports', 'buyer', 'POST', { targetType: 'PRODUCT', targetId: productId, reason: '重复' })).status, 409);
    assert.equal((await api('/api/reports', 'seller')).data.total, 0);
    assert.equal((await api('/api/reports?reporterId=' + actors.buyer.id, 'outsider')).data.total, 0);
    assert.equal((await api('/api/admin/reports')).status, 403);
    assert.equal((await api('/api/admin/reports/' + entry.id + '/evidence')).status, 403);
    assert.equal((await api('/api/admin/reports/' + entry.id + '/evidence?conversationId=' + conversationId, 'admin')).status, 200);
    assert.equal((await api('/api/admin/reports/' + entry.id + '/evidence?conversationId=' + secondConversationId, 'admin')).status, 403);
    assert.equal((await api('/api/admin/reports/' + entry.id, 'admin', 'PATCH', { action: 'INVESTIGATE', expectedVersion: 0 })).status, 200);
    assert.equal((await api('/api/admin/reports/' + entry.id, 'admin', 'PATCH', { action: 'INVESTIGATE', expectedVersion: 0 })).status, 409);
});

test('C-CREDIT：B服务缺失及抛错均完整回滚；并发成立仅扣分一次；重复处理409', async () => {
    const entry = (await api('/api/reports')).data.items[0], body = { decision: 'UPHELD', action: 'FREEZE_PRODUCT', reason: '核查商品违规' };
    const missing = await api('/api/admin/reports/' + entry.id + '/resolve', 'admin', 'POST', body, defaultBase);
    assert.equal(missing.status, 503); assert.equal(missing.code, 'CREDIT_SERVICE_UNAVAILABLE');
    failCredit = true;
    try { assert.equal((await api('/api/admin/reports/' + entry.id + '/resolve', 'admin', 'POST', body)).status, 503); } finally { failCredit = false; }
    assert.equal((await api('/api/products/' + productId)).data.status, 'ON_SALE');
    assert.equal((await api('/api/reports')).data.items[0].status, 'INVESTIGATING');
    assert.equal((await api('/api/users/me', 'seller')).data.creditScore, 80);
    const results = await Promise.all([api('/api/admin/reports/' + entry.id + '/resolve', 'admin', 'POST', body), api('/api/admin/reports/' + entry.id + '/resolve', 'admin', 'POST', body)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal((await api('/api/users/me', 'seller')).data.creditScore, 75);
    assert.equal(Number((await rows(pool, 'SELECT COUNT(*) AS n FROM c_test_credit_event'))[0].n), 1);
    assert.equal((await api('/api/reports')).data.items[0].status, 'UPHELD');
    assert.equal((await api('/api/admin/reports/' + entry.id, 'admin', 'PATCH', { action: 'CLOSE', expectedVersion: 2 })).status, 200);
});

test('C-FREEZE：卖家/审核不能绕过冻结，独立标志防状态误改，解冻必须版本匹配且回到下架', async () => {
    assert.equal((await api('/api/products/' + productId)).status, 404);
    assert.equal((await api('/api/products/' + productId + '/status', 'seller', 'PUT', { action: 'SUBMIT' })).status, 409);
    const current = (await api('/api/products/' + productId, 'admin')).data;
    assert.equal((await api('/api/products/' + productId + '/audit', 'admin', 'POST', { action: 'APPROVE', expectedVersion: current.version })).status, 409);
    await run(pool, "UPDATE product SET status='OFF_SHELF' WHERE id=?", [productId]);
    assert.equal((await api('/api/products/' + productId + '/status', 'seller', 'PUT', { action: 'SUBMIT' })).status, 409);
    assert.equal((await api('/api/admin/products?moderationFrozen=1', 'admin')).data.items.some((item: any) => item.id === productId), true);
    const path = '/api/admin/products/' + productId + '/moderation';
    assert.equal((await api(path, 'admin', 'POST', { action: 'UNFREEZE', reason: '已整改', expectedVersion: current.version + 1 })).status, 409);
    assert.equal((await api(path, 'admin', 'POST', { action: 'UNFREEZE', reason: '已整改', expectedVersion: current.version })).status, 200);
    assert.equal((await api('/api/products/' + productId, 'seller')).data.status, 'OFF_SHELF');
    assert.equal((await api('/api/products/' + productId + '/status', 'seller', 'PUT', { action: 'SUBMIT' })).status, 200);
});

test('C-ATOMIC：扣分后业务失败也回滚账本及分数；锁定商品保留订单锁并增加监管标志', async () => {
    const products = (await api('/api/products')).data.items, pid = products[0].id;
    const entry = await report(pid);
    await run(pool, "UPDATE product SET status='SOLD' WHERE id=?", [pid]);
    const body = { decision: 'UPHELD', action: 'FREEZE_PRODUCT', reason: '商品违规' };
    assert.equal((await api('/api/admin/reports/' + entry.id + '/resolve', 'admin', 'POST', body)).status, 409);
    assert.equal((await api('/api/users/me', 'seller')).data.creditScore, 75);
    assert.equal(Number((await rows(pool, 'SELECT COUNT(*) AS n FROM c_test_credit_event WHERE source_id=?', [entry.id]))[0].n), 0);
    await run(pool, "UPDATE product SET status='LOCKED' WHERE id=?", [pid]);
    assert.equal((await api('/api/admin/reports/' + entry.id + '/resolve', 'admin', 'POST', body)).status, 200);
    const locked = (await api('/api/products/' + pid, 'admin')).data; assert.equal(locked.status, 'LOCKED'); assert.equal(locked.moderationFrozen, true);
    assert.equal((await api('/api/admin/products/' + pid + '/moderation', 'admin', 'POST', { action: 'UNFREEZE', expectedVersion: locked.version, reason: '已整改' })).status, 200);
    assert.equal((await api('/api/products/' + pid, 'admin')).data.status, 'LOCKED');
});

test('C-ADMIN：账号禁用撤销令牌，恢复不复活旧会话；拒绝role/creditScore赋值', async () => {
    const path = '/api/admin/users/' + actors.outsider.id, original = tokens.outsider;
    assert.equal((await api(path, 'admin', 'PATCH', { action: 'DISABLE', reason: '违规', role: 'ADMIN' })).status, 400);
    assert.equal((await api(path, 'admin', 'PATCH', { action: 'DISABLE', reason: '违规', creditScore: 0 })).status, 400);
    assert.equal((await api(path, 'buyer', 'PATCH', { action: 'DISABLE', reason: '越权' })).status, 403);
    assert.equal((await api(path, 'admin', 'PATCH', { action: 'DISABLE', reason: '违规' })).status, 200);
    assert.equal((await api('/api/users/me', 'outsider')).status, 401);
    assert.equal((await api(path, 'admin', 'PATCH', { action: 'ENABLE', reason: '已整改' })).status, 200);
    assert.equal((await api('/api/users/me', 'outsider')).status, 401);
    await login('outsider'); assert.notEqual(tokens.outsider, original);
    assert.equal((await api('/api/admin/users/' + actors.admin.id, 'admin', 'PATCH', { action: 'DISABLE', reason: '违规' })).status, 403);
});

test('C-RULES：分类停用保留引用；规则版本及动态消息限频，日志脱敏，所有后台接口鉴权', async () => {
    const category = await api('/api/admin/categories', 'admin', 'POST', { name: 'C测试分类' }); assert.equal(category.status, 201);
    assert.equal((await api('/api/admin/categories', 'admin', 'PATCH', { id: '1', name: '教材资料', active: false })).status, 200);
    assert.equal((await api('/api/categories')).data.items.some((item: any) => item.id === '1'), false);
    assert.equal((await rows(pool, 'SELECT COUNT(*) AS n FROM product WHERE category_id=1'))[0].n > 0, true);
    await api('/api/admin/categories', 'admin', 'PATCH', { id: '1', name: '教材资料', active: true });
    const rules = (await api('/api/admin/rules', 'admin')).data.items, limit = rules.find((item: any) => item.key === 'messages_per_minute');
    assert.equal((await api('/api/admin/rules/messages_per_minute', 'admin', 'PATCH', { value: 1, expectedVersion: limit.version })).status, 200);
    assert.equal((await api('/api/admin/rules/messages_per_minute', 'admin', 'PATCH', { value: 0, expectedVersion: limit.version + 1 })).status, 400);
    assert.equal((await api('/api/admin/rules/messages_per_minute', 'admin', 'PATCH', { value: 30, expectedVersion: limit.version })).status, 409);
    assert.equal((await api(`/api/conversations/${conversationId}/messages`, 'buyer', 'POST', { clientMessageId: 'limited', content: '再次咨询' })).status, 429);
    await api('/api/admin/rules/messages_per_minute', 'admin', 'PATCH', { value: 30, expectedVersion: limit.version + 1 });
    await run(pool, 'INSERT INTO operation_log(actor_id,action,target,details) VALUES (?,?,?,?)', [actors.admin.id, 'TEST', 'redaction', JSON.stringify({ phone: '13812345678' })]);
    const logs = await api('/api/admin/logs', 'admin'); assert.equal(JSON.stringify(logs).includes('13812345678'), false);
    for (const path of ['/api/admin/reports', '/api/admin/users', '/api/admin/categories', '/api/admin/rules', '/api/admin/logs']) { assert.equal((await api(path, '')).status, 401); assert.equal((await api(path, 'buyer')).status, 403); }
});

test('C-DECISION：自举报/无效处置被拒绝；驳回不扣分且无需B；成立禁用仅影响违规人', async () => {
    assert.equal((await api('/api/reports', 'seller', 'POST', { targetType: 'PRODUCT', targetId: productId, reason: '自举报' })).status, 400);
    const entry = await report(actors.newstudent.id, 'buyer', 'USER');
    assert.equal((await api('/api/admin/reports/' + entry.id + '/resolve', 'admin', 'POST', { decision: 'REJECTED', action: 'DISABLE_USER', reason: '错误组合' })).status, 400);
    assert.equal((await api('/api/admin/reports/' + entry.id + '/resolve', 'admin', 'POST', { decision: 'UPHELD', action: 'FREEZE_PRODUCT', reason: '用户举报不能处置商品' })).status, 400);
    assert.equal((await api('/api/admin/reports/' + entry.id + '/resolve', 'admin', 'POST', { decision: 'REJECTED', action: 'NONE', reason: '证据不足' }, defaultBase)).status, 200);
    assert.equal((await api('/api/users/me', 'newstudent')).data.creditScore, 80);
    const second = await report(actors.newstudent.id, 'buyer', 'USER');
    assert.equal((await api('/api/admin/reports/' + second.id + '/resolve', 'admin', 'POST', { decision: 'UPHELD', action: 'DISABLE_USER', reason: '核查账号违规' })).status, 200);
    assert.equal((await api('/api/users/me', 'newstudent')).status, 401);
    assert.equal((await api('/api/users/me', 'buyer')).status, 200);
    const [disabled] = await rows(pool, 'SELECT credit_score,status FROM app_user WHERE id=?', [actors.newstudent.id]);
    assert.equal(disabled.status, 'DISABLED'); assert.equal(disabled.credit_score, 75);
    await api('/api/admin/users/' + actors.newstudent.id, 'admin', 'PATCH', { action: 'ENABLE', reason: '已整改' });
});
