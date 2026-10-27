import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'mysql2/promise';
import type { Config } from '../config.ts';
import type { Actor } from '../contracts.ts';
import { ensure, id, text, AppError } from '../common/errors.ts';
import { PrivacyService, maskName, maskPhone, maskStudentId } from '../common/privacy.ts';
import { audit, rows, run, transaction, type Row } from '../db/database.ts';
import { checkContent } from '../products/rules.ts';
import { UserRepository } from './repository.ts';
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
export class UserService {
    pool: Pool;
    config: Config;
    privacy: PrivacyService;
    repository: UserRepository;
    constructor(pool: Pool, config: Config) { this.pool = pool; this.config = config; this.privacy = new PrivacyService(config.encryptionKey, config.identityKey); this.repository = new UserRepository(pool); }
    present(user: Row, personal = true) {
        return { id: String(user.id), nickname: user.nickname, avatarId: user.avatarId ? String(user.avatarId) : null, role: personal ? user.role : undefined, status: personal ? user.status : undefined, certificationStatus: user.certificationStatus, creditScore: user.creditScore,
            maskedName: user.real_name_enc ? maskName(this.privacy.decrypt(user.real_name_enc)) : '', maskedPhone: user.phone_enc ? maskPhone(this.privacy.decrypt(user.phone_enc)) : '',
            ...(personal ? { school: user.school || '', maskedStudentId: user.student_id_enc ? maskStudentId(this.privacy.decrypt(user.student_id_enc)) : '', rejectionReason: user.rejectionReason || '', certificationId: user.certificationId ? String(user.certificationId) : null, certificationVersion: user.certificationVersion === null || user.certificationVersion === undefined ? null : Number(user.certificationVersion) } : {}) };
    }
    async me(userId: string) { return this.present(await this.repository.profile(userId)); }
    async createSession(userId: string) {
        const token = randomBytes(32).toString('base64url');
        await run(this.pool, 'INSERT INTO auth_session (user_id,token_hash,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 7 DAY))', [userId, hashToken(token)]);
        return { token, expiresIn: 7 * 24 * 60 * 60, user: await this.me(userId) };
    }
    async devLogin(body: Record<string, unknown>) {
        ensure(this.config.demoEnabled, 404, 'NOT_FOUND', '当前环境未启用演示登录');
        const account = text(body.account, '演示账号', 1, 40), password = text(body.password, '演示密码', 1, 200);
        const expected = Buffer.from(this.config.demoPassword), actual = Buffer.from(password);
        ensure(actual.length === expected.length && timingSafeEqual(actual, expected), 401, 'LOGIN_FAILED', '账号或密码错误');
        const [user] = await rows(this.pool, 'SELECT id,status FROM app_user WHERE demo_account=?', [account]);
        ensure(user, 401, 'LOGIN_FAILED', '账号或密码错误');
        ensure(user.status === 'ACTIVE', 403, 'ACCOUNT_DISABLED', '账号已禁用');
        return this.createSession(String(user.id));
    }
    async wechatLogin(body: Record<string, unknown>) {
        ensure(this.config.wechatAppId && this.config.wechatAppSecret, 503, 'WECHAT_NOT_CONFIGURED', '请先配置小程序AppID和服务端AppSecret');
        const code = text(body.code, '微信登录凭证', 1, 200);
        const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
        url.search = new URLSearchParams({ appid: this.config.wechatAppId, secret: this.config.wechatAppSecret, js_code: code, grant_type: 'authorization_code' }).toString();
        let data: {
            openid?: string;
            errcode?: number;
        };
        try {
            const result = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!result.ok)
                throw new Error('upstream');
            data = await result.json() as typeof data;
        }
        catch {
            throw new AppError(502, 'WECHAT_UNAVAILABLE', '微信登录服务暂不可用，请稍后重试');
        }
        ensure(data.openid && !data.errcode, 401, 'LOGIN_FAILED', '微信登录凭证无效，请重新登录');
        const openidHash = this.privacy.identityHash('wechat:openid', data.openid);
        await run(this.pool, "INSERT INTO app_user (openid_hash,nickname) VALUES (?,'校园同学') ON DUPLICATE KEY UPDATE id=id", [openidHash]);
        const [user] = await rows(this.pool, 'SELECT id,status FROM app_user WHERE openid_hash=?', [openidHash]);
        ensure(user.status === 'ACTIVE', 403, 'ACCOUNT_DISABLED', '账号已禁用');
        return this.createSession(String(user.id));
    }
    async logout(token: string) { await run(this.pool, 'DELETE FROM auth_session WHERE token_hash=?', [hashToken(token)]); }
    async update(actor: Actor, body: Record<string, unknown>) {
        const nickname = text(body.nickname, '昵称', 1, 30);
        checkContent(nickname);
        const avatarId = body.avatarId === null || body.avatarId === undefined ? null : id(body.avatarId);
        await transaction(this.pool, async (db) => {
            if (avatarId) {
                const [asset] = await rows(db, 'SELECT id FROM upload_asset WHERE id=? AND owner_id=?', [avatarId, actor.id]);
                ensure(asset, 403, 'ASSET_FORBIDDEN', '只能使用自己上传的头像');
            }
            await run(db, 'UPDATE app_user SET nickname=?,avatar_asset_id=? WHERE id=?', [nickname, avatarId, actor.id]);
            await audit(db, actor.id, 'PROFILE_UPDATED', actor.id);
        });
        return this.me(actor.id);
    }
    async submitCertification(actor: Actor, body: Record<string, unknown>) {
        ensure(actor.role === 'STUDENT', 403, 'FORBIDDEN', '管理员无需提交学生认证');
        const realName = text(body.realName, '姓名', 2, 30), studentId = text(body.studentId, '学号', 6, 20).normalize('NFKC'), school = text(body.school, '学校', 1, 100), phone = text(body.phone, '手机号', 11, 11);
        ensure(/^[A-Za-z0-9]+$/.test(studentId) && /^1[3-9]\d{9}$/.test(phone), 400, 'INVALID_INPUT', '请填写有效学号和手机号');
        ensure(school === this.config.schoolName, 400, 'ROSTER_MISMATCH', '仅限本校学籍认证');
        const studentHash = this.privacy.identityHash(school, studentId), nameHash = this.privacy.identityHash(school + ':name', realName);
        return transaction(this.pool, async (db) => {
            const [user] = await rows(db, 'SELECT certification_status,status FROM app_user WHERE id=? FOR UPDATE', [actor.id]);
            ensure(user.status === 'ACTIVE', 403, 'ACCOUNT_DISABLED', '账号已禁用');
            ensure(!['PENDING', 'VERIFIED'].includes(user.certification_status), 409, 'CERTIFICATION_EXISTS', '当前认证正在审核或已通过');
            const [roster] = await rows(db, 'SELECT student_id_hash FROM student_roster WHERE student_id_hash=? AND name_hash=? AND active=1', [studentHash, nameHash]);
            ensure(roster, 400, 'ROSTER_MISMATCH', '姓名或学号与本校演示学籍不匹配');
            const [claimed] = await rows(db, 'SELECT user_id FROM user_certification WHERE student_id_hash=?', [studentHash]);
            ensure(!claimed || String(claimed.user_id) === actor.id, 409, 'STUDENT_ID_CLAIMED', '该学号已被其他账号使用');
            const [existing] = await rows(db, 'SELECT id FROM user_certification WHERE user_id=?', [actor.id]);
            const fields = [studentHash, school, this.privacy.encrypt(realName), this.privacy.encrypt(studentId), this.privacy.encrypt(phone)];
            if (existing)
                await run(db, "UPDATE user_certification SET student_id_hash=?,school=?,real_name_enc=?,student_id_enc=?,phone_enc=?,status='PENDING',rejection_reason='',reviewed_by=NULL,version=version+1 WHERE user_id=?", [...fields, actor.id]);
            else
                await run(db, "INSERT INTO user_certification (student_id_hash,school,real_name_enc,student_id_enc,phone_enc,status,user_id) VALUES (?,?,?,?,?,'PENDING',?)", [...fields, actor.id]);
            await run(db, "UPDATE app_user SET certification_status='PENDING' WHERE id=?", [actor.id]);
            await audit(db, actor.id, 'CERTIFICATION_SUBMITTED', actor.id);
            const [cert] = await rows(db, 'SELECT id,version FROM user_certification WHERE user_id=?', [actor.id]);
            return { id: String(cert.id), status: 'PENDING', version: Number(cert.version) };
        });
    }
    async certifications(actor: Actor) {
        ensure(actor.role === 'ADMIN', 403, 'FORBIDDEN', '需要管理员权限');
        const result = await rows(this.pool, "SELECT u.id,u.nickname,u.credit_score AS creditScore,u.certification_status AS certificationStatus,c.id AS certificationId,c.version AS certificationVersion,c.school,c.real_name_enc,c.phone_enc,c.student_id_enc,c.rejection_reason AS rejectionReason FROM user_certification c JOIN app_user u ON u.id=c.user_id WHERE c.status='PENDING' ORDER BY c.created_at,c.id LIMIT 100");
        return { items: result.map(row => ({ ...this.present(row), version: Number(row.certificationVersion) })) };
    }
    async auditCertification(actor: Actor, certificationId: string, body: Record<string, unknown>) {
        ensure(actor.role === 'ADMIN', 403, 'FORBIDDEN', '需要管理员权限');
        id(certificationId);
        ensure(body.action === 'APPROVE' || body.action === 'REJECT', 400, 'INVALID_INPUT', '请选择通过或驳回');
        ensure(Number.isSafeInteger(body.expectedVersion) && Number(body.expectedVersion) >= 0, 400, 'INVALID_INPUT', '请携带审核版本并刷新列表');
        const reason = body.action === 'REJECT' ? text(body.reason, '驳回理由', 1, 200) : '';
        return transaction(this.pool, async (db) => {
            const [ref] = await rows(db, 'SELECT user_id FROM user_certification WHERE id=?', [certificationId]);
            ensure(ref, 404, 'NOT_FOUND', '认证记录不存在');
            const [user] = await rows(db, 'SELECT status FROM app_user WHERE id=? FOR UPDATE', [ref.user_id]);
            ensure(user.status === 'ACTIVE', 409, 'ACCOUNT_DISABLED', '该用户已禁用');
            const [cert] = await rows(db, 'SELECT status,version FROM user_certification WHERE id=? FOR UPDATE', [certificationId]);
            ensure(cert.status === 'PENDING', 409, 'INVALID_STATE', '该认证已处理，请刷新');
            ensure(Number(cert.version) === body.expectedVersion, 409, 'STALE_REVIEW', '资料已更新，请刷新后重新审核');
            const status = body.action === 'APPROVE' ? 'VERIFIED' : 'REJECTED';
            await run(db, 'UPDATE user_certification SET status=?,rejection_reason=?,reviewed_by=?,version=version+1 WHERE id=?', [status, reason, actor.id, certificationId]);
            await run(db, 'UPDATE app_user SET certification_status=? WHERE id=?', [status, ref.user_id]);
            await audit(db, actor.id, 'CERTIFICATION_' + body.action, certificationId);
            return { id: certificationId, status };
        });
    }
}
