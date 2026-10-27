const api = require('../../utils/api');
Page({ data: { mode: 'certifications', items: [], error: '', loading: false }, onShow() { this.load(); }, choose(e) { this.setData({ mode: e.currentTarget.dataset.mode }); this.load(); }, async load() { this.setData({ loading: true, error: '' }); try {
        const user = await api.request('/api/users/me', { quiet: true });
        if (user.role !== 'ADMIN')
            throw new Error('需要管理员权限');
        const mode = this.data.mode;
        const data = await api.request(mode === 'certifications' ? '/api/admin/certifications' : '/api/admin/products?status=PENDING', { quiet: true });
        const items = mode === 'products' ? await Promise.all(data.items.map(api.decorate)) : data.items;
        if (mode === this.data.mode)
            this.setData({ items });
    }
    catch (err) {
        this.setData({ items: [] });
        api.error(this, err);
    }
    finally {
        this.setData({ loading: false });
    } }, audit(e) { const data = e.currentTarget.dataset; if (data.action === 'REJECT') {
        wx.showModal({ title: '填写驳回理由', editable: true, placeholderText: '说明需要补充或修改的内容', success: result => { if (result.confirm)
                this.sendAudit(data.id, data.action, result.content, Number(data.version)); } });
    }
    else
        this.sendAudit(data.id, data.action, '', Number(data.version)); }, async sendAudit(id, action, reason, expectedVersion) { try {
        const path = this.data.mode === 'certifications' ? '/api/admin/certifications/' + id + '/audit' : '/api/products/' + id + '/audit';
        await api.request(path, { method: 'POST', data: { action, reason, expectedVersion } });
        wx.showToast({ title: '处理成功' });
        this.load();
    }
    catch (err) {
        api.error(this, err);
    } }, open(e) { wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); } });
