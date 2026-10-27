import { resolve } from 'node:path';
export type Config = {
    host: string;
    port: number;
    dbHost: string;
    dbPort: number;
    dbUser: string;
    dbPassword: string;
    database: string;
    encryptionKey: string;
    identityKey: string;
    demoEnabled: boolean;
    demoPassword: string;
    schoolName: string;
    wechatAppId: string;
    wechatAppSecret: string;
    uploadDir: string;
};
export function getConfig(): Config {
    const env = process.env;
    for (const key of ['DB_PASSWORD', 'ENCRYPTION_KEY', 'IDENTITY_HMAC_KEY'])
        if (!env[key])
            throw new Error(`缺少配置 ${key}，请先运行 setup.ps1`);
    const demoEnabled = env.DEMO_LOGIN_ENABLED === 'true' && env.NODE_ENV !== 'production';
    if (demoEnabled && (!env.DEMO_PASSWORD || env.DEMO_PASSWORD.length < 12))
        throw new Error('演示登录需要至少12字符的本地密码');
    if (env.NODE_ENV === 'production' && (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET))
        throw new Error('生产环境需要微信登录配置');
    return { host: env.HOST || '127.0.0.1', port: Number(env.PORT || 3000), dbHost: env.DB_HOST || '127.0.0.1', dbPort: Number(env.DB_PORT || 3307), dbUser: env.DB_USER || 'campus', dbPassword: env.DB_PASSWORD!, database: env.DB_NAME || 'campus_market', encryptionKey: env.ENCRYPTION_KEY!, identityKey: env.IDENTITY_HMAC_KEY!, demoEnabled, demoPassword: env.DEMO_PASSWORD || '', schoolName: env.SCHOOL_NAME || '演示大学', wechatAppId: env.WECHAT_APP_ID || '', wechatAppSecret: env.WECHAT_APP_SECRET || '', uploadDir: resolve(env.UPLOAD_DIR || '.runtime/uploads') };
}
