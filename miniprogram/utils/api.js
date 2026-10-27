const config = require('../config');
function request(path, options) {
    options = options || {};
    const token = wx.getStorageSync('token');
    if (!options.quiet)
        wx.showLoading({ title: '请稍候', mask: true });
    return new Promise((resolve, reject) => {
        wx.request({ url: config.baseUrl + path, method: options.method || 'GET', data: options.data, timeout: 15000, header: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
            success(response) {
                const body = response.data || {};
                if (response.statusCode >= 200 && response.statusCode < 300 && body.code === 0)
                    resolve(body.data);
                else {
                    if (response.statusCode === 401) {
                        wx.removeStorageSync('token');
                        wx.removeStorageSync('user');
                    }
                    reject(new Error(body.message || '请求失败，请重试'));
                }
            },
            fail() { reject(new Error('无法连接服务，请确认网络与服务地址')); }
        });
    }).finally(() => { if (!options.quiet)
        wx.hideLoading(); });
}
function imagePath(assetId) {
    const token = wx.getStorageSync('token');
    return new Promise(resolve => wx.downloadFile({ url: config.baseUrl + '/api/media/' + assetId, header: token ? { Authorization: 'Bearer ' + token } : {}, success(result) { resolve(result.statusCode === 200 ? result.tempFilePath : ''); }, fail() { resolve(''); } }));
}
async function decorate(product) {
    const format = require('./format');
    return { ...product, priceText: format.money(product.priceCents), statusText: format.status(product.status), cover: product.imageIds.length ? await imagePath(product.imageIds[0]) : '' };
}
async function uploadFile(path) {
    const info = await new Promise((resolve, reject) => wx.getImageInfo({ src: path, success: resolve, fail: reject }));
    const data = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath: path, encoding: 'base64', success: resolve, fail: reject }));
    return request('/api/uploads', { method: 'POST', data: { contentType: 'image/' + (info.type === 'jpg' ? 'jpeg' : info.type), base64: data.data } });
}
function error(page, err) { page.setData({ error: err.message || '操作失败，请重试' }); }
module.exports = { request, imagePath, decorate, uploadFile, error };
