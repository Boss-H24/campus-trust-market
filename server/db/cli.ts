import { getConfig } from '../config.ts';
import { createPool } from './database.ts';
import { migrate } from './migrate.ts';
import { seed } from './seed.ts';
const config = getConfig(), pool = createPool(config);
try {
    if (process.argv[2] === 'migrate')
        await migrate(pool);
    else if (process.argv[2] === 'seed')
        await seed(pool, config);
    else
        throw new Error('用法：cli.ts migrate|seed');
    console.log('数据库操作完成');
}
finally {
    await pool.end();
}
