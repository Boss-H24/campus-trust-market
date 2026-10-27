const api = require('../../utils/api');
Page({ data: { demoEnabled: false, accounts: [{ id: 'seller', name: '陈同学 · 已认证卖家' }, { id: 'buyer', name: '周同学 · 已认证买家' }, { id: 'newstudent', name: '林同学 · 待认证学生' }, { id: 'admin', name: '平台管理员' }, { id: 'outsider', name: '校外访客 · 无有效学籍' }], selected: 0, password: '', error: '', busy: false },
    onLoad() { api.request('/api/health', { quiet: true }).then(data => this.setData({ demoEnabled: data.demoLoginEnabled })).catch(err => api.error(this, err)); },
    choose(e) { this.setData({ selected: Number(e.detail.value) }); }, input(e) { this.setData({ password: e.detail.value }); },
    async login(e) { if (this.data.busy)
        return; this.setData({ busy: true, error: '' }); try {
        let result;
        if (e.currentTarget.dataset.mode === 'demo') {
            result = await api.request('/api/auth/dev-login', { method: 'POST', data: { account: this.data.accounts[this.data.selected].id, password: this.data.password } });
        }
        else {
            const login = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }));
            result = await api.request('/api/auth/login', { method: 'POST', data: { code: login.code } });
        }
        wx.setStorageSync('token', result.token);
        wx.setStorageSync('user', result.user);
        this.setData({ password: '' });
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/profile/profile' }) });
    }
    catch (err) {
        api.error(this, err);
    }
    finally {
        this.setData({ busy: false });
    } }
});
