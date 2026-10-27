const api = require('../../utils/api');
const format = require('../../utils/format');
Page({
    data: { categories: [], categoryId: '', keyword: '', minPrice: '', maxPrice: '', activeDeal: '', hasFilters: false, showFilters: false, items: [], page: 1, total: 0, error: '', loading: false },
    onLoad() { api.request('/api/categories', { quiet: true }).then(data => this.setData({ categories: data.items.map(category => ({ ...category, symbol: { '教材资料': '书', '数码电子': '键', '生活用品': '灯', '运动器材': '球' }[category.name] || '物' })) })).catch(err => api.error(this, err)); },
    onShow() { this.load(true); },
    async load(reset) {
        const sequence = (this.sequence || 0) + 1;
        this.sequence = sequence;
        this.setData({ loading: true, error: '', hasFilters: !!(this.data.categoryId || this.data.keyword.trim() || this.data.minPrice !== '' || this.data.maxPrice !== '') });
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
    input(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value, activeDeal: '' }); },
    search() { return this.load(true); },
    chooseCategory(e) { this.setData({ categoryId: e.currentTarget.dataset.id, activeDeal: '' }); return this.load(true); },
    chooseDeal(e) {
        const deal = e.currentTarget.dataset.deal;
        if (!['budget', 'books', 'dorm'].includes(deal)) return;
        let categoryId = '';
        if (deal !== 'budget') {
            const category = this.data.categories.find(item => item.name === (deal === 'books' ? '教材资料' : '生活用品'));
            if (!category) { this.setData({ error: '分类尚未加载，请稍后重试' }); return; }
            categoryId = category.id;
        }
        this.setData({ activeDeal: deal, categoryId, keyword: '', minPrice: '', maxPrice: deal === 'budget' ? '50' : '', showFilters: false });
        return this.load(true);
    },
    resetFilters() { this.setData({ activeDeal: '', categoryId: '', keyword: '', minPrice: '', maxPrice: '', showFilters: false }); return this.load(true); },
    toggleFilters() { this.setData({ showFilters: !this.data.showFilters }); },
    open(e) { wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); },
    onReachBottom() { if (!this.data.loading && this.data.items.length < this.data.total)
        this.load(false); },
    onPullDownRefresh() { this.load(true); }
});
