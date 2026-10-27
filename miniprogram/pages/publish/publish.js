const api = require('../../utils/api'), format = require('../../utils/format');
Page({
    data: { user: null, id: '', title: '', description: '', price: '', categories: [], categoryIndex: 0, conditions: ['全新', '几乎全新', '使用良好', '有使用痕迹'], conditionValues: ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'], conditionIndex: 2, images: [], error: '', busy: false, uploading: false },
    async onShow() {
        const token = wx.getStorageSync('token');
        if (this.draftToken !== token) {
            this.reset();
            this.setData({ user: null });
            this.draftToken = token;
        }
        if (!token) {
            wx.removeStorageSync('editingProductId');
            return;
        }
        try {
            const [user, categories] = await Promise.all([api.request('/api/users/me', { quiet: true }), api.request('/api/categories', { quiet: true })]);
            if (wx.getStorageSync('token') !== token)
                return;
            this.setData({ user, categories: categories.items, error: '' });
            const edit = wx.getStorageSync('editingProductId');
            wx.removeStorageSync('editingProductId');
            if (edit && edit.userId === user.id) {
                const p = await api.request('/api/products/' + edit.id);
                const images = await Promise.all(p.imageIds.map(async (id) => ({ id, path: await api.imagePath(id) })));
                if (wx.getStorageSync('token') !== token)
                    return;
                this.setData({ id: p.id, title: p.title, description: p.description, price: format.money(p.priceCents), categoryIndex: Math.max(0, categories.items.findIndex(c => c.id === p.categoryId)), conditionIndex: this.data.conditionValues.indexOf(p.condition), images });
            }
        }
        catch (err) {
            api.error(this, err);
        }
    },
    login() { wx.navigateTo({ url: '/pages/login/login' }); }, certify() { wx.navigateTo({ url: '/pages/certification/certification' }); },
    input(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); },
    choose(e) { this.setData({ [e.currentTarget.dataset.field]: Number(e.detail.value) }); },
    photos() { if (this.data.uploading || this.data.images.length >= 9)
        return; wx.chooseImage({ count: 9 - this.data.images.length, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: async (result) => { this.setData({ uploading: true, error: '' }); try {
            for (const path of result.tempFilePaths) {
                const asset = await api.uploadFile(path);
                this.setData({ images: this.data.images.concat([{ id: asset.id, path }]) });
            }
        }
        catch (err) {
            api.error(this, err);
        }
        finally {
            this.setData({ uploading: false });
        } } }); },
    removePhoto(e) { if (this.data.uploading)
        return; this.setData({ images: this.data.images.filter((_, index) => index !== Number(e.currentTarget.dataset.index)) }); },
    async submit() { if (this.data.busy || this.data.uploading)
        return; this.setData({ busy: true, error: '' }); try {
        if (!this.data.categories[this.data.categoryIndex])
            throw new Error('分类尚未加载，请重新打开此页');
        const data = { title: this.data.title, description: this.data.description, priceCents: format.toCents(this.data.price), categoryId: this.data.categories[this.data.categoryIndex].id, condition: this.data.conditionValues[this.data.conditionIndex], imageIds: this.data.images.map(image => image.id) };
        const product = await api.request(this.data.id ? '/api/products/' + this.data.id : '/api/products', { method: this.data.id ? 'PUT' : 'POST', data });
        this.reset();
        wx.navigateTo({ url: '/pages/detail/detail?id=' + product.id });
    }
    catch (err) {
        api.error(this, err);
    }
    finally {
        this.setData({ busy: false });
    } },
    reset() { this.setData({ id: '', title: '', description: '', price: '', categoryIndex: 0, conditionIndex: 2, images: [], error: '' }); },
    newProduct() { this.reset(); }
});
