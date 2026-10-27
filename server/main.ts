import { getConfig } from './config.ts';
import { createPool } from './db/database.ts';
import { createApp } from './app.ts';
const config = getConfig(), pool = createPool(config);
await pool.query('SELECT 1');
const server = createApp(config, pool).listen(config.port, config.host, () => console.log(`校园拾集服务已启动：http://${config.host}:${config.port}/api/health`));
for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => { server.close(() => { void pool.end().then(() => process.exit(0)); }); });
