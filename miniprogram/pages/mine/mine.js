const api = require('../../utils/api');
Page({ data: { items: [], page: 1, total: 0, error: '', loading: false }, onShow() { this.load(true); }, async load(reset) { if (this.data.loading)
        return; this.setData({ loading: true, error: '' }); try {
        const data = await api.request('/api/products?scope=mine&page=' + (reset ? 1 : this.data.page + 1), { quiet: true });
        const items = await Promise.all(data.items.map(api.decorate));
        this.setData({ items: reset ? items : this.data.items.concat(items), page: data.page, total: data.total });
    }
    catch (err) {
        api.error(this, err);
    }
    finally {
        this.setData({ loading: false });
        wx.stopPullDownRefresh();
    } }, retry() { this.load(true); }, onPullDownRefresh() { this.load(true); }, onReachBottom() { if (this.data.items.length < this.data.total)
        this.load(false); }, open(e) { wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); }, edit(e) { wx.setStorageSync('editingProductId', {id:e.currentTarget.dataset.id,userId:wx.getStorageSync('user').id}); wx.switchTab({ url: '/pages/publish/publish' }); }, async action(e) { try {
        await api.request('/api/products/' + e.currentTarget.dataset.id + '/status', { method: 'PUT', data: { action: e.currentTarget.dataset.action } });
        this.load(true);
    }
    catch (err) {
        api.error(this, err);
    } } });
