const api = require('../../utils/api'), format = require('../../utils/format');

Page({
    data: { side: 'buyer', items: [], page: 1, total: 0, error: '', loading: false },
    onShow() { return this.load(true); },
    async load(reset) {
        if (this.data.loading)
            return;
        this.setData({ loading: true, error: '' });
        try {
            const page = reset ? 1 : this.data.page + 1;
            const result = await api.request(`/api/orders?side=${this.data.side}&page=${page}`, { quiet: true });
            const items = await Promise.all(result.items.map(async item => {
                const counterparty = item.role === 'BUYER' ? item.seller : item.buyer;
                return {
                    ...item,
                    amountText: format.money(item.amountCents),
                    statusText: format.status(item.status),
                    counterparty: counterparty ? counterparty.nickname : '',
                    cover: item.product.imageIds.length ? await api.imagePath(item.product.imageIds[0]) : ''
                };
            }));
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
    async chooseSide(event) {
        const side = event.currentTarget.dataset.side;
        if (side === this.data.side)
            return;
        this.setData({ side, items: [], page: 1, total: 0 });
        await this.load(true);
    },
    open(event) {
        wx.navigateTo({ url: `/pages/order-detail/order-detail?orderNo=${event.currentTarget.dataset.orderNo}` });
    },
    goShopping() { wx.switchTab({ url: '/pages/home/home' }); },
    retry() { return this.load(true); },
    onPullDownRefresh() { return this.load(true); },
    onReachBottom() {
        if (!this.data.loading && this.data.items.length < this.data.total)
            return this.load(false);
    }
});
