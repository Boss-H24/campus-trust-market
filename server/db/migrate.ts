import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Pool } from 'mysql2/promise';
import { rows, run } from './database.ts';
export async function migrate(pool: Pool): Promise<void> {
    const connection = await pool.getConnection();
    try {
        const lock = await rows(connection, "SELECT GET_LOCK(CONCAT(DATABASE(), '_migration'),30) AS acquired");
        if (Number(lock[0].acquired) !== 1)
            throw new Error('数据库迁移锁等待超时');
        await run(connection, 'CREATE TABLE IF NOT EXISTS schema_migration (name VARCHAR(100) PRIMARY KEY,checksum CHAR(64) NOT NULL,applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');
        for (const name of (await readdir(resolve('database/migrations'))).filter(name => name.endsWith('.sql')).sort()) {
            const sql = await readFile(resolve('database/migrations', name), 'utf8');
            const checksum = createHash('sha256').update(sql).digest('hex');
            const applied = await rows(connection, 'SELECT checksum FROM schema_migration WHERE name=?', [name]);
            if (applied.length) {
                if (applied[0].checksum !== checksum)
                    throw new Error(`已应用的迁移被修改：${name}`);
                continue;
            }
            for (const statement of sql.split(/;\s*(?:\n|$)/).filter(part => part.trim()))
                await run(connection, statement);
            await run(connection, 'INSERT INTO schema_migration (name,checksum) VALUES (?,?)', [name, checksum]);
        }
    }
    finally {
        await run(connection, "DO RELEASE_LOCK(CONCAT(DATABASE(), '_migration'))");
        connection.release();
    }
}
