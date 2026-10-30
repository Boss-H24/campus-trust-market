const api = require('../../utils/api'), format = require('../../utils/format');
Page({
    data: { mode: 'conversations', items: [], page: 0, total: 0, loading: false, error: '' },
    onLoad(options) { this.setData({ mode: ['conversations', 'favorites', 'reports'].includes(options.mode) ? options.mode : 'conversations' }); },
    onShow() { return this.load(true); },
    onHide() { this.generation = (this.generation || 0) + 1; },
    onUnload() { this.onHide(); },
    onReachBottom() { if (this.data.items.length < this.data.total) return this.load(false); },
    choose(e) { this.setData({ mode: e.currentTarget.dataset.mode }); return this.load(true); },
    async load(reset) {
        if (!reset && this.data.loading) return;
        const generation = reset ? (this.generation || 0) + 1 : this.generation;
        this.generation = generation;
        const page = reset ? 1 : this.data.page + 1, mode = this.data.mode;
        this.setData({ loading: true, error: '', ...(reset ? { items: [], total: 0, page: 0 } : {}) });
        try {
            const result = await api.request('/api/' + mode + '?page=' + page, { quiet: true });
            const items = mode === 'favorites' ? result.items.map(item => ({ ...item, priceText: format.money(item.priceCents) })) : result.items;
            if (this.generation === generation) this.setData({ items: reset ? items : this.data.items.concat(items), page, total: result.total });
        } catch (err) { if (this.generation === generation) api.error(this, err); }
        finally { if (this.generation === generation) this.setData({ loading: false }); }
    },
    retry() { return this.load(true); },
    open(e) {
        const item = this.data.items.find(value => String(value.id || value.productId) === String(e.currentTarget.dataset.id));
        if (this.data.mode === 'conversations') wx.navigateTo({ url: '/pages/chat/chat?id=' + item.id });
        else if (this.data.mode === 'favorites' && item.available) wx.navigateTo({ url: '/pages/detail/detail?id=' + item.productId });
    },
    async remove(e) {
        try { await api.request('/api/favorites/' + e.currentTarget.dataset.id, { method: 'DELETE' }); await this.load(true); }
        catch (err) { api.error(this, err); }
    }
});
