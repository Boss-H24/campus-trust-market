const api = require('../../utils/api');
const format = require('../../utils/format');
Page({
    data: { categories: [], categoryId: '', keyword: '', minPrice: '', maxPrice: '', showFilters: false, items: [], page: 1, total: 0, error: '', loading: false },
    onLoad() { api.request('/api/categories', { quiet: true }).then(data => this.setData({ categories: data.items })).catch(err => api.error(this, err)); },
    onShow() { this.load(true); },
    async load(reset) {
        const sequence = (this.sequence || 0) + 1;
        this.sequence = sequence;
        this.setData({ loading: true, error: '' });
        try {
            const query = { page: reset ? 1 : this.data.page + 1, pageSize: 20 };
            if (this.data.categoryId)
                query.categoryId = this.data.categoryId;
            if (this.data.keyword.trim())
                query.keyword = this.data.keyword.trim();
            if (this.data.minPrice !== '')
                query.minPriceCents = format.toCents(this.data.minPrice);
            if (this.data.maxPrice !== '')
                query.maxPriceCents = format.toCents(this.data.maxPrice);
            const path = '/api/products?' + Object.keys(query).map(key => key + '=' + encodeURIComponent(query[key])).join('&');
            const result = await api.request(path, { quiet: true });
            const items = await Promise.all(result.items.map(api.decorate));
            if (this.sequence === sequence)
                this.setData({ items: reset ? items : this.data.items.concat(items), page: result.page, total: result.total });
        }
        catch (err) {
            if (this.sequence === sequence)
                api.error(this, err);
        }
        finally {
            if (this.sequence === sequence)
                this.setData({ loading: false });
            wx.stopPullDownRefresh();
        }
    },
    input(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); },
    search() { this.load(true); },
    chooseCategory(e) { this.setData({ categoryId: e.currentTarget.dataset.id }); this.load(true); },
    toggleFilters() { this.setData({ showFilters: !this.data.showFilters }); },
    open(e) { wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); },
    onReachBottom() { if (!this.data.loading && this.data.items.length < this.data.total)
        this.load(false); },
    onPullDownRefresh() { this.load(true); }
});
