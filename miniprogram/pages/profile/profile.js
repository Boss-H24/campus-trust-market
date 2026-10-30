const api = require('../../utils/api'), format = require('../../utils/format');
Page({ data: { user: null, avatar: '', statusText: '', error: '' }, onShow() { this.refresh(); }, async refresh() { this.setData({ error: '' }); if (!wx.getStorageSync('token')) {
        this.setData({ user: null });
        return;
    } try {
        const user = await api.request('/api/users/me', { quiet: true });
        wx.setStorageSync('user', user);
        this.setData({ user, statusText: format.status(user.certificationStatus), avatar: user.avatarId ? await api.imagePath(user.avatarId) : '' });
    }
    catch (err) {
        this.setData({ user: null });
        api.error(this, err);
    } }, community(e) { wx.navigateTo({ url: '/pages/community/community?mode=' + e.currentTarget.dataset.mode }); }, login() { wx.navigateTo({ url: '/pages/login/login' }); }, certify() { wx.navigateTo({ url: '/pages/certification/certification' }); }, orders() { wx.navigateTo({ url: '/pages/orders/orders' }); }, mine() { wx.navigateTo({ url: '/pages/mine/mine' }); }, admin() { wx.navigateTo({ url: '/pages/admin/admin' }); }, async logout() { try {
        await api.request('/api/auth/logout', { method: 'POST' });
    }
    catch (err) {
        wx.showToast({ title: err.message, icon: 'none' });
        return;
    } wx.removeStorageSync('token'); wx.removeStorageSync('user'); wx.removeStorageSync('editingProductId'); this.setData({ user: null, avatar: '' }); }, editName() { wx.showModal({ title: '修改昵称', editable: true, placeholderText: this.data.user.nickname, success: async (result) => { if (!result.confirm)
            return; try {
            await api.request('/api/users/me', { method: 'PATCH', data: { nickname: result.content, avatarId: this.data.user.avatarId } });
            this.refresh();
        }
        catch (err) {
            api.error(this, err);
        } } }); }, async avatar(e) { try {
        const asset = await api.uploadFile(e.detail.avatarUrl);
        await api.request('/api/users/me', { method: 'PATCH', data: { nickname: this.data.user.nickname, avatarId: asset.id } });
        this.refresh();
    }
    catch (err) {
        api.error(this, err);
    } } });
