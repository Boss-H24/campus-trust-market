# 成员 A 实现说明

## 与教材和交接材料的对应

需求资料确定业务范围；设计资料确定微信小程序、MySQL、三层结构和业务状态。当前实现用 TypeScript 的 Service/Repository 类体现对象封装，Controller 只负责鉴权、取参和响应。技术路线与教材中的语言选择、模块独立性、UML和测试方法相配合，教材不作为具体框架版本的强制来源。

```mermaid
flowchart LR
  UI[微信原生小程序] --> API[Controller 路由与鉴权]
  API --> USERS[UserService]
  API --> GOODS[ProductService]
  USERS --> UR[UserRepository]
  GOODS --> PR[ProductRepository]
  UR --> DB[(MySQL InnoDB)]
  PR --> DB
  GOODS --> MEDIA[私有图片存储]
```

## 数据关系

```mermaid
erDiagram
  app_user ||--o{ auth_session : owns
  app_user ||--o| user_certification : submits
  student_roster ||--o| user_certification : matches_hash
  app_user ||--o{ product : publishes
  category ||--o{ product : contains
  app_user ||--o{ upload_asset : uploads
  product ||--|{ product_image : contains
  upload_asset ||--o{ product_image : referenced_by
  app_user ||--o{ operation_log : performs
```

`student_roster` 与认证记录通过 HMAC 学号索引业务关联，不将明文学号用作外键。用户 `avatar_asset_id` 由服务端校验所有权。订单、评价、聊天、收藏、举报和信誉事件表由 B/C 各自迁移添加，避免提交未使用的空业务结构。

| 表 | 主要数据与约束 |
|---|---|
| app_user | bigint主键；openid哈希、演示账号分别唯一；role/status/certification_status；信誉0～100 |
| auth_session | 令牌SHA-256唯一；关联用户；7天有效；注销即删除 |
| student_roster | 学校+学号HMAC主键，姓名HMAC；仅虚构学籍 |
| user_certification | user_id与student_id_hash分别唯一；姓名、学号、电话AES-GCM加密；审核人及理由 |
| category | 分类名称唯一，active用于停用 |
| product | 外键卖家、分类；整数分价格；状态、版本、规范化标题及去重索引 |
| upload_asset/product_image | 上传归属与随机存储名；商品图片排序；发布前验证所有权 |
| operation_log | 操作者、业务动作、目标与非敏感元数据；不记录表单原文 |
| schema_migration | 迁移名称与SHA-256；已应用文件不可改写 |

## 审核与状态

认证：UNVERIFIED → PENDING → VERIFIED/REJECTED；REJECTED 可以重提。提交先匹配演示学籍，再进入人工审核；这不代表接入学校真实认证系统。学号不可被其他账号重复占用。重提和审核递增版本，管理员必须提交自己看到的expectedVersion，禁止旧列表批准新资料。商品审核同样检查版本。

商品初始 PENDING；审核 APPROVE → ON_SALE、REJECT → REJECTED。ON_SALE 可 TAKE_DOWN → OFF_SHELF；REJECTED/OFF_SHELF 可 SUBMIT → PENDING。编辑允许 PENDING/ON_SALE/REJECTED/OFF_SHELF，保存后均重审。LOCKED/SOLD/FROZEN 不允许卖家修改。

```mermaid
sequenceDiagram
  participant S as 学生
  participant A as 后端
  participant D as MySQL
  participant M as 管理员
  S->>A: 提交实名资料
  A->>D: 学籍HMAC匹配、唯一性检查
  A->>D: 加密存储、状态PENDING、操作日志
  M->>A: 审核通过
  A->>D: 认证状态VERIFIED
  S->>A: 上传图片并发布
  A->>D: 事务锁卖家、去重、写商品PENDING
  M->>A: 审核商品通过
  A->>D: 状态ON_SALE、版本递增
  S->>A: 公开检索商品
  A-->>S: 商品与脱敏卖家信息
```

## 安全规则与已知边界

- AES-256-GCM使用每次随机IV和认证标签；学号唯一索引用独立HMAC密钥，原始身份不参与公开接口。更换加密密钥会使旧密文不可解密，需备份本地配置。
- 姓名保留首字，其余星号；11位电话前三后四；本人学号前四后两。短字符串全遮盖。公开卖家不返回学号。
- 上传仅接受PNG/JPEG/WebP，验证类型、文件签名和5MiB限制；不支持SVG/HTML。文件不按用户文件名存储。审核前仅本人/管理员读取，公开商品图片才可匿名读取，响应禁止缓存。
- 商品编辑、审核和上下架由后端动作表决定。卖家行锁保证同一卖家的去重和限流原子性，商品行锁串行化修改。B 的下单事务必须使用相同行和版本机制。
- 24小时相同卖家、规范化标题、价格视为重复；每分钟最多成功发布5件；信誉低于60禁止发布。入口登录30次/分钟、实名10次/分钟、上传60次/分钟。
- 联系方式/违禁词检查是明确词表和模式匹配，存在同音字、图中文字等识别边界，需管理员审核，不能宣称自动鉴别所有虚假交易。
- 入口限流为单进程内存实现；发布限流与去重在数据库事务中。多实例生产部署应把入口限流迁到网关，增加存储配额、HTTPS及运维监控。

## 对交接材料的修正

1. 订单简版状态与详细设计不一致：以详细动作链为准，订单功能留给B，当前只冻结枚举和测试契约。
2. 已付款直接取消存在资金语义冲突：统一经过模拟退款后取消。
3. 数据库只有表名：本阶段补齐A涉及的字段、唯一键、外键和版本索引。
4. 性能2秒/3秒表述不同：本地检索采用p95≤2秒目标，明确数据量与测试范围。
5. 原材料的“个人项目”措辞不适合小组：采用三人模块责任与PR复核。
6. 顶层DFD中数据库被视为外部参与者不适合当前系统边界；本阶段用体系结构图和数据关系图明确数据库属于系统内部存储，未改写原DOCX。
