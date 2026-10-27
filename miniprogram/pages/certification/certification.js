const api = require('../../utils/api'), format = require('../../utils/format');
Page({ data: { status: 'UNVERIFIED', statusText: '未认证', school: '', realName: '', studentId: '', phone: '', error: '', busy: false, rejectionReason: '' }, onShow() { this.refresh(); }, async refresh() { try {
        const [health, cert] = await Promise.all([api.request('/api/health', { quiet: true }), api.request('/api/certifications/status', { quiet: true })]);
        this.setData({ status: cert.status, statusText: format.status(cert.status), school: health.schoolName, rejectionReason: cert.rejectionReason || '', maskedStudentId: cert.maskedStudentId, maskedPhone: cert.maskedPhone });
    }
    catch (err) {
        api.error(this, err);
    } }, input(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); }, async submit() { if (this.data.busy)
        return; this.setData({ busy: true, error: '' }); try {
        await api.request('/api/certifications', { method: 'POST', data: { school: this.data.school, realName: this.data.realName, studentId: this.data.studentId, phone: this.data.phone } });
        this.setData({ realName: '', studentId: '', phone: '' });
        await this.refresh();
        wx.showToast({ title: '已提交审核', icon: 'success' });
    }
    catch (err) {
        api.error(this, err);
    }
    finally {
        this.setData({ busy: false });
    } } });
