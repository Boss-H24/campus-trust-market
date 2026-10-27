import { ensure, id, text } from '../common/errors.ts';
import type { ProductStatus } from '../contracts.ts';
export type ProductInput = {
    title: string;
    description: string;
    priceCents: number;
    categoryId: string;
    condition: 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR';
    imageIds: string[];
};
export const normalizeTitle = (value: string): string => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
export function checkContent(value: string): void {
    const normalized = value.normalize('NFKC');
    ensure(!/(?:1[3-9][\s-]?\d(?:[\s-]?\d){8})|(?:微\s*信|wechat|vx|qq|手机号|电话|加我)\s*[:：号]?\s*[a-zA-Z0-9_-]{3,}/i.test(normalized), 400, 'CONTACT_BLOCKED', '请勿在商品内容中发布联系方式');
    ensure(!['枪支', '毒品', '假证', '代考', '管制刀具'].some(word => normalized.includes(word)), 400, 'CONTENT_BLOCKED', '商品内容包含禁止发布的信息');
}
export function validateProduct(body: Record<string, unknown>): ProductInput {
    const title = text(body.title, '标题', 2, 50), description = text(body.description, '描述', 1, 2000);
    ensure(typeof body.priceCents === 'number' && Number.isSafeInteger(body.priceCents) && body.priceCents >= 0 && body.priceCents <= 100000000, 400, 'INVALID_INPUT', '价格应为0～1000000元，以整数分提交');
    const categoryId = id(body.categoryId);
    ensure(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'].includes(String(body.condition)), 400, 'INVALID_INPUT', '请选择有效的新旧程度');
    ensure(Array.isArray(body.imageIds) && body.imageIds.length >= 1 && body.imageIds.length <= 9, 400, 'INVALID_INPUT', '请上传1～9张图片');
    const imageIds = body.imageIds.map(id);
    ensure(new Set(imageIds).size === imageIds.length, 400, 'INVALID_INPUT', '图片不能重复');
    checkContent(title + ' ' + description);
    return { title, description, priceCents: body.priceCents, categoryId, condition: body.condition as ProductInput['condition'], imageIds };
}
export function nextProductState(state: string, action: string): ProductStatus {
    const transitions: Record<string, Record<string, ProductStatus>> = {
        PENDING: { EDIT: 'PENDING', APPROVE: 'ON_SALE', REJECT: 'REJECTED' },
        ON_SALE: { EDIT: 'PENDING', TAKE_DOWN: 'OFF_SHELF' },
        REJECTED: { EDIT: 'PENDING', SUBMIT: 'PENDING' },
        OFF_SHELF: { EDIT: 'PENDING', SUBMIT: 'PENDING' }
    };
    const result = transitions[state]?.[action];
    ensure(result, 409, 'INVALID_STATE', '当前商品状态不允许此操作');
    return result;
}
export function validateImage(base64: unknown, contentType: unknown): {
    bytes: Buffer;
    extension: string;
    contentType: string;
} {
    ensure(typeof base64 === 'string' && base64.length <= 7000000 && /^[A-Za-z0-9+/]*={0,2}$/.test(base64) && base64.length % 4 === 0, 400, 'INVALID_IMAGE', '图片编码无效或超过5MB');
    const bytes = Buffer.from(base64, 'base64');
    ensure(bytes.length > 16 && bytes.length <= 5 * 1024 * 1024, 400, 'INVALID_IMAGE', '图片应小于等于5MB');
    const kind = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? ['image/png', 'png']
        : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9 ? ['image/jpeg', 'jpg']
            : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? ['image/webp', 'webp'] : null;
    ensure(kind && contentType === kind[0], 400, 'INVALID_IMAGE', '只允许内容与类型一致的PNG、JPEG或WebP图片');
    return { bytes, extension: kind[1], contentType: kind[0] };
}
