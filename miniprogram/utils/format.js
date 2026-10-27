const statuses = { PENDING: '待审核', ON_SALE: '已上架', REJECTED: '审核未通过', OFF_SHELF: '已下架', LOCKED: '交易锁定', SOLD: '已售出', FROZEN: '违规冻结', UNVERIFIED: '未认证', VERIFIED: '已认证' };
function money(value) { return (Number(value) / 100).toFixed(2); }
function toCents(value) { const raw = String(value).trim(); if (!/^\d+(\.\d{1,2})?$/.test(raw))
    throw new Error('价格请输入非负数，最多两位小数'); const parts = raw.split('.'); const cents = Number(parts[0]) * 100 + Number(((parts[1] || '') + '00').slice(0, 2)); if (!Number.isSafeInteger(cents) || cents > 100000000)
    throw new Error('价格不能超过1000000元'); return cents; }
function status(value) { return statuses[value] || value; }
function condition(value) { return { NEW: '全新', LIKE_NEW: '几乎全新', GOOD: '使用良好', FAIR: '有使用痕迹' }[value] || '成色见详情'; }
module.exports = { money, toCents, status, condition };
