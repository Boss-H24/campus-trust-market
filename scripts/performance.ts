import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { getConfig } from '../server/config.ts';
import { createPool, transaction, run, rows } from '../server/db/database.ts';
import { migrate } from '../server/db/migrate.ts';
import { seed } from '../server/db/seed.ts';
import { createApp } from '../server/app.ts';
const config = getConfig();
if(process.env.TEST_DB_NAME!==config.database+'_test')throw new Error('性能测试需要独立的项目_test数据库');
config.database=process.env.TEST_DB_NAME!;
const pool=createPool(config);
await migrate(pool);await seed(pool,config);
const fixtureIds:string[]=[];
await transaction(pool,async db=>{
  const [seller]=await rows(db,"SELECT id FROM app_user WHERE demo_account='seller'");
  for(let i=0;i<200;i++){
    const title='性能测试教材样例'+i;
    const result=await run(db,"INSERT INTO product (seller_id,category_id,title,normalized_title,description,price_cents,condition_label,status,created_at) VALUES (?,1,?,?,?,?,'GOOD','ON_SALE',DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY))",[seller.id,title,title,'用于固定数据规模的接口性能样例，测试后自动删除。',1000+i]);
    fixtureIds.push(String(result.insertId));
  }
});
const server = createApp(config, pool).listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string')
    throw new Error('未能启动测试服务');
const base = `http://127.0.0.1:${address.port}`;
try {
    await fetch(base + '/api/products').then(response => response.arrayBuffer());
    const measurements = await Promise.all(Array.from({ length: 100 }, async (_, index) => { const start = performance.now(); const response = await fetch(base + '/api/products?' + (index % 2 ? 'keyword=' + encodeURIComponent('教材') : 'page=1')); const result = await response.json() as {
        data?: {
            total: number;
        };
    }; return { ms: performance.now() - start, status: response.status, total: result.data?.total }; }));
    const sorted = measurements.map(m => m.ms).sort((a, b) => a - b);
    const [version] = await pool.query<any[]>('SELECT VERSION() AS version');
    const [count] = await pool.query<any[]>('SELECT COUNT(*) AS count FROM product');
    const report = { date: new Date().toISOString(), runtime: process.version, database: version[0].version, productCount: Number(count[0].count), concurrentRequests: 100, successfulRequests: measurements.filter(m => m.status === 200).length, p50Ms: Math.round(sorted[49] * 100) / 100, p95Ms: Math.round(sorted[94] * 100) / 100, maxMs: Math.round(sorted[99] * 100) / 100, targetP95Ms: 2000, passed: measurements.every(m => m.status === 200) && sorted[94] <= 2000, limits: '本地HTTP接口、当前种子数据规模；不代表真机页面、图片网络或校园生产负载性能。' };
    await mkdir('.artifacts', { recursive: true });
    await writeFile('.artifacts/performance.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed)
        process.exitCode = 1;
}
finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    if(fixtureIds.length)await pool.execute(`DELETE FROM product WHERE id IN (${fixtureIds.map(()=>'?').join(',')})`,fixtureIds);
    await pool.end();
}
