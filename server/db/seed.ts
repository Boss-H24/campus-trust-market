import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from 'mysql2/promise';
import type { Config } from '../config.ts';
import { PrivacyService } from '../common/privacy.ts';
import { rows, run, transaction } from './database.ts';
export const DEMO_USERS = [
    { account: 'seller', nickname: '陈同学', studentId: '2023000001', phone: '13800000001', verified: true },
    { account: 'buyer', nickname: '周同学', studentId: '2023000002', phone: '13800000002', verified: true },
    { account: 'admin', nickname: '平台管理员', studentId: '2023000003', phone: '13800000003', verified: true },
    { account: 'newstudent', nickname: '林同学', studentId: '2023000004', phone: '13800000004', verified: false },
    { account: 'outsider', nickname: '访客同学', studentId: '2023000005', phone: '13800000005', verified: false }
];
export async function seed(pool: Pool, config: Config): Promise<void> {
    if (!config.demoEnabled)
        throw new Error('种子数据仅允许在演示模式创建');
    const privacy = new PrivacyService(config.encryptionKey, config.identityKey);
    await mkdir(config.uploadDir, { recursive: true });
    await transaction(pool, async (db) => {
        for (const [index, name] of ['教材资料', '数码电子', '生活用品', '运动器材', '其他闲置'].entries())
            await run(db, 'INSERT IGNORE INTO category (id,name) VALUES (?,?)', [index + 1, name]);
        for (const user of DEMO_USERS) {
            const existing = await rows(db, 'SELECT id FROM app_user WHERE demo_account=?', [user.account]);
            if (existing.length)
                continue; // 再次 seed 不覆盖组员的业务数据或认证结果。
            const result = await run(db, 'INSERT INTO app_user (demo_account,nickname,role,certification_status) VALUES (?,?,?,?)', [user.account, user.nickname, user.account === 'admin' ? 'ADMIN' : 'STUDENT', user.verified ? 'VERIFIED' : 'UNVERIFIED']);
            const studentHash = privacy.identityHash(config.schoolName, user.studentId);
            if (user.account !== 'outsider')
                await run(db, 'INSERT IGNORE INTO student_roster (student_id_hash,name_hash) VALUES (?,?)', [studentHash, privacy.identityHash(config.schoolName + ':name', user.nickname)]);
            if (user.verified)
                await run(db, "INSERT INTO user_certification (user_id,student_id_hash,school,real_name_enc,student_id_enc,phone_enc,status) VALUES (?,?,?,?,?,?,'VERIFIED')", [result.insertId, studentHash, config.schoolName, privacy.encrypt(user.nickname), privacy.encrypt(user.studentId), privacy.encrypt(user.phone)]);
        }
        const existingProducts = await rows(db, 'SELECT id FROM product LIMIT 1');
        if (!existingProducts.length) {
            const [seller] = await rows(db, "SELECT id FROM app_user WHERE demo_account='seller'");
            // 摄影素材随仓库保存，初始化离线可用；只为空库创建，不覆盖组员商品。
            const products = [['高等数学学习笔记', '每章都有整理，适合期末复习。校内当面交接。', 1800, 1], ['宿舍阅读台灯', '三档亮度，功能完好，附原装充电线。', 3500, 3], ['羽毛球拍一对', '课程结束转让，握把已更换。', 5000, 4], ['机械键盘', '宿舍自用，按键正常，已清洁。', 12000, 2]] as const;
            for (const [index, item] of products.entries()) {
                const filename = randomUUID() + '.jpg';
                const photo = ['notebook.jpg', 'lamp.jpg', 'racket.jpg', 'keyboard.jpg'][index];
                const bytes = await readFile(join('assets', 'demo-products', photo));
                await writeFile(join(config.uploadDir, filename), bytes);
                const asset = await run(db, "INSERT INTO upload_asset (owner_id,storage_key,content_type,byte_size) VALUES (?,?,'image/jpeg',?)", [seller.id, filename, bytes.length]);
                const description = item[1] + '\n\n课堂演示样图：图片为授权摄影素材，非本组实物拍摄。';
                const product = await run(db, "INSERT INTO product (seller_id,category_id,title,normalized_title,description,price_cents,condition_label,status,created_at) VALUES (?,?,?,?,?,?,'GOOD','ON_SALE',DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 7 DAY))", [seller.id, item[3], item[0], item[0], description, item[2]]);
                await run(db, 'INSERT INTO product_image (product_id,asset_id,sort_order) VALUES (?,?,0)', [product.insertId, asset.insertId]);
            }
        }
    });
}
