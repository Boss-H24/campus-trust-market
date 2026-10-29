const api = require('../../utils/api');
const paths = { certifications: '/api/admin/certifications', products: '/api/admin/products?status=PENDING', reports: '/api/admin/reports', users: '/api/admin/users', categories: '/api/admin/categories', rules: '/api/admin/rules', logs: '/api/admin/logs', frozen: '/api/admin/products?moderationFrozen=1' };
function ask(title, placeholderText) { return new Promise(resolve => wx.showModal({ title, editable: true, placeholderText, success: result => resolve(result.confirm ? result.content : null), fail: () => resolve(null) })); }
Page({
    data: { mode: 'certifications', items: [], error: '', loading: false, page: 0, total: 0, busy: false, evidence: [], evidenceReport: '', evidenceConversation: '', evidenceAfterId: '0', evidenceMore: false },
    onShow() { return this.load(true); },
    onHide() { this.generation = (this.generation || 0) + 1; this.setData({ evidence: [], evidenceReport: '', evidenceConversation: '' }); },
    onUnload() { this.onHide(); },
    onReachBottom() { if (this.data.items.length < this.data.total) return this.load(false); },
    choose(e) { this.setData({ mode: e.currentTarget.dataset.mode, evidence: [], evidenceReport: '', evidenceConversation: '' }); return this.load(true); },
    retry() { return this.load(true); },
    async load(reset = true) {
        if (!reset && this.data.loading) return;
        const generation = reset ? (this.generation || 0) + 1 : this.generation; this.generation = generation;
        const mode = this.data.mode, page = reset ? 1 : this.data.page + 1;
        this.setData({ loading: true, error: '', ...(reset ? { items: [], page: 0, total: 0 } : {}) });
        try {
            const user = await api.request('/api/users/me', { quiet: true });
            if (user.role !== 'ADMIN') throw new Error('需要管理员权限');
            const path = paths[mode];
            const data = await api.request(path + (path.includes('?') ? '&' : '?') + 'page=' + page, { quiet: true });
            let items = data.items;
            if (mode === 'products' || mode === 'frozen') items = await Promise.all(items.map(api.decorate));
            if (mode === 'rules') items = items.map(item => ({ ...item, valueText: Array.isArray(item.value) ? item.value.join('，') : String(item.value) }));
            if (generation === this.generation) this.setData({ items: reset ? items : this.data.items.concat(items), page, total: data.total === undefined ? items.length : data.total });
        } catch (err) { if (generation === this.generation) api.error(this, err); }
        finally { if (generation === this.generation) this.setData({ loading: false }); }
    },
    audit(e) {
        const data = e.currentTarget.dataset;
        if (data.action === 'REJECT') ask('填写驳回理由', '说明需要补充或修改的内容').then(reason => { if (reason !== null) this.sendAudit(data.id, data.action, reason, Number(data.version)); });
        else return this.sendAudit(data.id, data.action, '', Number(data.version));
    },
    async sendAudit(id, action, reason, expectedVersion) {
        const path = this.data.mode === 'certifications' ? '/api/admin/certifications/' + id + '/audit' : '/api/products/' + id + '/audit';
        return this.mutate(path, 'POST', { action, reason, expectedVersion });
    },
    async mutate(path, method, data) {
        if (this.data.busy) return;
        this.setData({ busy: true, error: '' });
        try { await api.request(path, { method, data }); await this.load(true); wx.showToast({ title: '处理成功' }); }
        catch (err) {
            // 冲突后刷新列表，保留失败提示，让用户核对新版本。
            const message = err.message; await this.load(true); this.setData({ error: message + '；列表已刷新，请核对后再操作' });
        } finally { this.setData({ busy: false }); }
    },
    async resolve(e) {
        const data = e.currentTarget.dataset;
        if (data.decision === 'REJECTED') {
            const reason = await ask('驳回举报的理由', '填写核查结果');
            if (reason !== null) return this.mutate('/api/admin/reports/' + data.id + '/resolve', 'POST', { decision: 'REJECTED', action: 'NONE', reason });
            return;
        }
        const item = this.data.items.find(item => item.id === data.id);
        const actions = item.targetType === 'PRODUCT' ? ['NONE', 'TAKE_DOWN', 'FREEZE_PRODUCT', 'DISABLE_USER'] : ['NONE', 'DISABLE_USER'];
        const labels = item.targetType === 'PRODUCT' ? ['成立，仅扣信誉分', '成立并下架商品', '成立并冻结商品', '成立并禁用违规账号'] : ['成立，仅扣信誉分', '成立并禁用违规账号'];
        wx.showActionSheet({ itemList: labels, success: async result => {
            const reason = await ask('举报成立的依据', '填写核查结果和处置理由');
            if (reason !== null) await this.mutate('/api/admin/reports/' + data.id + '/resolve', 'POST', { decision: 'UPHELD', action: actions[result.tapIndex], reason });
        } });
    },
    progress(e) { const data = e.currentTarget.dataset; return this.mutate('/api/admin/reports/' + data.id, 'PATCH', { action: data.action, expectedVersion: Number(data.version) }); },
    async evidence(e) {
        const reportId = e.currentTarget.dataset.id, generation = this.generation;
        this.setData({ error: '', evidence: [], evidenceReport: '', evidenceConversation: '', evidenceAfterId: '0', evidenceMore: false });
        try {
            const data = await api.request('/api/admin/reports/' + reportId + '/evidence');
            if (generation !== this.generation) return;
            if (!data.conversations.length) { this.setData({ error: '本举报没有可查阅的相关会话' }); return; }
            wx.showActionSheet({ itemList: data.conversations.slice(0, 6).map(item => '会话 #' + item.id + ' · 商品 #' + item.productId), success: result => {
                if (generation !== this.generation) return;
                this.setData({ evidenceReport: reportId, evidenceConversation: data.conversations[result.tapIndex].id }); this.moreEvidence();
            } });
        } catch (err) { if (generation === this.generation) api.error(this, err); }
    },
    async moreEvidence() {
        if (this.evidenceLoading) return;
        const generation = this.generation; this.evidenceLoading = true;
        try {
            const data = await api.request('/api/admin/reports/' + this.data.evidenceReport + '/evidence?conversationId=' + this.data.evidenceConversation + '&afterId=' + this.data.evidenceAfterId);
            if (generation === this.generation) this.setData({ evidence: this.data.evidence.concat(data.items), evidenceAfterId: data.nextAfterId, evidenceMore: data.hasMore });
        } catch (err) { if (generation === this.generation) api.error(this, err); }
        finally { this.evidenceLoading = false; }
    },
    async toggleUser(e) { const data = e.currentTarget.dataset, reason = await ask(data.status === 'ACTIVE' ? '禁用账号的理由' : '恢复账号的理由', '填写核查依据'); if (reason !== null) return this.mutate('/api/admin/users/' + data.id, 'PATCH', { action: data.status === 'ACTIVE' ? 'DISABLE' : 'ENABLE', reason }); },
    async unfreeze(e) { const data = e.currentTarget.dataset, reason = await ask('解除冻结的理由', '解冻后仍须卖家提交审核'); if (reason !== null) return this.mutate('/api/admin/products/' + data.id + '/moderation', 'POST', { action: 'UNFREEZE', expectedVersion: Number(data.version), reason }); },
    async addCategory() { const name = await ask('新增商品分类', '填写分类名称'); if (name !== null) return this.mutate('/api/admin/categories', 'POST', { name }); },
    async category(e) { const item = this.data.items.find(item => String(item.id) === String(e.currentTarget.dataset.id)); const name = await ask('维护分类名称', item.name); if (name === null) return; wx.showModal({ title: '分类是否启用', content: '停用会保留已引用的商品记录。', confirmText: '启用', cancelText: '停用', success: result => { if (result.confirm || result.cancel) this.mutate('/api/admin/categories', 'PATCH', { id: item.id, name: name || item.name, active: result.confirm }); } }); },
    async editRule(e) {
        const item = this.data.items.find(item => item.key === e.currentTarget.dataset.key);
        const input = await ask('更新平台规则', item.valueText);
        if (input === null) return;
        if (item.key !== 'blocked_keywords' && !input.trim()) { this.setData({ error: '请输入规则数值' }); return; }
        const value = item.key === 'blocked_keywords' ? input.split(/[,，]/).map(word => word.trim()).filter(Boolean) : Number(input);
        return this.mutate('/api/admin/rules/' + item.key, 'PATCH', { value, expectedVersion: item.version });
    },
    open(e) { wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); }
});
