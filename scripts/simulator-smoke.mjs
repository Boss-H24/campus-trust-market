import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import automator from '../.tools/automator/node_modules/miniprogram-automator/out/index.js';
import {getConfig} from '../server/config.ts';
import {createPool} from '../server/db/database.ts';
import {migrate} from '../server/db/migrate.ts';
import {seed} from '../server/db/seed.ts';
import {makeCover} from '../server/db/seed-covers.ts';
import {createApp} from '../server/app.ts';
import {resetTestDatabase} from './simulator-database.ts';

// 原生页面与真实接口验收；仅相册选择器提供确定的虚构图片，不模拟业务接口。
// 3000端口必须空闲：测试后端使用隔离_test库，永不修改演示库。
const config=getConfig();config.database=process.env.TEST_DB_NAME;
config.wechatAppId='';config.wechatAppSecret='';
assert.equal(config.database,process.env.DB_NAME+'_test');
const uploads=await mkdtemp(join(tmpdir(),'campus-simulator-'));config.uploadDir=uploads;
const pool=createPool(config);let server,mp;const steps=[],exceptions=[];
await mkdir('.artifacts',{recursive:true});
async function bounded(label,operation,timeout=30000){let timer;try{return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+'超时')),timeout);})]);}finally{clearTimeout(timer);}}
async function until(check,message,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await new Promise(resolve=>setTimeout(resolve,250));}throw new Error(message);}
async function pageAt(path){let page;await until(async()=>{page=await bounded('获取页面',()=>mp.currentPage(),8000);return page?.path===path;},'未进入页面 '+path);return page;}
async function tap(page,selector){const element=await page.$(selector);assert.ok(element,'找不到控件 '+selector);await element.tap();}
async function fill(page,field,value){const element=await page.$(`input[data-field="${field}"]`)||await page.$(`textarea[data-field="${field}"]`);assert.ok(element,'找不到输入框 '+field);await element.input(value);}
async function record(label,operation){await bounded(label,operation,45000);steps.push(label);console.log('PASS '+label);}
async function login(index){
  await mp.switchTab('/pages/profile/profile');let page=await pageAt('pages/profile/profile');
  await until(async()=>!(await page.data()).user||!!(await page.data()).user.id,'个人页尚未加载');
  if((await page.data()).user){await tap(page,'button.secondary');await until(async()=>!(await page.data()).user,'退出未完成');}
  await tap(page,'button.primary');page=await pageAt('pages/login/login');
  await until(async()=>(await page.data()).demoEnabled,'演示登录不可用');
  await (await page.$('picker')).trigger('change',{value:String(index)});
  await (await page.$('input')).input(config.demoPassword);
  await tap(page,'button[data-mode="demo"]');
  page=await pageAt('pages/profile/profile');await until(async()=>!!(await page.data()).user,'登录失败');return page;
}
async function openAdmin(mode){const profile=await login(3);const links=await profile.$$('.line');await links[2].tap();const page=await pageAt('pages/admin/admin');await until(async()=>!(await page.data()).loading,'审核页加载失败');if(mode==='products'){await (await page.$$('.tabs button'))[1].tap();await until(async()=>{const data=await page.data();return data.mode==='products'&&!data.loading&&data.items.length>0;},'商品队列加载失败');}else{await until(async()=>{const data=await page.data();return data.mode==='certifications'&&!data.loading&&data.items.length>0;},'认证队列加载失败');}return page;}
try{
  await migrate(pool);await resetTestDatabase(pool,config);await seed(pool,config);
  server=createApp(config,pool).listen(3000,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  mp=await bounded('连接模拟器',()=>automator.connect({wsEndpoint:'ws://127.0.0.1:9420'}));
  mp.on('exception',error=>exceptions.push(error.message||error.text||'小程序未处理异常'));
  await bounded('等待小程序运行时',()=>mp.currentPage(),15000);
  await mp.callWxMethod('removeStorageSync','token');await mp.callWxMethod('removeStorageSync','user');await mp.callWxMethod('removeStorageSync','editingProductId');
  await record('原生首页与真实商品数据',async()=>{const page=await mp.reLaunch('/pages/home/home');await until(async()=>(await page.data()).items.length===4,'首页商品未加载');assert.equal(await page.data('error'),'');await mp.screenshot({path:'.artifacts/simulator-home.png'});});
  await record('未认证学生通过真实登录页提交实名',async()=>{const profile=await login(2);assert.equal((await profile.data()).user.certificationStatus,'UNVERIFIED');await (await profile.$$('.line'))[0].tap();const page=await pageAt('pages/certification/certification');await fill(page,'realName','林同学');await fill(page,'studentId','2023000004');await fill(page,'phone','13800000004');await tap(page,'button.primary');await until(async()=>(await page.data()).status==='PENDING','实名提交失败');});
  await record('管理员在原生队列审核认证',async()=>{const page=await openAdmin('certifications');assert.equal((await page.data()).items.length,1);await tap(page,'.actions button.primary');await until(async()=>!(await page.data()).items.length,'实名审核失败');});
  let productId;
  const title='模拟器验收教材'+Date.now().toString(36);
  await record('原生相册回调、真实图片读取上传和发布',async()=>{
    await login(2);const page=await mp.switchTab('/pages/publish/publish');await until(async()=>(await page.data()).user?.certificationStatus==='VERIFIED','发布页认证未更新');
    const photo=await mp.evaluate(base64=>{const path=wx.env.USER_DATA_PATH+'/simulator-course-cover.png';wx.getFileSystemManager().writeFileSync(path,base64,'base64');return path;},makeCover(0).toString('base64'));
    await mp.mockWxMethod('chooseImage',{tempFilePaths:[photo],tempFiles:[{path:photo,size:makeCover(0).length}]});
    await tap(page,'.add-photo');await until(async()=>{const data=await page.data();return data.images.length===1&&!data.uploading;},'图片上传失败');await mp.restoreWxMethod('chooseImage');
    await fill(page,'title',title);await fill(page,'price','12.30');await fill(page,'description','软件工程课程教材，内页整洁，可在校内交接。');await mp.screenshot({path:'.artifacts/simulator-publish.png'});await tap(page,'button.primary');
    const detail=await pageAt('pages/detail/detail');await until(async()=>!!(await detail.data()).product,'商品详情未加载');const product=(await detail.data()).product;assert.equal(product.status,'PENDING');assert.equal(product.priceCents,1230);productId=product.id;await mp.screenshot({path:'.artifacts/simulator-pending.png'});
  });
  await record('管理员从真实页面审核商品上架',async()=>{const page=await openAdmin('products');assert.equal((await page.data()).items[0].id,productId);await mp.screenshot({path:'.artifacts/simulator-admin.png'});await tap(page,'.actions button.primary');await until(async()=>!(await page.data()).items.length,'商品审核失败');});
  await record('公开搜索、详情与卖家隐私脱敏',async()=>{
    const profile=await login(1);await tap(profile,'button.secondary');const page=await mp.switchTab('/pages/home/home');await (await page.$('.search-row input')).input(title);await tap(page,'.search-row button');await until(async()=>{const data=await page.data();return !data.loading&&data.items.length===1&&data.items[0].id===productId;},'搜索未返回已上架商品');await tap(page,'.product');const detail=await pageAt('pages/detail/detail');await until(async()=>!!(await detail.data()).product,'详情加载失败');const seller=(await detail.data()).product.seller;assert.equal(seller.maskedPhone,'138****0004');assert.equal(seller.studentId,undefined);await mp.screenshot({path:'.artifacts/simulator-public-detail.png'});
  });
  await record('卖家编辑后重新进入审核',async()=>{const profile=await login(2);await (await profile.$$('.line'))[1].tap();const mine=await pageAt('pages/mine/mine');await until(async()=>(await mine.data()).items.length===1,'我的商品未加载');await tap(mine,'.actions button.secondary');const edit=await pageAt('pages/publish/publish');await until(async()=>(await edit.data()).id===productId,'编辑队列未正确绑定账号');await fill(edit,'description','补充商品细节，保存后应重新审核。');await tap(edit,'button.primary');const detail=await pageAt('pages/detail/detail');await until(async()=>(await detail.data()).product?.status==='PENDING','编辑未重新审核');});
  await record('重新审核并由卖家下架',async()=>{const admin=await openAdmin('products');await tap(admin,'.actions button.primary');await until(async()=>!(await admin.data()).items.length,'再次审核失败');const profile=await login(2);await (await profile.$$('.line'))[1].tap();const mine=await pageAt('pages/mine/mine');await until(async()=>(await mine.data()).items[0]?.status==='ON_SALE','商品状态未更新');const actions=await mine.$$('.actions button.secondary');await actions[1].tap();await until(async()=>(await mine.data()).items[0]?.status==='OFF_SHELF','下架失败');await mp.screenshot({path:'.artifacts/simulator-mine.png'});});
  await record('下架商品不再公开展示',async()=>{const profile=await mp.switchTab('/pages/profile/profile');await until(async()=>!!(await profile.data()).user,'个人页未加载');await tap(profile,'button.secondary');const page=await mp.switchTab('/pages/home/home');await (await page.$('.search-row input')).input(title);await tap(page,'.search-row button');await until(async()=>!(await page.data()).loading&&(await page.data()).items.length===0,'下架商品仍被检索');});
  assert.equal(exceptions.length,0,'模拟器出现未处理异常');
  await writeFile('.artifacts/simulator-report.json',JSON.stringify({date:new Date().toISOString(),passed:true,steps,database:config.database,albumPicker:'提供虚构图片的相册回调；图像读取、压缩类型识别、上传和业务接口使用真实实现',unhandledExceptions:exceptions},null,2));
  console.log('Native simulator workflow passed: '+steps.length+' steps.');
}catch(error){console.error(error.stack);await writeFile('.artifacts/simulator-report.json',JSON.stringify({date:new Date().toISOString(),passed:false,steps,error:error.message},null,2));process.exitCode=1;}
finally{
  if(mp){await mp.restoreWxMethod('chooseImage').catch(()=>{});await mp.callWxMethod('removeStorageSync','token').catch(()=>{});await mp.callWxMethod('removeStorageSync','user').catch(()=>{});await mp.disconnect();}
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  await pool.end();assert.equal(dirname(resolve(uploads)),resolve(tmpdir()));await rm(uploads,{recursive:true,force:true});
}
