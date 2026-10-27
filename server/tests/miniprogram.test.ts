import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function homePage() {
    let definition: any;
    const requests: URL[] = [];
    const api = { request: async (path: string) => { requests.push(new URL(path, 'http://localhost')); return { items: [], total: 0, page: 1 }; }, error: (page: any, error: Error) => page.setData({ error: error.message }) };
    vm.runInNewContext(readFileSync('miniprogram/pages/home/home.js', 'utf8'), { Page: (value: any) => { definition = value; }, require: (name: string) => name.endsWith('/api') ? api : load('miniprogram/utils/format.js'), wx: { stopPullDownRefresh() {} } });
    const page = { ...definition, data: { ...definition.data, categories: [{ id: '77', name: '教材资料' }, { id: '88', name: '生活用品' }] }, setData(patch: Record<string, unknown>) { Object.assign(this.data, patch); } };
    return { page, requests };
}

test('首页导购：价格和分类入口发起真实筛选参数，切换入口清除旧条件', async () => {
    const { page, requests } = homePage();
    page.data.keyword = '键盘';
    await page.chooseDeal({ currentTarget: { dataset: { deal: 'budget' } } });
    assert.equal(requests.at(-1)!.searchParams.get('maxPriceCents'), '5000');
    assert.equal(requests.at(-1)!.searchParams.has('keyword'), false);
    await page.chooseDeal({ currentTarget: { dataset: { deal: 'books' } } });
    assert.equal(requests.at(-1)!.searchParams.get('categoryId'), '77');
    assert.equal(requests.at(-1)!.searchParams.has('maxPriceCents'), false);
    await page.chooseDeal({ currentTarget: { dataset: { deal: 'dorm' } } });
    assert.equal(requests.at(-1)!.searchParams.get('categoryId'), '88');
    page.data.categories = [];
    const count = requests.length;
    await page.chooseDeal({ currentTarget: { dataset: { deal: 'books' } } });
    assert.equal(requests.length, count);
    assert.match(page.data.error, /分类/);
});

test('首页筛选：手动价格编辑取消快捷标签，重置恢复全部商品', async () => {
    const { page, requests } = homePage();
    await page.chooseDeal({ currentTarget: { dataset: { deal: 'budget' } } });
    page.input({ currentTarget: { dataset: { field: 'maxPrice' } }, detail: { value: '35.50' } });
    assert.equal(page.data.activeDeal, '');
    await page.load(true);
    assert.equal(requests.at(-1)!.searchParams.get('maxPriceCents'), '3550');
    await page.resetFilters();
    for (const name of ['categoryId', 'keyword', 'minPriceCents', 'maxPriceCents']) assert.equal(requests.at(-1)!.searchParams.has(name), false);
    assert.equal(page.data.hasFilters, false);
});
function load(file: string, wx: Record<string, unknown> = {}) { const module = { exports: {} }; const context = vm.createContext({ module, exports: module.exports, wx, require: (name: string) => name === '../config' ? { baseUrl: 'http://127.0.0.1:3000' } : load('miniprogram/utils/format.js'), Promise, Error, console, setTimeout }); vm.runInContext(readFileSync(file, 'utf8'), context); return module.exports as any; }
test('小程序金额：分与元转换准确，拒绝负数、超两位小数与非数字', () => { const format = load('miniprogram/utils/format.js'); assert.equal(format.toCents('0'), 0); assert.equal(format.toCents('12.30'), 1230); assert.equal(format.money(1230), '12.30'); for (const value of ['-1', '1.001', 'abc', '1e2'])
    assert.throws(() => format.toCents(value)); });
test('小程序请求：401清理过期登录，错误传递给页面并仅结束一次loading', async () => { let cleared = 0, hidden = 0; const api = load('miniprogram/utils/api.js', { getStorageSync: () => 'expired-token', request: (options: any) => { options.success({ statusCode: 401, data: { code: 'UNAUTHORIZED', message: '登录已失效' } }); if (options.complete)
        options.complete(); }, removeStorageSync: () => cleared++, hideLoading: () => hidden++, showLoading: () => { } }); await assert.rejects(() => api.request('/api/users/me'), /登录已失效/); assert.equal(cleared, 2); assert.equal(hidden, 1); });
test('小程序图片：通过认证请求下载私有图片，不将令牌拼入URL', async () => { let checked = false; const api = load('miniprogram/utils/api.js', { getStorageSync: () => 'private-token', downloadFile: (options: any) => { assert.equal(options.header.Authorization, 'Bearer private-token'); assert.ok(!options.url.includes('private-token')); checked = true; options.success({ statusCode: 200, tempFilePath: '/tmp/image.png' }); } }); assert.equal(await api.imagePath('1'), '/tmp/image.png'); assert.equal(checked, true); });
test('小程序页面：切换账号和退出后清除上一用户私有草稿', async () => {
    let definition: any;
    const storage: Record<string, any> = { token: 'buyer-token', editingProductId: { id: 'seller-private-product', userId: 'seller-id' } };
    const api = { request: async (path: string) => path === '/api/users/me' ? { id: 'buyer-id', certificationStatus: 'VERIFIED' } : path === '/api/categories' ? { items: [{ id: '1', name: '教材' }] } : { id: 'seller-private-product', title: '卖家私有草稿', description: '私有描述', priceCents: 1000, categoryId: '1', condition: 'GOOD', imageIds: ['asset'] }, imagePath: async () => '/tmp/seller-private-image', error: () => { } };
    vm.runInNewContext(readFileSync('miniprogram/pages/publish/publish.js', 'utf8'), { Page: (value: any) => definition = value, require: (name: string) => name.endsWith('/api') ? api : { money: (n: number) => (n / 100).toFixed(2) }, wx: { getStorageSync: (key: string) => storage[key], removeStorageSync: (key: string) => delete storage[key] } });
    const page = { ...definition, data: { ...definition.data, id: 'seller-private-product', title: '卖家私有草稿', images: [{ id: 'asset', path: '/tmp/seller-private-image' }] }, draftToken: 'seller-token', setData(patch: Record<string, unknown>) { Object.assign(this.data, patch); } };
    await page.onShow();
    assert.equal(page.data.user.id, 'buyer-id');
    assert.equal(page.data.id, '');
    assert.equal(page.data.title, '');
    assert.equal(page.data.images.length, 0);
    delete storage.token;
    storage.editingProductId = { id: 'other', userId: 'buyer-id' };
    await page.onShow();
    assert.equal(page.data.user, null);
    assert.equal(page.data.images.length, 0);
    assert.equal(storage.editingProductId, undefined);
});
