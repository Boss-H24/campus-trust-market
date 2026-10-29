import { writeFileSync } from 'node:fs';
const ref = name => ({ $ref: '#/components/schemas/' + name });
const string = { type: 'string' }, identifier = { type: 'string', pattern: '^[1-9][0-9]{0,18}$' }, integer = { type: 'integer' }, object = (properties, required = []) => ({ type: 'object', properties, required }), array = items => ({ type: 'array', items });
const productStatus = { type: 'string', enum: ['PENDING', 'ON_SALE', 'REJECTED', 'OFF_SHELF', 'LOCKED', 'SOLD', 'FROZEN'] };
const schemas = {
    Error: object({ code: string, message: string, data: { type: 'null' }, requestId: { type: 'string', format: 'uuid' } }, ['code', 'message', 'data', 'requestId']),
    User: object({ id: identifier, nickname: string, avatarId: { anyOf: [identifier, { type: 'null' }] }, role: { enum: ['STUDENT', 'ADMIN'] }, status: { enum: ['ACTIVE', 'DISABLED'] }, certificationStatus: { enum: ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'] }, creditScore: { type: 'integer', minimum: 0, maximum: 100 }, school: string, maskedName: string, maskedPhone: string, maskedStudentId: string, rejectionReason: string, certificationId: { anyOf: [identifier, { type: 'null' }] } }, ['id', 'nickname', 'role', 'certificationStatus', 'creditScore']),
    Seller: object({ id: identifier, nickname: string, avatarId: { anyOf: [identifier, { type: 'null' }] }, certificationStatus: { enum: ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'] }, creditScore: integer, maskedName: string, maskedPhone: string }, ['id', 'nickname', 'certificationStatus', 'creditScore']),
    Session: object({ token: string, expiresIn: integer, user: ref('User') }, ['token', 'expiresIn', 'user']),
    ProductInput: object({ title: { type: 'string', minLength: 2, maxLength: 50 }, description: { type: 'string', minLength: 1, maxLength: 2000 }, priceCents: { type: 'integer', minimum: 0, maximum: 100000000 }, categoryId: identifier, condition: { enum: ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'] }, imageIds: { type: 'array', items: identifier, minItems: 1, maxItems: 9, uniqueItems: true } }, ['title', 'description', 'priceCents', 'categoryId', 'condition', 'imageIds']),
    Product: object({ id: identifier, sellerId: identifier, categoryId: identifier, title: string, description: string, priceCents: { type: 'integer', minimum: 0 }, condition: { enum: ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'] }, status: productStatus, rejectionReason: string, version: integer, imageIds: array(identifier), createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } }, ['id', 'sellerId', 'categoryId', 'title', 'description', 'priceCents', 'condition', 'status', 'version', 'imageIds']),
    ProductDetail: { allOf: [ref('Product'), object({ seller: ref('Seller') }, ['seller'])] },
    ProductList: object({ items: array(ref('Product')), total: integer, page: integer, pageSize: integer }, ['items', 'total', 'page', 'pageSize']),
    CertificationInput: object({ realName: { type: 'string', minLength: 2, maxLength: 30 }, studentId: { type: 'string', pattern: '^[A-Za-z0-9]{6,20}$' }, school: { type: 'string', description: '必须与服务端SCHOOL_NAME一致' }, phone: { type: 'string', pattern: '^1[3-9][0-9]{9}$' } }, ['realName', 'studentId', 'school', 'phone']),
    CertificationStatus: object({ id: { anyOf: [identifier, { type: 'null' }] }, status: { enum: ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'] }, rejectionReason: string, school: string, maskedName: string, maskedStudentId: string, maskedPhone: string }, ['status']),
    CertificationReview: object({ id: identifier, certificationId: identifier, version: integer, nickname: string, school: string, maskedName: string, maskedStudentId: string, maskedPhone: string }, ['id', 'certificationId', 'version', 'nickname', 'school']),
    AuditInput: { oneOf: [object({ action: { const: 'APPROVE' }, expectedVersion: {type:'integer',minimum:0} }, ['action','expectedVersion']), object({ action: { const: 'REJECT' }, reason: { type: 'string', minLength: 1, maxLength: 200 }, expectedVersion: {type:'integer',minimum:0} }, ['action', 'reason','expectedVersion'])] },
    Upload: object({ id: identifier, contentType: { enum: ['image/png', 'image/jpeg', 'image/webp'] }, byteSize: integer }, ['id', 'contentType', 'byteSize']),
    UploadInput: object({ base64: { type: 'string', contentEncoding: 'base64', maxLength: 7000000, description: '解码后≤5MiB，验证PNG/JPEG/WebP签名，非multipart' }, contentType: { enum: ['image/png', 'image/jpeg', 'image/webp'] } }, ['base64', 'contentType'])
};
const doc = { openapi: '3.1.0', info: { title: '校园拾集 成员A接口', version: '0.1.0', description: '已实现接口。B/C待实现契约见team-handoff.md。编号为字符串，金额为整数分。未认证可公开浏览，发布需实名认证且信誉≥60。' }, servers: [{ url: 'http://127.0.0.1:3000', description: '仅本地课堂开发' }], paths: {}, components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: '服务端生成的随机会话令牌，非JWT，有效7天' } }, schemas } };
const parameter = (name, schema, description = '', where = 'query', required = false) => ({ name, in: where, required, description, schema });
const idParameter = parameter('id', identifier, '资源编号', 'path', true);
const pagination = [parameter('page', { type: 'integer', minimum: 1, maximum: 10000, default: 1 }), parameter('pageSize', { type: 'integer', minimum: 1, maximum: 100, default: 20 })];
const filters = [...pagination, parameter('keyword', { type: 'string', maxLength: 50 }), parameter('categoryId', identifier), parameter('minPriceCents', { type: 'integer', minimum: 0 }), parameter('maxPriceCents', { type: 'integer', maximum: 100000000 }), parameter('status', productStatus, '公开范围仅允许ON_SALE')];
function add(path, method, summary, input, output, mode = 'user', parameters = [], status = 200) {
    const envelope = object({ code: { const: 0 }, message: string, data: output, requestId: { type: 'string', format: 'uuid' } }, ['code', 'message', 'data', 'requestId']);
    const operation = { summary, security: mode === 'public' ? [{}, { bearerAuth: [] }] : mode === 'none' ? [] : [{ bearerAuth: [] }], parameters, responses: { [status]: { description: '成功', content: { 'application/json': { schema: envelope } } }, default: { description: '失败；使用HTTP状态码400/401/403/404/409/413/429/500/502/503。code为稳定业务错误码。', content: { 'application/json': { schema: ref('Error') } } } } };
    if (mode === 'admin')
        operation['x-required-role'] = 'ADMIN';
    if (input)
        operation.requestBody = { required: true, content: { 'application/json': { schema: input } } };
    doc.paths[path] ||= {};
    doc.paths[path][method] = operation;
}
add('/api/health', 'get', '数据库健康与登录方式开关', null, object({ status: { const: 'ok' }, database: { const: 'mysql' }, demoLoginEnabled: { type: 'boolean' }, wechatLoginEnabled: { type: 'boolean' }, schoolName: string }), 'none');
add('/api/auth/login', 'post', '真实微信登录；未配置返回503', object({ code: { type: 'string', minLength: 1, maxLength: 200 } }, ['code']), ref('Session'), 'none');
add('/api/auth/dev-login', 'post', '本地虚构演示身份登录；生产关闭', object({ account: { enum: ['seller', 'buyer', 'newstudent', 'admin', 'outsider'] }, password: { type: 'string', writeOnly: true } }, ['account', 'password']), ref('Session'), 'none');
add('/api/auth/logout', 'post', '注销当前会话', null, { type: 'null' });
add('/api/users/me', 'get', '当前用户脱敏资料', null, ref('User'));
add('/api/users/me', 'patch', '更新昵称和本人上传的头像', object({ nickname: { type: 'string', minLength: 1, maxLength: 30 }, avatarId: { anyOf: [identifier, { type: 'null' }] } }, ['nickname']), ref('User'));
add('/api/certifications', 'post', '学籍匹配后提交人工审核', ref('CertificationInput'), object({ id: identifier, status: { const: 'PENDING' } }, ['id', 'status']), 'user', [], 201);
add('/api/certifications/status', 'get', '本人认证状态与脱敏资料', null, ref('CertificationStatus'));
add('/api/admin/certifications', 'get', '待审认证队列，最多100条', null, object({ items: array(ref('CertificationReview')) }, ['items']), 'admin');
add('/api/admin/certifications/{id}/audit', 'post', '审核认证，拒绝重复审核', ref('AuditInput'), object({ id: identifier, status: { enum: ['VERIFIED', 'REJECTED'] } }), 'admin', [idParameter]);
add('/api/categories', 'get', '有效商品分类', null, object({ items: array(object({ id: identifier, name: string }, ['id', 'name'])) }, ['items']), 'public');
add('/api/uploads', 'post', '上传商品图片或头像', ref('UploadInput'), ref('Upload'), 'user', [], 201);
doc.paths['/api/media/{id}'] = { get: { summary: '读取图片；待审核资源仅本人/管理员，公开商品图片可匿名读取', security: [{}, { bearerAuth: [] }], parameters: [idParameter], responses: { 200: { description: '禁止缓存，按实际内容类型返回二进制图片', content: { 'image/png': { schema: { type: 'string', format: 'binary' } }, 'image/jpeg': { schema: { type: 'string', format: 'binary' } }, 'image/webp': { schema: { type: 'string', format: 'binary' } } } }, default: { description: '无权访问时404', content: { 'application/json': { schema: ref('Error') } } } } } };
add('/api/products', 'get', '分页检索公开或本人商品', null, ref('ProductList'), 'public', [...filters, parameter('scope', { enum: ['public', 'mine', 'admin'], default: 'public' }, 'mine要求登录，admin要求管理员')]);
add('/api/admin/products', 'get', '管理员商品队列', null, ref('ProductList'), 'admin', [...filters, parameter('moderationFrozen',{const:'1'},'筛选冻结商品，包含订单锁定中的监管冻结')]);
add('/api/products', 'post', '实名卖家发布，事务中去重限流', ref('ProductInput'), ref('ProductDetail'), 'user', [], 201);
add('/api/products/{id}', 'get', '查看商品及脱敏卖家；未公开商品仅本人/管理员', null, ref('ProductDetail'), 'public', [idParameter]);
add('/api/products/{id}', 'put', '完整更新商品，保存后重新审核', ref('ProductInput'), ref('ProductDetail'), 'user', [idParameter]);
add('/api/products/{id}/status', 'put', '卖家下架或重新提交，不能赋值任意状态', object({ action: { enum: ['TAKE_DOWN', 'SUBMIT'] } }, ['action']), ref('ProductDetail'), 'user', [idParameter]);
add('/api/products/{id}/audit', 'post', '管理员审核商品', ref('AuditInput'), ref('ProductDetail'), 'admin', [idParameter]);
doc.info = { title: '校园拾集 A/C接口', version: '0.2.0', description: 'A用户商品及C咨询监管已实现；B订单及信誉服务按交接契约接入。成立举报在B服务缺失时返回503并回滚。' };
const paged = item => object({ items: array(item), total: integer, page: integer, pageSize: integer }, ['items','total','page','pageSize']);
const conversation = object({ id: identifier, productId: identifier, buyerId: identifier, sellerId: identifier, productTitle: string, peerName: string, lastMessage: string }, ['id','productId','buyerId','sellerId']);
const message = object({ id: identifier, conversationId: identifier, senderId: identifier, clientMessageId: string, content: string, createdAt: {type:'string',format:'date-time'} }, ['id','conversationId','senderId','clientMessageId','content']);
const messages = object({ items: array(message), nextAfterId: string, hasMore: {type:'boolean'} }, ['items','nextAfterId','hasMore']);
const report = object({ id:identifier,targetType:{enum:['PRODUCT','USER']},targetId:identifier,reason:string,description:string,status:{enum:['PENDING','INVESTIGATING','UPHELD','REJECTED','CLOSED']},decision:{enum:['UPHELD','REJECTED',null]},action:{enum:['NONE','TAKE_DOWN','FREEZE_PRODUCT','DISABLE_USER']},resolutionReason:string,version:integer,createdAt:string,updatedAt:string }, ['id','targetType','targetId','status','version']);
const afterId = parameter('afterId',{type:'string',pattern:'^(0|[1-9][0-9]{0,18})$'},'递增消息ID；每次最多50条，hasMore时继续读取');
const productIdParameter = parameter('productId',identifier,'商品编号','path',true);
const ruleSchema = object({key:string,value:{oneOf:[integer,array(string)]},version:integer},['key','value','version']);
const reasonInput = {type:'string',minLength:1,maxLength:200};
add('/api/conversations','post','创建或复用咨询，拒绝自聊',object({productId:identifier},['productId']),conversation,'user',[],201);
add('/api/conversations','get','本人参与的咨询列表',null,paged(conversation),'user',pagination);
add('/api/conversations/{id}/messages','get','参与者增量读取消息',null,messages,'user',[idParameter,afterId]);
add('/api/conversations/{id}/messages','post','参与者发送；同键同内容幂等，同键异内容409',object({clientMessageId:{type:'string',pattern:'^[A-Za-z0-9_-]{1,80}$'},content:{type:'string',minLength:1,maxLength:1000}},['clientMessageId','content']),message,'user',[idParameter],201);
for(const method of ['put','delete']) add('/api/favorites/{productId}',method,'幂等'+(method==='put'?'收藏':'取消收藏'),null,object({productId:identifier,favorited:{type:'boolean'}}),'user',[productIdParameter]);
add('/api/favorites','get','本人收藏，下架及冻结商品标记不可用',null,paged(object({productId:identifier,title:string,priceCents:integer,status:productStatus,available:{type:'boolean'},coverId:{anyOf:[identifier,{type:'null'}]}})),'user',pagination);
add('/api/reports','post','举报商品或用户，禁止自举报及重复待处理工单',object({targetType:{enum:['PRODUCT','USER']},targetId:identifier,reason:{type:'string',minLength:1,maxLength:100},description:{type:'string',maxLength:1000}},['targetType','targetId','reason']),report,'user',[],201);
add('/api/reports','get','仅查看本人举报结果',null,paged(report),'user',pagination);
add('/api/admin/reports','get','管理员举报队列',null,paged({allOf:[report,object({reporterId:identifier,targetUserId:identifier})]}),'admin',[...pagination,parameter('status',{enum:['PENDING','INVESTIGATING','UPHELD','REJECTED','CLOSED']})]);
add('/api/admin/reports/{id}/resolve','post','成立/驳回；同一事务调用B信誉服务，重复409',object({decision:{enum:['UPHELD','REJECTED']},action:{enum:['NONE','TAKE_DOWN','FREEZE_PRODUCT','DISABLE_USER']},reason:reasonInput},['decision','action','reason']),report,'admin',[idParameter]);
add('/api/admin/reports/{id}','patch','进入调查或关闭已处理工单',object({action:{enum:['INVESTIGATE','CLOSE']},expectedVersion:integer},['action','expectedVersion']),report,'admin',[idParameter]);
add('/api/admin/reports/{id}/evidence','get','仅查阅举报双方且与商品相关的会话，逐次记审计',null,{oneOf:[object({conversations:array(object({id:identifier,productId:identifier}))}),messages]},'admin',[idParameter,parameter('conversationId',identifier),afterId]);
add('/api/admin/users','get','脱敏学生账号分页',null,paged(object({id:identifier,nickname:string,status:{enum:['ACTIVE','DISABLED']},creditScore:integer,certificationStatus:string})),'admin',pagination);
add('/api/admin/users/{id}','patch','禁用/恢复学生账号，禁用撤销会话；禁止role/creditScore赋值',object({action:{enum:['DISABLE','ENABLE']},reason:reasonInput},['action','reason']),object({id:identifier,status:string}),'admin',[idParameter]);
add('/api/admin/products/{id}/moderation','post','解除冻结，回到下架或保留订单锁定，不直接上架',object({action:{const:'UNFREEZE'},expectedVersion:integer,reason:reasonInput},['action','expectedVersion','reason']),object({id:identifier,moderationFrozen:{const:false}}),'admin',[idParameter]);
const category = object({id:identifier,name:{type:'string',minLength:1,maxLength:30},active:{type:'boolean'}});
add('/api/admin/categories','get','包含停用项的分类列表',null,object({items:array(category)}),'admin');
add('/api/admin/categories','post','新增分类',object({name:{type:'string',minLength:1,maxLength:30}},['name']),category,'admin',[],201);
add('/api/admin/categories','patch','改名/停用分类，保留已引用记录',object(category.properties,['id','name','active']),category,'admin');
add('/api/admin/rules','get','平台规则及版本',null,object({items:array(ruleSchema)}),'admin');
add('/api/admin/rules/{key}','patch','更新关键词/发布及消息举报频率/发布信誉门槛；版本冲突409',object({value:{oneOf:[integer,array(string)]},expectedVersion:integer},['value','expectedVersion']),ruleSchema,'admin',[parameter('key',{enum:['blocked_keywords','publish_per_minute','messages_per_minute','reports_per_minute','publish_min_credit']},'规则名称','path',true)]);
add('/api/admin/logs','get','操作日志固定字段分页，不返回自由文本details',null,paged(object({id:identifier,actorId:identifier,action:string,target:string,createdAt:string})),'admin',pagination);
schemas.Product.properties.moderationFrozen = {type:'boolean'};
writeFileSync('docs/openapi.json', JSON.stringify(doc, null, 2) + '\n');
console.log('OpenAPI 已生成：' + Object.values(doc.paths).reduce((n, path) => n + Object.keys(path).length, 0) + '个操作。');
