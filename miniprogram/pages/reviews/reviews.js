const api = require('../../utils/api'), format = require('../../utils/format');

Page({
    data: { items: [], page: 1, total: 0, error: '', loading: false },
    onLoad(options) { this.userId = options.userId; },
    onShow() { return this.load(true); },
    async load(reset) {
        if (!this.userId || this.data.loading)
            return;
        this.setData({ loading: true, error: '' });
        try {
            const page = reset ? 1 : this.data.page + 1;
            const result = await api.request(`/api/users/${this.userId}/evaluations?page=${page}&pageSize=20`, { quiet: true });
            const items = result.items.map(item => ({ ...item, starsText: format.stars(item.stars) }));
            this.setData({
                items: reset ? items : this.data.items.concat(items),
                page: result.page,
                total: result.total
            });
        }
        catch (err) {
            api.error(this, err);
        }
        finally {
            this.setData({ loading: false });
            wx.stopPullDownRefresh();
        }
    },
    retry() { return this.load(true); },
    onPullDownRefresh() { return this.load(true); },
    onReachBottom() {
        if (!this.data.loading && this.data.items.length < this.data.total)
            return this.load(false);
    }
});
