# C → B 接入交接

2026-10-29，C：[@yanjason179-jpg](https://github.com/yanjason179-jpg)。本文件是交接说明，尚未通过 GitHub/群聊向 B 发送消息。

## 分支和基线

- 同一仓库 `Boss-H24/campus-trust-market`，本地 `E:\汇报\campus-trust-market`。
- C 新分支：`feature/chat-reports`，从 A 完整交付 `origin/feature/interface-polish` 的 `08471a9` 创建。
- 检查时 `origin/main` 为 `79ff73c`，没有包含 A 的全部交付；不能只依赖 main。已取回远程全部分支及完整历史。
- A 的源代码及报告标签 `member-a-20261028`、`member-a-report-20261028` 已在本地。远端尚无 `feature/orders-credit`。
- 本地原为仅跟踪main的浅克隆，现已解除浅克隆，并将origin的fetch配置改为跟踪所有分支；后续普通fetch即可同步B/C远端分支。
- C 不修改 A 的 `001`/`002` 迁移，不合并 main、不代替同伴审核 A 的 PR #1。

## B 必须提供的信誉接口

以下新增事件类型和服务路径是C侧已实现的接入约定，尚待B确认；原有事务方法签名沿用A冻结契约。路径约定：`server/credit/service.ts`，构建后为 `dist/server/credit/service.js`。

```ts
export class CreditService {
  static async applyEvent(db, { userId, eventType, sourceId, delta }) {
    // db: 调用方PoolConnection；禁止新建事务、commit或release
    // 返回 { applied: boolean, creditScore: number }
  }
}
```

| 字段 | C 提交的值 | B 的处理约束 |
|---|---|---|
| `userId` | 被举报商品的卖家，或被举报用户 ID 字符串 | 服务端读取真实分数；范围 0～100 |
| `eventType` | `REPORT_UPHELD` | 纳入 B 的事件类型白名单 |
| `sourceId` | `report.id` 的十进制字符串 | 就是工单 ID，不是商品 ID；一个对象可有多个独立工单 |
| `delta` | `CREDIT_RULES.report`，当前 -5 | 仅可信内部调用；HTTP 不能任意赋值 |
| 唯一键 | `(event_type, source_id, user_id)` | 重复事件返回 `applied:false`，不再改分 |

C 的 `server/moderation/credit.ts` 在首次成立举报时加载该服务。B 按上面的路径及静态导出实现后，无需改 C 路由。若 B 的实际路径/构造方式不同，只调整这一个适配文件。`createApp(config,pool,applyCredit?)` 的第三参数供测试或明确的依赖注入使用，原有二参数调用保持可用。

**B 尚未合入时的实际行为**：聊天、收藏、提交/调查/驳回/关闭举报、独立账号监管、分类和规则维护可运行。举报“成立”返回 HTTP 503 / `CREDIT_SERVICE_UNAVAILABLE`；工单、商品、分数和日志全部回滚。管理员页面展示原因并刷新，不能将此状态称为联调完成。C 不直接写 `app_user.credit_score`，也不创建生产 `credit_event` 表。

测试中的 `c_test_credit_event` 仅存在于专用测试库，运行后删除；它用于验证当前连接、回滚及重复调用，不代表 B 的正式服务通过验收。

## B 的下单、取消和退款必须保留监管决定

C 的迁移 `004_c_community.sql` 增加 `product.moderation_frozen`，默认 0。

| 监管动作 | 非交易锁定商品 | `LOCKED` 商品 |
|---|---|---|
| 冻结 | `status=FROZEN`，标志为 1 | 保留 `LOCKED`，标志为 1 |
| 举报成立并下架 | `OFF_SHELF`；已冻结时保留冻结 | 保留 `LOCKED`，标志为 1 |
| 管理员解冻 | `FROZEN` 改为 `OFF_SHELF`，标志为 0 | 保留 `LOCKED`，标志为 0 |

不得把 `status !== 'FROZEN'` 当作“未冻结”。下单事务同时检查商品上架、`moderation_frozen=0`、双方认证与 ACTIVE；取消/退款成功后的商品恢复必须重新读取标志和卖家状态。冻结时回到 `FROZEN`，卖家禁用时保留不可售（如 `OFF_SHELF`），两项均允许才按订单规则恢复。未退款成功前继续保留交易锁。

B/C 锁顺序建议：涉及双方时按用户 ID 排序锁用户 → 商品 → 订单/举报 → 信誉事件。C 处置锁目标用户 → 商品 → 工单，复用该连接调用 B，信誉服务不要反向锁其他商品。B 的订单创建/结束动作应统一同一顺序；发生死锁的事务如需重试，重试整个幂等操作。

## 公共文件和合并

| 文件 | C 的改动 | B 合并时保留 |
|---|---|---|
| `server/app.ts` | 导入/调用 `registerCommunityRoutes`，增加可选测试适配器 | 注册 B 路由时保留 C 注册，在 404/error middleware 前 |
| `miniprogram/app.json` | 新增 community/chat/report 页面 | 合并双方 pages，保留 A 的三个 Tab |
| detail/profile 页面 | 咨询/收藏/举报/互动入口 | 在原页面加入订单/评价入口，避免覆盖 C 事件 |
| admin 页面 | 统一监管入口和 A 审核版本 | 如接入纠纷，保留版本、会话授权范围和监管入口 |
| `server/products/*` | 平台规则、冻结保护和输出标志 | 不移除冻结校验、公开检索及图片保护 |
| `scripts/generate-openapi.mjs` | A+C 共42个操作 | 在生成源添加 B 契约，然后重新生成 JSON |
| `scripts/check-contracts.mjs` | 扫描 app 和 C 独立路由文件 | 若 B 也独立路由，追加其路径到 source 数组 |
| `package.json`、测试 reset | C 单元/集成入口；清理 C 测试表 | 将双方测试合并，保持数据库测试串行 |

迁移顺序：A `001/002`，B 预留 `003_b_...sql`，C `004_c_community.sql`。C 已在本地应用 004，不再改写；若 B 的003后合入，迁移器会检测并应用尚未执行的文件。C 的004不引用B表，可独立先应用。未来迁移编号另行协调。

推荐流程（C 分支发布后由各自账号执行；本次尚未推送）：

```powershell
# C 本机：发布C功能分支，不能推main
git push -u origin feature/chat-reports

# B：在同一个仓库内获取分支
git fetch origin
git switch feature/orders-credit

# A的PR #1先复核合入main；C/B分别开PR，由同伴复核
# 一方先合入后，另一方合并更新后的main
git fetch origin
git merge origin/main
```

若要在双方合入 main 前联调，可从 B 分支新建 `integration/b-c`，在该分支合并 `origin/feature/chat-reports` 并解决公共文件冲突；不在 main 上试合并，不强推对方分支，不单独复制业务文件。若 A 被 squash 合入，比较 A 基线重复差异后再处理，避免把 A 的整个交付误认为 C 新增。

## 联调验收（等待B）

- [ ] 用正式 `CreditService` 建立成立举报，工单、商品和 -5 在同一事务中提交。
- [ ] 重复/并发处理同一工单只留一条 `REPORT_UPHELD` 事件；服务失败无部分提交。
- [ ] 分数在0和100边界保持有效；信誉表唯一键覆盖事件类型、来源及用户。
- [ ] 在待付款/已付款/退款中冻结商品，取消/退款不能重新上架。
- [ ] 禁用卖家后取消订单不恢复可售；解冻不解除订单锁。
- [ ] 真实 A+B+C 演示：咨询→下单→交割→评价→举报→信誉变化，保留 A 审核版本冲突测试。
- [ ] GitHub CI和另一位组员复核通过，再合入main。
