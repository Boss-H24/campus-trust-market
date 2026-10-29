import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPool, transaction } from '../db/database.ts';
import { migrate } from '../db/migrate.ts';
import { seed } from '../db/seed.ts';
import { getConfig } from '../config.ts';
import { createApp } from '../app.ts';
import { CreditService } from '../orders/credit-service.ts';
import type { Server } from 'node:http';
const config = getConfig();
// 外部微信平台单列联调，自动化业务测试不使用本机真实AppSecret。
config.wechatAppId = '';
config.wechatAppSecret = '';
assert.match(process.env.TEST_DB_NAME || '', /^[a-zA-Z0-9_]+_test$/);
config.database = process.env.TEST_DB_NAME!;
const pool = createPool(config);
let server: Server, base: string, uploadDir: string, testRoot: string;
const tokens: Record<string, string> = {};
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
async function api(path: string, options: {
    method?: string;
    token?: string;
    body?: unknown;
} = {}) {
    const response = await fetch(base + path, { method: options.method || 'GET', headers: { ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    const data = await response.json();
    return { status: response.status, ...data };
}
async function login(account: string) {
    const result = await api('/api/auth/dev-login', { method: 'POST', body: { account, password: config.demoPassword } });
    assert.equal(result.status, 200);
    tokens[account] = result.data.token;
    return result.data.user;
}
async function upload(token = tokens.seller) {
    const response = await api('/api/uploads', { method: 'POST', token, body: { base64: png, contentType: 'image/png' } });
    assert.equal(response.status, 201);
    return response.data.id as string;
}
async function auditProduct(pid: string, action: string, reason = '') {
    const current = await api('/api/products/' + pid, { token: tokens.admin });
    return api(`/api/products/${pid}/audit`, { method: 'POST', token: tokens.admin, body: { action, reason, expectedVersion: current.data.version } });
}
async function auditCertification(cid: string, action: string, reason = '') {
    const queue = await api('/api/admin/certifications', { token: tokens.admin });
    const current = queue.data.items.find((entry: any) => entry.certificationId === cid);
    return api(`/api/admin/certifications/${cid}/audit`, { method: 'POST', token: tokens.admin, body: { action, reason, expectedVersion: current?.version ?? 0 } });
}
const product = (imageId: string, title = '全新测试教材') => ({ title, description: '干净整洁，校内交接', priceCents: 2500, categoryId: '1', condition: 'GOOD', imageIds: [imageId] });
before(async () => {
    testRoot = await mkdtemp(join(tmpdir(), 'campus-market-test-'));
    // 与默认部署的 .runtime/uploads 一致，覆盖隐藏目录中的媒体读取。
    uploadDir = join(testRoot, '.runtime', 'uploads');
    config.uploadDir = uploadDir;
    await migrate(pool);
    // 只重置明确命名的独立测试库；演示库与组员数据库不能进入此路径。
    assert.equal(config.database, process.env.DB_NAME + '_test');
    const reset = await pool.getConnection();
    try {
        await reset.query('SET FOREIGN_KEY_CHECKS=0');
        const [tableRows] = await reset.query<any[]>('SHOW TABLES');
        const existingTables = new Set(tableRows.map(row => Object.values(row)[0]));
        for (const table of ['credit_event', 'evaluation', 'order_status_log', 'orders', 'operation_log', 'product_image', 'product', 'upload_asset', 'user_certification', 'student_roster', 'auth_session', 'app_user', 'category'])
            if (existingTables.has(table))
                await reset.query(`TRUNCATE TABLE ${table}`);
    }
    finally {
        await reset.query('SET FOREIGN_KEY_CHECKS=1');
        reset.release();
    }
    await seed(pool, config);
    server = createApp(config, pool).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    base = `http://127.0.0.1:${address.port}`;
    for (const account of ['seller', 'buyer', 'admin', 'newstudent', 'outsider'])
        await login(account);
});
after(async () => { if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
} await pool.end(); if (testRoot)
    await rm(testRoot, { recursive: true, force: true }); });
test('DB-B：订单迁移具有有效订单、评价和信誉事件唯一约束', async () => {
    const [tables] = await pool.query<any[]>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('orders','order_status_log','evaluation','credit_event')"
    );
    assert.equal(tables.length, 4);
    const [indexes] = await pool.query<any[]>(
        "SELECT DISTINCT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN ('orders','evaluation','credit_event')"
    );
    const names = indexes.map(row => row.index_name || row.INDEX_NAME);
    assert.ok(names.includes('uq_orders_active_product'));
    assert.ok(names.includes('uq_evaluation_reviewer'));
    assert.ok(names.includes('uq_credit_event'));
});
test('CREDIT-B：同一信誉事件只计分一次并限制在0到100', async () => {
    const [user] = await pool.query<any[]>("SELECT id,credit_score FROM app_user WHERE demo_account='buyer'");
    const userId = String(user[0].id);
    const initial = Number(user[0].credit_score);
    const credit = new CreditService();
    try {
        const first = await transaction(pool, db => credit.applyEvent(db, { userId, eventType: 'REPORT', sourceId: 'report-test-1', delta: -5 }));
        const duplicate = await transaction(pool, db => credit.applyEvent(db, { userId, eventType: 'REPORT', sourceId: 'report-test-1', delta: -5 }));
        assert.equal(first.applied, true);
        assert.equal(first.creditScore, initial - 5);
        assert.equal(duplicate.applied, false);
        assert.equal(duplicate.creditScore, initial - 5);
        const upper = await transaction(pool, db => credit.applyEvent(db, { userId, eventType: 'COMPLETED', sourceId: 'upper', delta: 999 }));
        const lower = await transaction(pool, db => credit.applyEvent(db, { userId, eventType: 'FRAUD', sourceId: 'lower', delta: -999 }));
        assert.equal(upper.applied, true);
        assert.equal(upper.creditScore, 100);
        assert.equal(lower.applied, true);
        assert.equal(lower.creditScore, 0);
    }
    finally {
        await pool.execute('UPDATE app_user SET credit_score=? WHERE id=?', [initial, userId]);
        await pool.execute('DELETE FROM credit_event WHERE user_id=?', [userId]);
    }
});
test('TC-USER：真实数据库健康检查、登录失败、令牌过期及注销', async () => {
    const health = await api('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.wechatLoginEnabled, false, '未配置微信密钥时不应提供可用微信登录入口');
    config.wechatAppId = 'wx-test-config'; config.wechatAppSecret = 'test-config-secret';
    try {
        const configured = await api('/api/health');
        assert.equal(configured.data.wechatLoginEnabled, true);
        assert.equal(JSON.stringify(configured.data).includes('test-config-secret'), false);
    } finally { config.wechatAppId = ''; config.wechatAppSecret = ''; }
    assert.equal((await api('/api/users/me')).status, 401);
    assert.equal((await api('/api/auth/dev-login', { method: 'POST', body: { account: 'admin', password: 'wrong' } })).status, 401);
    assert.equal((await api('/api/users/me', { token: 'random' })).status, 401);
    await login('outsider');
    const old = tokens.outsider;
    assert.equal((await api('/api/auth/logout', { method: 'POST', token: old })).status, 200);
    assert.equal((await api('/api/users/me', { token: old })).status, 401);
    await login('outsider');
    await pool.execute('UPDATE auth_session SET expires_at=DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE token_hash=SHA2(?,256)', [tokens.outsider]);
    assert.equal((await api('/api/users/me', { token: tokens.outsider })).status, 401);
    await login('outsider');
    const relogin = await api('/api/auth/dev-login', { method: 'POST', token: 'expired-invalid-session-token', body: { account: 'outsider', password: config.demoPassword } });
    assert.equal(relogin.status, 200, '登录端点不应被旧令牌阻断');
    assert.equal((await api('/api/auth/login', { method: 'POST', body: { code: 'demo' } })).status, 503);
});

test('TC-DEMO：新环境默认展示真实摄影样图，重复初始化不覆盖现有商品', async () => {
    const before = await api('/api/products');
    assert.equal(before.data.items.length, 4);
    const manifest = JSON.parse(await readFile('assets/demo-products/manifest.json', 'utf8'));
    for (const product of before.data.items) {
        assert.match(product.description, /课堂演示样图/);
        const entry = manifest.find((item: any) => item.title === product.title);
        assert.ok(entry);
        const media = await fetch(base + '/api/media/' + product.imageIds[0]);
        assert.equal(media.status, 200);
        assert.match(media.headers.get('content-type')!, /^image\/jpeg/);
        assert.deepEqual(Buffer.from(await media.arrayBuffer()), await readFile(join('assets/demo-products', entry.file)));
    }
    await seed(pool, config);
    assert.deepEqual((await api('/api/products')).data.items, before.data.items);
});
test('TC-CERT：提交、拒绝、重新提交、学籍校验及管理员审核', async () => {
    assert.equal((await api('/api/certifications', { method: 'POST', token: tokens.outsider, body: { realName: '冒充同学', studentId: '2023999999', school: config.schoolName, phone: '13800000005' } })).status, 400);
    const body = { realName: '林同学', studentId: '2023000004', school: config.schoolName, phone: '13800000004' };
    const result = await api('/api/certifications', { method: 'POST', token: tokens.newstudent, body });
    assert.equal(result.status, 201);
    const certificationId = result.data.id;
    assert.equal((await api('/api/admin/certifications', { token: tokens.newstudent })).status, 403);
    assert.equal((await auditCertification(certificationId, 'REJECT', '请核实联系方式')).status, 200);
    assert.equal((await api('/api/certifications', { method: 'POST', token: tokens.newstudent, body })).status, 201);
    assert.equal((await api(`/api/admin/certifications/${certificationId}/audit`, { method: 'POST', token: tokens.admin, body: { action: 'APPROVE', expectedVersion: 0 } })).status, 409, '旧认证审核不能批准重新提交的资料');
    assert.equal((await auditCertification(certificationId, 'APPROVE')).status, 200);
    assert.equal((await api('/api/users/me', { token: tokens.newstudent })).data.certificationStatus, 'VERIFIED');
    assert.equal((await auditCertification(certificationId, 'APPROVE')).status, 409);
});
test('SEC-CERT：学号跨账号抢占被拒绝，敏感字段不以明文存储或返回', async () => {
    const duplicate = await api('/api/certifications', { method: 'POST', token: tokens.outsider, body: { realName: '陈同学', studentId: '2023000001', school: config.schoolName, phone: '13800000009' } });
    assert.equal(duplicate.status, 409);
    const me = await api('/api/users/me', { token: tokens.seller });
    assert.ok(!JSON.stringify(me).includes('13800000001'));
    assert.equal(me.data.maskedPhone, '138****0001');
    const [rows] = await pool.query<any[]>('SELECT real_name_enc,phone_enc,student_id_enc,student_id_hash FROM user_certification LIMIT 1');
    assert.ok(!JSON.stringify(rows).includes('2023000001'));
    assert.ok(!JSON.stringify(rows).includes('13800000001'));
});
test('TC-PRODUCT：图片私有访问、发布审核、检索、编辑重审、下架与重新提交', async () => {
    const imageId = await upload();
    assert.equal((await fetch(base + '/api/media/' + imageId)).status, 404);
    assert.equal((await fetch(base + '/api/media/' + imageId, { headers: { Authorization: `Bearer ${tokens.seller}` } })).status, 200);
    const created = await api('/api/products', { method: 'POST', token: tokens.seller, body: product(imageId) });
    assert.equal(created.status, 201);
    const pid = created.data.id;
    assert.equal((await api('/api/products/' + pid)).status, 404);
    assert.equal((await api('/api/products/' + pid, { token: tokens.buyer })).status, 404);
    assert.equal((await api('/api/products/' + pid, { token: tokens.seller })).data.status, 'PENDING');
    assert.equal((await auditProduct(pid, 'APPROVE')).status, 200);
    assert.equal((await api('/api/products?keyword=测试教材&minPriceCents=0&maxPriceCents=3000')).data.items.some((p: any) => p.id === pid), true);
    assert.equal((await fetch(base + '/api/media/' + imageId)).status, 200);
    const details = await api('/api/products/' + pid);
    assert.equal(details.data.seller.maskedPhone, '138****0001');
    assert.equal(details.data.seller.studentId, undefined);
    assert.equal((await api('/api/products/' + pid, { method: 'PUT', token: tokens.seller, body: { ...product(imageId), description: '补充商品详情' } })).data.status, 'PENDING');
    assert.equal((await api(`/api/products/${pid}/audit`, { method: 'POST', token: tokens.admin, body: { action: 'APPROVE', expectedVersion: 0 } })).status, 409, '旧商品审核不能批准新版本内容');
    assert.equal((await fetch(base + '/api/media/' + imageId)).status, 404);
    assert.equal((await auditProduct(pid, 'REJECT', '照片不清晰')).status, 200);
    assert.equal((await api(`/api/products/${pid}/status`, { method: 'PUT', token: tokens.seller, body: { action: 'SUBMIT' } })).status, 200);
    await auditProduct(pid, 'APPROVE');
    assert.equal((await api(`/api/products/${pid}/status`, { method: 'PUT', token: tokens.seller, body: { action: 'TAKE_DOWN' } })).data.status, 'OFF_SHELF');
});
test('SEC-PRODUCT：未认证、越权、任意目标状态、图片盗用及非法参数', async () => {
    const imageId = await upload();
    assert.equal((await api('/api/products', { method: 'POST', token: tokens.outsider, body: product(imageId, '未认证发布') })).status, 403);
    const created = await api('/api/products', { method: 'POST', token: tokens.seller, body: product(imageId, '权限测试教材') });
    assert.equal(created.status, 201, created.message);
    const pid = created.data.id;
    assert.equal((await api('/api/products/' + pid, { method: 'PUT', token: tokens.buyer, body: product(imageId) })).status, 403);
    assert.equal((await api(`/api/products/${pid}/audit`, { method: 'POST', token: tokens.buyer, body: { action: 'APPROVE' } })).status, 403);
    assert.equal((await api(`/api/products/${pid}/status`, { method: 'PUT', token: tokens.seller, body: { status: 'ON_SALE' } })).status, 400);
    assert.equal((await api('/api/products', { method: 'POST', token: tokens.buyer, body: product(imageId, '盗用图片') })).status, 403);
    for (const patch of [{ priceCents: -1 }, { title: '书' }, { imageIds: [] }, { description: '联系13812345678' }, { description: '枪支' }]) {
        assert.equal((await api('/api/products', { method: 'POST', token: tokens.seller, body: { ...product(imageId), ...patch } })).status, 400);
    }
    const injection = await api('/api/products?keyword=' + encodeURIComponent("' OR 1=1; DROP TABLE product;--"));
    assert.equal(injection.status, 200);
    assert.equal(injection.data.items.length, 0);
    assert.equal((await api('/api/products/1%20OR%201=1')).status, 400);
    assert.equal((await api('/api/products?page=-1')).status, 400);
    assert.equal((await api('/api/products?scope=mine')).status, 401);
    assert.equal((await api('/api/uploads', { method: 'POST', token: tokens.seller, body: { base64: Buffer.from('<script>').toString('base64'), contentType: 'image/png' } })).status, 400);
});
test('CONC-PRODUCT：相同商品并发发布只成功一次，失败事务不留下孤立商品', async () => {
    const imageIds = await Promise.all([upload(tokens.buyer), upload(tokens.buyer)]);
    const results = await Promise.all(imageIds.map(imageId => api('/api/products', { method: 'POST', token: tokens.buyer, body: product(imageId, '并发发布教材') })));
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
    const [rows] = await pool.query<any[]>('SELECT COUNT(*) AS n FROM product WHERE title=?', ['并发发布教材']);
    assert.equal(Number(rows[0].n), 1);
    const [logs] = await pool.query<any[]>('SELECT details FROM operation_log');
    assert.ok(!JSON.stringify(logs).includes('13800000001'));
});
test('SEC-STATE：锁定商品不能编辑；禁用账号与低信誉不能发布', async () => {
    const imageId = await upload();
    const created = await api('/api/products', { method: 'POST', token: tokens.seller, body: product(imageId, '锁定测试教材') });
    assert.equal(created.status, 201, created.message);
    const pid = created.data.id;
    await pool.execute("UPDATE product SET status='LOCKED' WHERE id=?", [pid]);
    assert.equal((await api('/api/products/' + pid, { method: 'PUT', token: tokens.seller, body: product(imageId) })).status, 409);
    await pool.execute("UPDATE app_user SET status='DISABLED' WHERE demo_account='outsider'");
    assert.equal((await api('/api/users/me', { token: tokens.outsider })).status, 403);
    await pool.execute("UPDATE app_user SET credit_score=30 WHERE demo_account='newstudent'");
    const theirImage = await upload(tokens.newstudent);
    assert.equal((await api('/api/products', { method: 'POST', token: tokens.newstudent, body: product(theirImage, '低信誉商品') })).status, 403);
});
test('SEC-RATE：发布频率限制返回429；错误响应不泄露栈或SQL', async () => {
    const imageId = await upload(tokens.buyer);
    let limited = false;
    for (let i = 0; i < 12; i++) {
        const result = await api('/api/products', { method: 'POST', token: tokens.buyer, body: product(imageId, '频率测试' + i) });
        if (result.status === 429) {
            limited = true;
            assert.equal(result.code, 'RATE_LIMITED');
            break;
        }
    }
    assert.equal(limited, true);
    const response = await api('/api/not-found');
    assert.equal(response.status, 404);
    assert.ok(response.requestId);
    assert.equal(response.stack, undefined);
});
