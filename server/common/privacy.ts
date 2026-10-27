import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
export const maskName = (value: string): string => value.length <= 1 ? '*'.repeat(value.length) : [...value][0] + '*'.repeat([...value].length - 1);
export const maskPhone = (value: string): string => value.length === 11 ? value.slice(0, 3) + '****' + value.slice(-4) : '*'.repeat(value.length);
export const maskStudentId = (value: string): string => value.length > 6 ? value.slice(0, 4) + '****' + value.slice(-2) : '*'.repeat(value.length);
export class PrivacyService {
    private key: Buffer;
    private indexKey: Buffer;
    constructor(key: string, indexKey: string) {
        if (!/^[a-f0-9]{64}$/i.test(key) || !/^[a-f0-9]{64}$/i.test(indexKey) || key === indexKey)
            throw new Error('需要两组不同的32字节隐私密钥');
        this.key = Buffer.from(key, 'hex');
        this.indexKey = Buffer.from(indexKey, 'hex');
    }
    encrypt(value: string): string {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', this.key, iv);
        const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64')).join('.');
    }
    decrypt(value: string): string {
        const [iv, tag, encrypted] = value.split('.').map(part => Buffer.from(part, 'base64'));
        const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    }
    identityHash(school: string, studentId: string): string {
        return createHmac('sha256', this.indexKey).update(JSON.stringify([school.normalize('NFKC').trim(), studentId.normalize('NFKC').trim()])).digest('hex');
    }
}
