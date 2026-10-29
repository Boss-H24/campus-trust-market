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
test('订单工具：请求编号唯一且订单状态有中文标签', () => {
    const api = load('miniprogram/utils/api.js', {
        getStorageSync: () => '',
        request: () => { },
        removeStorageSync: () => { },
        hideLoading: () => { },
        showLoading: () => { }
    });
    const first = api.requestId();
    const second = api.requestId();
    assert.match(first, /^[A-Za-z0-9_-]{16,64}$/);
    assert.notEqual(first, second);
    const format = load('miniprogram/utils/format.js');
    assert.equal(format.status('PENDING_PAYMENT'), '待付款');
    assert.equal(format.status('PENDING_CONFIRMATION'), '待确认');
    assert.equal(format.status('REFUNDING'), '退款中');
});

function pageDefinition(file: string, api: any, wx: Record<string, any> = {}, format?: any) {
    let definition: any;
    const context = vm.createContext({
        Page: (value: any) => { definition = value; },
        require: (name: string) => name.endsWith('/api') ? api : name.endsWith('/format') ? (format || load('miniprogram/utils/format.js')) : {},
        wx, Promise, Error, console, setTimeout, Date, Math
    });
    vm.runInContext(readFileSync(file, 'utf8'), context);
    return {
        ...definition,
        setData(patch: Record<string, unknown>) { Object.assign(this.data, patch); },
        data: { ...definition.data }
    };
}

test('订单页面：买家卖家切换使用服务端分页与订单动作', async () => {
    const requests: any[] = [];
    const api = {
        request: async (path: string, options?: any) => {
            requests.push({ path, options });
            if (path.startsWith('/api/orders?'))
                return { items: [], total: 0, page: 1, pageSize: 20 };
            return { orderNo: 'CM20261029120000ABCDEFGH', version: 0, status: 'PAID' };
        },
        requestId: () => 'request-order-0001',
        error: (page: any, error: Error) => page.setData({ error: error.message })
    };
    const page = pageDefinition('miniprogram/pages/orders/orders.js', api, { stopPullDownRefresh() { } });
    page.data.side = 'buyer';
    await page.load(true);
    assert.equal(requests.at(-1).path, '/api/orders?side=buyer&page=1');
    await page.chooseSide({ currentTarget: { dataset: { side: 'seller' } } });
    assert.equal(page.data.side, 'seller');
    assert.equal(requests.at(-1).path, '/api/orders?side=seller&page=1');

    const detail = pageDefinition('miniprogram/pages/order-detail/order-detail.js', api, {
        navigateTo() { }
    });
    detail.orderNo = 'CM20261029120000ABCDEFGH';
    detail.data.actions = [{ action: 'PAY', label: '模拟支付' }];
    detail.data.order = { version: 0 };
    await detail.action({ currentTarget: { dataset: { action: 'PAY' } } });
    const paid = requests.find(request => request.path.endsWith('/pay'));
    assert.equal(paid.options.method, 'POST');
    assert.equal(paid.options.data.version, 0);
    assert.equal(paid.options.data.requestId, 'request-order-0001');
    const count = requests.length;
    detail.data.submittingAction = 'PAY';
    await detail.action({ currentTarget: { dataset: { action: 'PAY' } } });
    assert.equal(requests.length, count);
});

test('评价页面：星级边界、提交载荷和公开评价列表', async () => {
    const requests: any[] = [];
    const api = {
        request: async (path: string, options?: any) => {
            requests.push({ path, options });
            if (path.startsWith('/api/users/'))
                return { items: [{ id: '1', reviewerNickname: '周同学', stars: 5, content: '交易顺利', createdAt: new Date().toISOString() }], total: 1, page: 1, pageSize: 20 };
            if (path.includes('/evaluations'))
                return { id: '9', stars: options.data.stars, content: options.data.content };
            if (path.includes('/api/orders/'))
                return { orderNo: 'CM20261029120000ABCDEFGH', version: 5, status: 'COMPLETED', canEvaluate: true, actions: [], myEvaluation: null };
            return { items: [], total: 0 };
        },
        requestId: () => 'request-review-0001',
        error: (page: any, error: Error) => page.setData({ error: error.message })
    };
    const detail = pageDefinition('miniprogram/pages/order-detail/order-detail.js', api);
    detail.orderNo = 'CM20261029120000ABCDEFGH';
    await detail.load();
    detail.chooseStars({ currentTarget: { dataset: { stars: 1 } } });
    assert.equal(detail.data.stars, 1);
    detail.chooseStars({ currentTarget: { dataset: { stars: 5 } } });
    detail.inputContent({ detail: { value: '交付准时' } });
    await detail.submitEvaluation();
    const submitted = requests.find(request => request.path.endsWith('/evaluations') && request.options.method === 'POST');
    assert.equal(submitted.options.data.stars, 5);
    assert.equal(submitted.options.data.content, '交付准时');

    const reviews = pageDefinition('miniprogram/pages/reviews/reviews.js', api, { stopPullDownRefresh() { } });
    reviews.userId = '77';
    await reviews.load(true);
    assert.equal(requests.at(-1).path, '/api/users/77/evaluations?page=1&pageSize=20');
    assert.equal(reviews.data.items[0].starsText, '★★★★★');
});

test('商品详情：可售商品创建一次订单并跳转详情', async () => {
    const requests: any[] = [];
    const navigations: string[] = [];
    const product = {
        id: '5', sellerId: '2', status: 'ON_SALE', priceCents: 2500, title: '下单测试教材',
        description: '九成新', imageIds: ['31'], condition: 'GOOD', statusText: '已上架', priceText: '25.00',
        seller: { id: '2', nickname: '陈同学', creditScore: 80, certificationStatus: 'VERIFIED' }
    };
    const api = {
        request: async (path: string, options?: any) => {
            requests.push({ path, options });
            if (path.startsWith('/api/users/'))
                return { items: [], total: 0, page: 1, pageSize: 3 };
            if (path === '/api/orders')
                return { orderNo: 'CM20261029120000ABCDEFGH' };
            return product;
        },
        decorate: async (value: any) => value,
        imagePath: async () => '/tmp/product.png',
        requestId: () => 'request-detail-0001',
        error: (page: any, error: Error) => page.setData({ error: error.message })
    };
    const wx = {
        getStorageSync: (key: string) => key === 'token' ? 'buyer-token' : { id: '3' },
        navigateTo: (value: any) => navigations.push(value.url),
        previewImage() { }
    };
    const page = pageDefinition('miniprogram/pages/detail/detail.js', api, wx);
    page.onLoad({ id: '5' });
    await page.load();
    assert.equal(page.data.canBuy, true);
    await page.order();
    const created = requests.find(request => request.path === '/api/orders');
    assert.equal(created.options.data.productId, '5');
    assert.equal(created.options.data.requestId, 'request-detail-0001');
    assert.ok(navigations.some(url => url.includes('order-detail?orderNo=CM20261029120000ABCDEFGH')));
    const count = requests.length;
    page.data.ordering = true;
    await page.order();
    assert.equal(requests.length, count);

    const profile = pageDefinition('miniprogram/pages/profile/profile.js', api, wx);
    profile.orders();
    assert.ok(navigations.some(url => url === '/pages/orders/orders'));
});
