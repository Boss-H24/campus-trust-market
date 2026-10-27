import type { Pool } from 'mysql2/promise';
import { rows } from '../db/database.ts';
import type { Actor } from '../contracts.ts';
export class UserRepository {
    pool: Pool;
    constructor(pool: Pool) { this.pool = pool; }
    async findBySession(tokenHash: string): Promise<Actor | undefined> {
        const [user] = await rows(this.pool, 'SELECT u.id,u.role,u.status,u.certification_status AS certificationStatus,u.credit_score AS creditScore FROM auth_session s JOIN app_user u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3)', [tokenHash]);
        return user as Actor | undefined;
    }
    async profile(userId: string) {
        const [user] = await rows(this.pool, 'SELECT u.id,u.nickname,u.avatar_asset_id AS avatarId,u.role,u.status,u.certification_status AS certificationStatus,u.credit_score AS creditScore,c.school,c.real_name_enc,c.phone_enc,c.student_id_enc,c.rejection_reason AS rejectionReason,c.id AS certificationId,c.version AS certificationVersion FROM app_user u LEFT JOIN user_certification c ON c.user_id=u.id WHERE u.id=?', [userId]);
        return user;
    }
}
