const api = require('../../utils/api');
Page({
    data: { targetType: 'PRODUCT', targetId: '', reason: '', description: '', error: '', submitting: false },
    onLoad(options) { this.setData({ targetType: options.type === 'USER' ? 'USER' : 'PRODUCT', targetId: options.id || '' }); },
    input(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); },
    async submit() {
        if (this.data.submitting) return;
        this.setData({ submitting: true, error: '' });
        try {
            await api.request('/api/reports', { method: 'POST', data: { targetType: this.data.targetType, targetId: this.data.targetId, reason: this.data.reason, description: this.data.description } });
            wx.redirectTo({ url: '/pages/community/community?mode=reports' });
        } catch (err) { api.error(this, err); }
        finally { this.setData({ submitting: false }); }
    }
});
