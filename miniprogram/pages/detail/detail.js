const api = require('../../utils/api'), format = require('../../utils/format');

Page({
    data: {
        product: null,
        images: [],
        own: false,
        canBuy: false,
        ordering: false,
        sellerReviews: [],
        error: '',
        conditionText: ''
    },
    onLoad(options) { this.productId = options.id; },
    onShow() { return this.load(); },
    async load() {
        this.setData({ error: '' });
        try {
            const product = await api.decorate(await api.request('/api/products/' + this.productId));
            const images = await Promise.all(product.imageIds.map(api.imagePath));
            const user = wx.getStorageSync('user');
            const own = !!user && user.id === product.sellerId;
            let sellerReviews = [];
            try {
                const reviews = await api.request(`/api/users/${product.sellerId}/evaluations?page=1&pageSize=3`, { quiet: true });
                sellerReviews = reviews.items.map(item => ({ ...item, starsText: format.stars(item.stars) }));
            }
            catch { }
            this.setData({
                product,
                images,
                own,
                canBuy: product.status === 'ON_SALE' && !own,
                sellerReviews,
                conditionText: product.conditionText
            });
        }
        catch (err) {
            this.setData({ product: null });
            api.error(this, err);
        }
    },
    async order() {
        if (this.data.ordering)
            return;
        if (!wx.getStorageSync('token')) {
            wx.navigateTo({ url: '/pages/login/login' });
            return;
        }
        this.setData({ ordering: true, error: '' });
        try {
            const order = await api.request('/api/orders', {
                method: 'POST',
                data: { productId: this.productId, requestId: api.requestId() }
            });
            wx.navigateTo({ url: `/pages/order-detail/order-detail?orderNo=${order.orderNo}` });
        }
        catch (err) {
            api.error(this, err);
        }
        finally {
            this.setData({ ordering: false });
        }
    },
    async consult() {
        try { const conversation = await api.request('/api/conversations', { method: 'POST', data: { productId: this.productId } }); wx.navigateTo({ url: '/pages/chat/chat?id=' + conversation.id }); }
        catch (err) { api.error(this, err); }
    },
    async favorite() {
        try { await api.request('/api/favorites/' + this.productId, { method: 'PUT' }); wx.showToast({ title: '已收藏' }); }
        catch (err) { api.error(this, err); }
    },
    report(e) {
        const user = e.currentTarget.dataset.type === 'USER';
        wx.navigateTo({ url: '/pages/report/report?type=' + (user ? 'USER' : 'PRODUCT') + '&id=' + (user ? this.data.product.sellerId : this.productId) });
    },
    edit() {
        wx.setStorageSync('editingProductId', { id: this.productId, userId: wx.getStorageSync('user').id });
        wx.switchTab({ url: '/pages/publish/publish' });
    },
    openReviews() {
        wx.navigateTo({ url: `/pages/reviews/reviews?userId=${this.data.product.sellerId}` });
    },
    preview(event) {
        wx.previewImage({ urls: this.data.images.filter(Boolean), current: event.currentTarget.dataset.path });
    }
});
