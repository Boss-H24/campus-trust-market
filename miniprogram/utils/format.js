const statuses = { PENDING: '待审核', ON_SALE: '已上架', REJECTED: '审核未通过', OFF_SHELF: '已下架', LOCKED: '交易锁定', SOLD: '已售出', FROZEN: '违规冻结', UNVERIFIED: '未认证', VERIFIED: '已认证', PENDING_PAYMENT: '待付款', PAID: '已付款', PENDING_DELIVERY: '待交付', IN_PROGRESS: '交易中', PENDING_CONFIRMATION: '待确认', COMPLETED: '已完成', DISPUTED: '交易纠纷', REFUNDING: '退款中', CANCELLED: '已取消' };
function money(value) { return (Number(value) / 100).toFixed(2); }
function toCents(value) { const raw = String(value).trim(); if (!/^\d+(\.\d{1,2})?$/.test(raw))
    throw new Error('价格请输入非负数，最多两位小数'); const parts = raw.split('.'); const cents = Number(parts[0]) * 100 + Number(((parts[1] || '') + '00').slice(0, 2)); if (!Number.isSafeInteger(cents) || cents > 100000000)
    throw new Error('价格不能超过1000000元'); return cents; }
function status(value) { return statuses[value] || value; }
function condition(value) { return { NEW: '全新', LIKE_NEW: '几乎全新', GOOD: '使用良好', FAIR: '有使用痕迹' }[value] || '成色见详情'; }
function stars(value) { return '★'.repeat(Number(value) || 0) + '☆'.repeat(Math.max(0, 5 - (Number(value) || 0))); }
module.exports = { money, toCents, status, condition, stars };
