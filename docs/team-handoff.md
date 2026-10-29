# 三人实施分工与交接

## 交付边界

| 成员 | 负责目录与业务 | 完成标准 |
|---|---|---|
| A（当前提交） | 公共工程；用户与商品模块；原生页面；迁移 `001`、`002` | 完整认证、发布审核、搜索与隐私流程，自动化测试通过 |
| B | 新增订单、评价、信誉业务和对应页面；迁移编号 `003_b_...` | 下单→模拟支付→交割→收货→评价；并发、越权、重复操作及信誉幂等测试 |
| C | 新增咨询、收藏、举报、监管业务及对应页面；迁移编号 `004_c_...` | 咨询留存、举报处理、违规处置和监管入口；隐私与权限测试 |

每人负责自己的页面、接口、数据迁移、自动化测试和讲解素材。A 维护鉴权、请求封装和公共异常处理；B/C 如需改动公共文件，应先在 Issue 中写明接口变化。迁移文件一旦应用不能修改；新需求增加新文件。

A 的第二个迁移为认证记录增加审核版本。实名及商品审核均必须提交列表中看到的 `expectedVersion`；服务端在事务锁内检查，陈旧列表返回409。C 整合工作台时必须保留此约束。

`GET /api/health` 返回 `demoLoginEnabled` 和 `wechatLoginEnabled`，登录页据此显示方式；后者仅表示服务端已有配置，不表示微信平台联调已通过。首页快捷入口复用商品列表的分类与价格参数，分类编号从接口获取。

## B 的冻结接口

这些接口**尚未实现**，不得把 `/api/products/:id/status` 当作订单接口。

| 方法与路径 | 输入 | 行为与权限 |
|---|---|---|
| POST `/api/orders` | `{productId, requestId}` | 已认证买家下单，拒绝自购；requestId 为本次下单幂等键 |
| GET `/api/orders?side=buyer\|seller&page=1` | 分页 | 只返回当前用户参与的订单 |
| GET `/api/orders/{orderNo}` | 订单号 | 只允许双方及管理员访问 |
| POST `/api/orders/{orderNo}/pay` | `{requestId}` | 买家模拟支付，不涉及真实资金 |
| PUT `/api/orders/{orderNo}/status` | `{action, version, requestId}` | 后端校验动作、角色和版本；不接受任意 status |
| POST `/api/orders/{orderNo}/confirm` | `{version, requestId}` | 买家在待确认状态确认收货 |
| POST `/api/orders/{orderNo}/evaluations` | `{stars, content}` | 完成后的交易双方各评价一次；1～5 星 |
| GET `/api/users/{id}/evaluations` | 分页 | 公开历史评价，过滤内部订单和身份字段 |

订单统一输出 `{orderNo,productId,buyerId,sellerId,amountCents,status,version,createdAt,updatedAt}`，详情附 `history`。服务端重新读取价格，不接受前端金额。

状态动作唯一来源是 `server/contracts.ts` 的 `ORDER_TRANSITIONS`：

```text
待付款 --买家PAY--> 已付款 --卖家ACCEPT--> 待交付
待交付 --卖家START_DELIVERY--> 交易中 --卖家MARK_DELIVERED--> 待确认
待确认 --买家CONFIRM--> 已完成

待付款 --买家CANCEL/系统EXPIRE--> 已取消
已付款/待交付 --REQUEST_REFUND或卖家REJECT--> 退款处理中
交易中/待确认 --买家OPEN_DISPUTE--> 交易纠纷
交易纠纷 --管理员RESOLVE_COMPLETE--> 已完成
交易纠纷 --管理员RESOLVE_REFUND--> 退款处理中
退款处理中 --系统REFUND_SUCCEEDED--> 已取消
```

未付款默认15分钟超时；已付款待接单24小时仍未接单进入退款，不能直接释放商品。纠纷不自动判完成。模拟退款是可重试且幂等的系统动作。订单取消恢复商品前必须检查监管冻结和卖家禁用状态；不可覆盖监管决定。

创建订单须在同一事务中：校验双方认证及禁用状态 → 条件更新 `product.status='ON_SALE' AND version=?` 为 `LOCKED` → 插入订单 → 写状态日志。修改商品与下单共用商品行锁；事务失败全部回滚。订单表通过“有效订单的商品唯一键”保证同一商品只有一笔有效订单，不能只靠先查再写。

新增 `orders`、`order_status_log`、`evaluation`、`credit_event`。评价唯一键 `(order_id, reviewer_id)`；信誉事件唯一键 `(event_type, source_id, user_id)`。信誉规则沿用 `CREDIT_RULES`：初始80、完成+1、五星+2/四星+1/三星0/二星-1/一星-3、成立举报-5、刷单-10，范围0～100；完成+1对双方各记一次。

供 C 使用的服务方法由 B 实现并导出：`CreditService.applyEvent(db, {userId,eventType,sourceId,delta})`。`db` 是调用方事务连接，返回 `{applied,creditScore}`；重复事件 `applied=false`，不重复计分。C 不得直接改信誉分。

## C 的冻结接口

| 方法与路径 | 输入或输出 | 权限 |
|---|---|---|
| POST `/api/conversations` | `{productId}` → `{id,productId,buyerId,sellerId}` | 已登录用户咨询卖家，拒绝自聊 |
| GET `/api/conversations` | 会话列表、最近消息 | 当前会话参与者 |
| GET `/api/conversations/{id}/messages?afterId=...` | 增量消息，最多50条 | 参与者；前台3秒轮询、退出页面停止 |
| POST `/api/conversations/{id}/messages` | `{clientMessageId,content}`，1～1000字 | 参与者；消息幂等，拦截联系方式和引流话术 |
| PUT/DELETE `/api/favorites/{productId}` | 收藏或取消 | 当前用户，操作幂等 |
| GET `/api/favorites` | 分页商品；已下架标注不可用 | 当前用户 |
| POST `/api/reports` | `{targetType,targetId,reason,description}` | 已登录举报人；targetType 为 PRODUCT/USER |
| GET `/api/reports` | 自己的举报及处理结果 | 举报人 |
| GET `/api/admin/reports` | 监管工单分页 | 管理员 |
| POST `/api/admin/reports/{id}/resolve` | `{decision,action,reason}` | 管理员；成立才扣分，同一工单不能重复处理 |
| PATCH `/api/admin/users/{id}` | `{action:'DISABLE'\|'ENABLE'}` | 管理员；不得修改 role 或直接赋值信誉 |
| POST/PATCH `/api/admin/categories` | 分类新增/维护 | 管理员；已引用分类停用而非删除 |
| GET `/api/admin/logs` | 脱敏操作日志分页 | 管理员 |

2026-10-29：上述C接口已在本地`feature/chat-reports`实现。成立举报依赖B的正式信誉服务，缺失时返回503并回滚全部处置。扩展接口如下，均已记录OpenAPI：

| 方法与路径 | 用途 | 附加约束 |
|---|---|---|
| PATCH `/api/admin/reports/{id}` | `{action:INVESTIGATE\|CLOSE,expectedVersion}` | 管理员；关闭仅允许已成立/已驳回工单 |
| GET `/api/admin/reports/{id}/evidence` | 相关会话列表；带conversationId/afterId读取消息 | 仅举报双方，商品举报须匹配商品，逐次记审计 |
| GET `/api/admin/users` | 学生账号脱敏分页 | 管理员，无身份密文/登录凭据 |
| POST `/api/admin/products/{id}/moderation` | `{action:UNFREEZE,reason,expectedVersion}` | 解冻不自动上架、不释放订单锁 |
| GET `/api/admin/categories` | 包括停用项的分类 | 分类PATCH正文为`{id,name,active}` |
| GET/PATCH `/api/admin/rules[/{key}]` | 规则列表/更新 | PATCH为`{value,expectedVersion}`；仅白名单键 |

账号PATCH额外要求处置`reason`，不允许role/credit字段；商品详情附`moderationFrozen`。B订单逻辑必须检查此独立标志，不能只判断商品status。B/C的事件类型、服务路径及合并细节见[C→B交接](handoff/c-to-b.md)，待B确认。

举报状态：PENDING → INVESTIGATING → UPHELD/REJECTED → CLOSED。处理动作 NONE/TAKE_DOWN/FREEZE_PRODUCT/DISABLE_USER；冻结不能被卖家重新提交绕过。管理员只有在相关举报/纠纷授权范围内才可读取聊天凭证，不提供所有聊天的公开查询。

C 新增 `conversation`、`chat_message`、`favorite`、`report`、`platform_rule` 等迁移；消息唯一键 `(conversation_id,sender_id,client_message_id)`，收藏唯一键 `(user_id,product_id)`。后台规则通过 `platform_rule` 维护关键词、频率及信誉阈值，A 当前默认阈值应被同名配置统一替换。

## Git 协作与里程碑

1. A完整交付合入后，B/C从`main`创建自己的分支；提前开发时从`feature/interface-polish`创建。C本次已从A的`08471a9`创建`feature/chat-reports`，A的PR合入后再合并最新main。
2. B 使用 `feature/orders-credit`，C 使用 `feature/chat-reports`。每个 PR 写明需求编号、变更行为、迁移文件、测试命令。
3. 改动自己的模块；公共状态和接口变更先讨论。PR 通过 CI 并由另一位同学复核后合入。
4. 集成后按课堂脚本完整排练；最终测试人员补充 B/C 全流程及安全专项测试。

仓库先使用 A/B/C 标识，现为公开项目。组员可填写[加入申请](https://github.com/Boss-H24/campus-trust-market/issues/new?template=join-team.yml)，负责人从Issue作者取得GitHub账号并核对小组身份，再在Settings → Collaborators中邀请。接受邀请后可推送个人分支；不要共享账号或个人密钥。
