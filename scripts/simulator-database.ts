import assert from 'node:assert/strict';
import type {Pool} from 'mysql2/promise';
import type {Config} from '../server/config.ts';
export async function resetTestDatabase(pool:Pool,config:Config):Promise<void>{
  assert.equal(config.database,process.env.DB_NAME+'_test','只能重置本项目的独立测试库');
  const connection=await pool.getConnection();
  try{
    const [selected]=await connection.query<any[]>('SELECT DATABASE() AS name');
    assert.equal(selected[0].name,config.database);
    await connection.query('SET FOREIGN_KEY_CHECKS=0');
    for(const table of ['operation_log','product_image','product','upload_asset','user_certification','student_roster','auth_session','app_user','category'])await connection.query(`TRUNCATE TABLE ${table}`);
  }finally{await connection.query('SET FOREIGN_KEY_CHECKS=1');connection.release();}
}
