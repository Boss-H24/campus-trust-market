const api = require('../../utils/api');
Page({ data: { product: null, images: [], own: false, error: '', conditionText: '' }, onLoad(options) { this.productId = options.id; }, onShow() { this.load(); }, async load() { this.setData({ error: '' }); try {
        const product = await api.decorate(await api.request('/api/products/' + this.productId));
        const images = await Promise.all(product.imageIds.map(api.imagePath));
        const user = wx.getStorageSync('user');
        this.setData({ product, images, own: !!user && user.id === product.sellerId, conditionText: product.conditionText });
    }
    catch (err) {
        this.setData({ product: null });
        api.error(this, err);
    } }, edit() { wx.setStorageSync('editingProductId', {id:this.productId,userId:wx.getStorageSync('user').id}); wx.switchTab({ url: '/pages/publish/publish' }); }, preview(e) { wx.previewImage({ urls: this.data.images.filter(Boolean), current: e.currentTarget.dataset.path }); } });
