# B：交易、评价与信誉接入

C已在本地`feature/chat-reports`提供咨询及监管增量，B接入前请核对[C→B交接](c-to-b.md)：`REPORT_UPHELD`事件、`server/credit/service.ts`适配路径、`product.moderation_frozen`保护和公共文件合并说明。这些新增细节是C侧实现约定，待B确认及正式联调。

先阅读[详细订单契约](../team-handoff.md#b-的冻结接口)和`server/contracts.ts`，再认领[任务B-01～07](../tasks.md)。商品详情、身份认证与媒体权限由A提供。

## 首个PR建议：可靠下单

1. 新增`database/migrations/003_b_orders.sql`，建立订单与状态日志，包含价格快照、版本、幂等键及有效订单约束。后续迁移编号先与C协调。
2. 新增`server/orders/repository.ts`、`service.ts`，在`server/app.ts`注册真实路由并复用鉴权。`POST /api/orders`的输入及权限以详细契约为准。
3. 在同一事务内重新读取双方资格、商品价格及版本，条件锁定商品后创建订单；并发失败应回滚，不能出现多个有效订单。
4. 先补并发下单、重复requestId、自购、未认证、禁用、价格篡改、非上架商品用例，再完成接口。接入“下单/我的订单”页面后同步OpenAPI。

## 后续增量

按常量实现六段主流程和取消/退款/纠纷。`START_DELIVERY`与`MARK_DELIVERED`是两个动作；待确认才允许收货。模拟支付/退款要幂等，退款成功前不恢复可售；监管冻结及禁用不能被取消订单覆盖。

完成后的双方各评价一次。初始80、范围0～100，规则取`CREDIT_RULES`。以唯一事件避免完成、评价、举报重复计分。向C提供：

```ts
CreditService.applyEvent(db, { userId, eventType, sourceId, delta })
// db为调用方事务连接，返回 { applied, creditScore }
```

B/C共同确定事件类型与sourceId含义后记录到详细契约；C不直接改信誉分。

## 验收与展示

- [ ] 两个并发买家只产生一笔有效订单；重复支付/取消/退款不产生第二次业务效果。
- [ ] 买家、卖家、管理员、陌生用户在每个状态下均有权限用例。
- [ ] 完成/评价事件重复执行不重复加分；分数边界正确。
- [ ] 页面、事务、迁移、OpenAPI、时序图及测试记录齐全，CI通过。

展示“买家下单→模拟付款→卖家接单→开始交割→已交付→买家确认→双方评价”，再展示一个并发或越权拦截。第一部分的绿色认证标识和卖家脱敏规则继续保留。
