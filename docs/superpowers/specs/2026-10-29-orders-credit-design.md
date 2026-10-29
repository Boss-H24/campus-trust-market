# 成员 B：订单、评价与信誉设计规格

## 目标

在现有成员 A 工程上完成 `B-01` 至 `B-07`，交付可运行的“下单、模拟支付、接单、交割、确认、评价、信誉更新”闭环。订单、评价和信誉的每次状态变化必须由服务端事务控制，客户端只能提交业务动作、版本和幂等键。

## 交付范围

- 新增迁移 `database/migrations/003_b_orders.sql`，建立订单、订单状态日志、评价和信誉事件表。
- 实现订单仓储、订单服务和独立信誉服务，导出 `CreditService.applyEvent(db, input)` 供成员 C 使用。
- 实现冻结接口中的订单创建、列表、详情、支付、状态动作、确认收货和评价接口。
- 新增“我的订单”“订单详情”“评价记录”页面，并在商品详情和我的页面加入入口。
- 补充单元测试、真实 MySQL 集成测试、小程序页面测试、OpenAPI、状态时序图、测试报告和课堂演示步骤。

## 不包含

- 不接真实微信支付、银行卡或退款渠道；支付和退款均为课堂模拟。
- 不实现成员 C 的咨询、收藏、举报和监管工作台。
- 不依赖客户端传入金额、商品状态或目标订单状态。
- 不提供生产级定时任务调度；超时订单在访问订单接口时惰性处理，也可由测试直接触发同一服务方法。

## 架构

沿用现有 Controller -> Service -> Repository 分层：

- `OrderRepository`：订单及关联数据查询、行锁和状态日志写入。
- `OrderService`：权限、状态机、版本、幂等、超时、商品释放和评价编排。
- `CreditService`：事务内写唯一信誉事件并更新用户分数。
- `server/app.ts`：只负责鉴权中间件、参数接收、HTTP 状态码和统一响应。
- 小程序页面复用 `miniprogram/utils/api.js`，不拼接令牌或直接修改业务状态。

订单的全部写操作使用 `transaction()` 提供的同一 MySQL 连接。事务内先锁业务主行，再做资格、状态、所有权和版本检查，最后写状态、日志、商品和信誉数据。

## 数据模型

### `orders`

| 字段 | 约束与含义 |
|---|---|
| `id` | `BIGINT UNSIGNED` 主键 |
| `order_no` | 对外订单号，唯一，格式为 `CM` 加时间与随机大写字母数字 |
| `product_id` | 商品外键 |
| `buyer_id` / `seller_id` | 买卖双方外键 |
| `product_title` | 下单时商品标题快照 |
| `amount_cents` | 下单时价格快照，非负整数分 |
| `product_version` | 下单锁定时的商品版本快照 |
| `status` | 订单状态枚举 |
| `version` | 订单乐观锁版本，成功状态变化递增 |
| `buyer_request_id` | 买家创建订单幂等键 |
| `active_product_id` | 存储生成列；有效状态下等于 `product_id`，终态为 `NULL` |
| `created_at` / `updated_at` | 毫秒时间 |

唯一约束：

- `(buyer_id, buyer_request_id)`：同一买家重复请求只创建一笔订单。
- `UNIQUE(active_product_id)`：同一商品最多一笔有效订单。

有效状态包括 `PENDING_PAYMENT`、`PAID`、`PENDING_DELIVERY`、`IN_PROGRESS`、`PENDING_CONFIRMATION`、`DISPUTED`、`REFUNDING`。终态 `COMPLETED`、`CANCELLED` 不占用商品唯一键。

### `order_status_log`

保存 `order_id`、`from_status`、`to_status`、`action`、`actor_id`、`actor_role`、`request_id` 和创建时间。`actor_id` 可为空以表示系统动作，`actor_role` 为 `BUYER/SELLER/ADMIN/SYSTEM`。唯一约束 `(order_id, request_id)` 是业务动作幂等的最终防线；初始 `CREATE` 日志也写入该表。

### `evaluation`

保存订单、评价人、被评价人、1～5 星、可空评价正文和创建时间。唯一约束 `(order_id, reviewer_id)` 保证每方对同一订单只评价一次。公开查询按被评价人分页，不返回订单号、买家或卖家身份等交易内部字段。

### `credit_event`

保存用户、事件类型、业务来源和分值变化。唯一约束 `(event_type, source_id, user_id)` 保证完成、评价、举报或刷单事件只计分一次。信誉分仍存于 `app_user.credit_score`，任何调用方都不得绕过 `CreditService.applyEvent` 直接赋值。

## 状态机与权限

状态和动作唯一来源是 `server/contracts.ts` 的 `ORDER_TRANSITIONS`：

| 起始状态 | 动作 | 操作者 | 目标状态 |
|---|---|---|---|
| `PENDING_PAYMENT` | `PAY` | 买家 | `PAID` |
| `PENDING_PAYMENT` | `CANCEL` | 买家 | `CANCELLED` |
| `PENDING_PAYMENT` | `EXPIRE` | 系统/管理员模拟 | `CANCELLED` |
| `PAID` | `ACCEPT` | 卖家 | `PENDING_DELIVERY` |
| `PAID` / `PENDING_DELIVERY` | `REJECT` | 卖家 | `REFUNDING` |
| `PAID` / `PENDING_DELIVERY` | `REQUEST_REFUND` | 买家 | `REFUNDING` |
| `PENDING_DELIVERY` | `START_DELIVERY` | 卖家 | `IN_PROGRESS` |
| `IN_PROGRESS` | `MARK_DELIVERED` | 卖家 | `PENDING_CONFIRMATION` |
| `PENDING_CONFIRMATION` | `CONFIRM` | 买家 | `COMPLETED` |
| `IN_PROGRESS` / `PENDING_CONFIRMATION` | `OPEN_DISPUTE` | 买家 | `DISPUTED` |
| `DISPUTED` | `RESOLVE_COMPLETE` | 管理员 | `COMPLETED` |
| `DISPUTED` | `RESOLVE_REFUND` | 管理员 | `REFUNDING` |
| `REFUNDING` | `REFUND_SUCCEEDED` | 管理员模拟系统 | `CANCELLED` |

`REFUND_SUCCEEDED` 不是买家或卖家动作。课堂演示环境由管理员通过同一状态接口模拟系统退款成功，保留状态机、版本和幂等校验。

已付款订单 24 小时未接单时进入 `REFUNDING`；待付款订单 15 分钟后进入 `CANCELLED`。超时处理与用户动作共用状态日志和幂等规则。订单列表、详情及创建前调用带节流的惰性超时扫描。

## 下单事务

1. 校验登录、买家角色和 `requestId`；先按 `(buyer_id, requestId)` 查询，已存在则返回原订单。
2. 锁定买家行，再按固定顺序锁定买卖双方用户行。
3. 检查双方 `status='ACTIVE'`、`certification_status='VERIFIED'`，并拒绝自购。
4. 锁定商品行，检查卖家、`status='ON_SALE'` 和商品版本。
5. 使用 `UPDATE ... WHERE id=? AND status='ON_SALE' AND version=?` 条件更新为 `LOCKED` 并递增商品版本。
6. 插入订单、初始状态日志和审计日志；任一步失败全部回滚。

客户端只提交 `productId` 和 `requestId`。金额、标题和卖家编号全部从数据库读取并快照。

## 业务动作幂等

每次支付、状态动作和确认收货都要求 `requestId`。事务先锁订单，再查询 `(order_id, request_id)`：

- 相同请求、相同动作、相同操作者：直接返回当前订单，不再次写日志或计分。
- 相同请求但动作或操作者不同：返回 `409 IDEMPOTENCY_CONFLICT`。
- 新请求：校验 `version`、操作者、当前状态和动作，成功后订单版本与日志同时递增。

版本过期返回 `409 STALE_ORDER`；动作与角色不符返回 `403 ORDER_ACTION_FORBIDDEN`；当前状态不允许该动作返回 `409 INVALID_ORDER_STATE`。

## 商品恢复与售出

- 订单完成：商品从 `LOCKED` 更新为 `SOLD`。
- 未付款取消或退款成功：仅当商品仍为 `LOCKED`、卖家仍为 `ACTIVE` 且已认证时恢复为 `ON_SALE`。
- 商品处于 `FROZEN`、卖家禁用或商品状态已被其他业务改变时，不覆盖现状。
- `DISPUTED` 和 `REFUNDING` 始终保留商品锁定，不能提前释放。

## 评价与信誉

订单达到 `COMPLETED` 后，买卖双方各自可评价对方一次：

- `stars` 必须为 1～5 的整数，`content` 可选且最多 500 个字符。
- 只有订单双方可评价，不能自评；重复评价返回 `409 EVALUATION_EXISTS`。
- 订单完成时，双方各获得一次 `COMPLETED` 事件 `+1`。
- 评价提交时，被评价人获得一次 `EVALUATION` 事件，分值为 `CREDIT_RULES.stars[stars]`。
- 信誉初始值和范围由 `CREDIT_RULES` 控制，更新后夹在 0～100。

信誉服务接口固定为：

```ts
CreditService.applyEvent(
  db: Db,
  input: { userId: string; eventType: string; sourceId: string; delta: number }
): Promise<{ applied: boolean; creditScore: number }>
```

重复事件返回 `applied=false` 和当前分数，不重复更新。

## HTTP 接口

| 方法与路径 | 行为 |
|---|---|
| `POST /api/orders` | 创建订单或返回相同幂等请求的原订单，成功 201 |
| `GET /api/orders?side=buyer\|seller&page=1` | 当前用户参与订单分页 |
| `GET /api/orders/{orderNo}` | 双方或管理员查看详情、历史、评价与可执行动作 |
| `POST /api/orders/{orderNo}/pay` | 买家模拟支付 |
| `PUT /api/orders/{orderNo}/status` | 按冻结动作表处理接单、交割、取消、退款、纠纷和管理员裁决 |
| `POST /api/orders/{orderNo}/confirm` | 买家确认收货，内部复用 `CONFIRM` |
| `POST /api/orders/{orderNo}/evaluations` | 完成订单的一方评价另一方 |
| `GET /api/users/{id}/evaluations` | 公开评价分页 |

订单统一字段为 `{orderNo, productId, buyerId, sellerId, amountCents, status, version, createdAt, updatedAt}`。详情额外返回商品快照、双方公开资料、状态历史、评价、当前用户可执行动作和 `canEvaluate`。

## 小程序页面

- 商品详情：公开且可购买的商品显示“立即下单”；未登录先进入登录，成功后返回。
- 我的订单：买家/卖家分段切换、分页、订单状态和商品缩略图。
- 订单详情：显示金额快照、双方信息、状态时间线，并根据服务端 `actions` 展示允许操作。
- 评价：订单完成后显示星级和正文输入；提交成功后刷新详情。
- 公开评价：商品详情可进入被评价卖家的历史评价页，不显示内部订单字段。

所有页面继续使用当前暖橙交易主色、绿色认证标签、原生 WXML/WXSS 和小程序请求封装。

## 测试与验收

### 单元测试

- 状态转换、动作角色映射、订单与请求编号校验、评价星级校验。
- 信誉事件分值映射与 0～100 边界。

### MySQL 集成测试

- 完整主流程：下单、支付、接单、开始交割、标记交付、确认、双方评价。
- 两个并发买家竞争同一商品时只成功一笔，商品只锁定一次。
- 自购、未认证、禁用用户、非上架商品、价格篡改和越权访问被拒绝。
- 同一下单 `requestId` 返回同一订单；重复支付、取消和退款不产生第二次业务效果。
- 未付款取消恢复商品；退款成功前不释放；冻结和卖家禁用不能被恢复操作绕过。
- 双方各只能评价一次；完成和评价重复事件不重复计分；信誉不越界。
- 订单历史、公开评价不泄露身份内部字段或其他订单参与者数据。

### 小程序测试

- 订单与评价页面已注册，模板和事件完整。
- 下单、支付、状态操作和评价使用正确 HTTP 方法与请求体。
- 401 清理登录状态，重复点击不产生并发业务请求。

## 文档与迁移

- 更新 OpenAPI 并保持 `scripts/check-contracts.mjs` 零差异。
- 在 `docs/design.md` 增加订单 ER 关系、字段、状态机和权威事务边界。
- 新增订单状态时序图与迁移说明，记录生成列唯一键、日志幂等和惰性超时策略。
- 更新 `docs/test-report.md`、`docs/classroom-demo.md`、`docs/tasks.md` 和 README 的 B 完成状态。
- `003_b_orders.sql` 一经应用不得修改；后续变更使用新迁移编号。
