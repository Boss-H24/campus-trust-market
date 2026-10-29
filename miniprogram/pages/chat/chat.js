const api = require('../../utils/api');
Page({
    data: { items: [], content: '', userId: '', error: '', sending: false, scrollId: '' },
    onLoad(options) { this.conversationId = options.id; this.afterId = '0'; },
    async onShow() {
        this.active = true;
        const generation = (this.generation || 0) + 1; this.generation = generation;
        const token = wx.getStorageSync('token');
        if (this.sessionToken !== token) { this.sessionToken = token; this.afterId = '0'; this.pending = null; this.setData({ items: [], content: '', error: '' }); }
        try {
            const user = await api.request('/api/users/me', { quiet: true });
            if (!this.active || generation !== this.generation) return;
            this.setData({ userId: user.id });
            await this.poll(generation);
        } catch (err) { if (this.active && generation === this.generation) api.error(this, err); }
    },
    onHide() { this.active = false; this.generation = (this.generation || 0) + 1; clearTimeout(this.timer); },
    onUnload() { this.onHide(); },
    input(e) { this.setData({ content: e.detail.value }); },
    async poll(generation) {
        if (!this.active || generation !== this.generation) return;
        let delay = 3000;
        try {
            const result = await api.request('/api/conversations/' + this.conversationId + '/messages?afterId=' + this.afterId, { quiet: true });
            if (!this.active || generation !== this.generation) return;
            const seen = new Set(this.data.items.map(item => item.id));
            const items = this.data.items.concat(result.items.filter(item => !seen.has(item.id)));
            this.afterId = result.nextAfterId;
            this.setData({ items, error: '', scrollId: result.items.length ? 'message-' + result.items[result.items.length - 1].id : this.data.scrollId });
            if (result.hasMore) delay = 0;
        } catch (err) { if (this.active && generation === this.generation) api.error(this, err); }
        finally { if (this.active && generation === this.generation) this.timer = setTimeout(() => this.poll(generation), delay); }
    },
    async send() {
        if (this.data.sending || !this.data.content.trim()) return;
        const content = this.data.content.trim(), generation = this.generation;
        if (!this.pending || this.pending.content !== content) this.pending = { clientMessageId: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), content };
        this.setData({ sending: true, error: '' });
        try {
            await api.request('/api/conversations/' + this.conversationId + '/messages', { method: 'POST', data: this.pending, quiet: true });
            if (generation !== this.generation) return;
            this.pending = null; this.setData({ content: '' });
        } catch (err) { if (generation === this.generation) api.error(this, err); }
        finally { this.setData({ sending: false }); }
    }
});
