import {readFileSync} from 'node:fs';
const api=JSON.parse(readFileSync('docs/openapi.json','utf8'));
const source=['server/app.ts','server/community/routes.ts'].map(path=>readFileSync(path,'utf8')).join('\n');
const actual=[...source.matchAll(/app\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)].map(([,method,path])=>method+' '+path.replace(/:([a-zA-Z]+)/g,'{$1}'));
const declared=Object.entries(api.paths).flatMap(([path,operations])=>Object.keys(operations).map(method=>method+' '+path));
for(const route of actual)if(!declared.includes(route))throw new Error('接口未记录到OpenAPI：'+route);
for(const route of declared)if(!actual.includes(route))throw new Error('OpenAPI包含未实现接口：'+route);
function check(value){if(!value||typeof value!=='object')return;if(value.$ref&&!api.components.schemas[value.$ref.split('/').pop()])throw new Error('未定义Schema：'+value.$ref);for(const child of Object.values(value))check(child);}
check(api);console.log(`接口契约检查通过：${actual.length}个已实现操作，引用均存在。`);
