const api = require('../../utils/api'), format = require('../../utils/format');

const actionLabels = {
    PAY: '模拟支付',
    CANCEL: '取消订单',
    ACCEPT: '确认接单',
    REJECT: '拒绝并退款',
    START_DELIVERY: '开始交割',
    MARK_DELIVERED: '标记已交付',
    CONFIRM: '确认收货',
    REQUEST_REFUND: '申请退款',
    OPEN_DISPUTE: '发起纠纷',
    RESOLVE_COMPLETE: '裁决完成',
    RESOLVE_REFUND: '裁决退款',
    REFUND_SUCCEEDED: '确认退款完成'
};
const primaryActions = new Set(['PAY', 'CONFIRM']);

Page({
    data: {
        order: null,
        actions: [],
        history: [],
        evaluations: [],
        canEvaluate: false,
        starsList: [1, 2, 3, 4, 5],
        stars: 5,
        content: '',
        error: '',
        submittingAction: '',
        evaluating: false
    },
    onLoad(options) { this.orderNo = options.orderNo; },
    onShow() { return this.load(); },
    async load() {
        if (!this.orderNo)
            return;
        this.setData({ error: '' });
        try {
            const raw = await api.request(`/api/orders/${this.orderNo}`, { quiet: true });
            const cover = raw.product && raw.product.imageIds && raw.product.imageIds.length
                ? await api.imagePath(raw.product.imageIds[0])
                : '';
            const order = {
                ...raw,
                product: { ...raw.product, cover },
                amountText: format.money(raw.amountCents),
                statusText: format.status(raw.status),
                canEvaluate: raw.canEvaluate === true
            };
            this.setData({
                order,
                actions: (raw.actions || []).map(action => ({
                    action,
                    label: actionLabels[action] || action,
                    primary: primaryActions.has(action)
                })),
                history: (raw.history || []).map(entry => ({ ...entry, toText: format.status(entry.toStatus) })),
                evaluations: (raw.evaluations || []).map(entry => ({ ...entry, starsText: format.stars(entry.stars) })),
                canEvaluate: order.canEvaluate
            });
        }
        catch (err) {
            this.setData({ order: null });
            api.error(this, err);
        }
    },
    async action(event) {
        const action = event.currentTarget.dataset.action;
        if (!action || this.data.submittingAction || !this.data.actions.some(item => item.action === action))
            return;
        const order = this.data.order;
        if (!order)
            return;
        this.setData({ submittingAction: action, error: '' });
        try {
            const data = { version: order.version, requestId: api.requestId() };
            if (action === 'PAY')
                await api.request(`/api/orders/${this.orderNo}/pay`, { method: 'POST', data });
            else if (action === 'CONFIRM')
                await api.request(`/api/orders/${this.orderNo}/confirm`, { method: 'POST', data });
            else
                await api.request(`/api/orders/${this.orderNo}/status`, { method: 'PUT', data: { ...data, action } });
            await this.load();
        }
        catch (err) {
            api.error(this, err);
        }
        finally {
            this.setData({ submittingAction: '' });
        }
    },
    chooseStars(event) {
        const stars = Number(event.currentTarget.dataset.stars);
        if (Number.isInteger(stars) && stars >= 1 && stars <= 5)
            this.setData({ stars });
    },
    inputContent(event) { this.setData({ content: event.detail.value }); },
    async submitEvaluation() {
        if (!this.data.order || !this.data.order.canEvaluate || this.data.evaluating)
            return;
        this.setData({ evaluating: true, error: '' });
        try {
            await api.request(`/api/orders/${this.orderNo}/evaluations`, {
                method: 'POST',
                data: { stars: this.data.stars, content: this.data.content }
            });
            this.setData({ content: '', stars: 5 });
            await this.load();
        }
        catch (err) {
            api.error(this, err);
        }
        finally {
            this.setData({ evaluating: false });
        }
    },
    openReviews(event) {
        wx.navigateTo({ url: `/pages/reviews/reviews?userId=${event.currentTarget.dataset.userId}` });
    },
    preview() {
        if (this.data.order && this.data.order.product.cover)
            wx.previewImage({ urls: [this.data.order.product.cover], current: this.data.order.product.cover });
    }
});
