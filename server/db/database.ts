import mysql, { type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import type { Config } from '../config.ts';
export type Db = Pool | PoolConnection;
export type Row = RowDataPacket & Record<string, any>;
export function createPool(config: Config): Pool {
    return mysql.createPool({ host: config.dbHost, port: config.dbPort, user: config.dbUser, password: config.dbPassword, database: config.database, connectionLimit: 20, waitForConnections: true, supportBigNumbers: true, bigNumberStrings: true, timezone: 'Z', charset: 'utf8mb4', decimalNumbers: true, dateStrings: false });
}
export async function rows(db: Db, sql: string, params: any[] = []): Promise<Row[]> { const [result] = await db.execute<Row[]>(sql, params); return result; }
export async function run(db: Db, sql: string, params: any[] = []): Promise<ResultSetHeader> { const [result] = await db.execute<ResultSetHeader>(sql, params); return result; }
export async function transaction<T>(pool: Pool, operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await operation(connection);
        await connection.commit();
        return result;
    }
    catch (error) {
        await connection.rollback();
        throw error;
    }
    finally {
        connection.release();
    }
}
export async function audit(db: Db, actorId: string, action: string, target: string, details: Record<string, string> = {}): Promise<void> {
    await run(db, 'INSERT INTO operation_log (actor_id,action,target,details) VALUES (?,?,?,?)', [actorId, action, target, JSON.stringify(details)]);
}
