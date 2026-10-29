# 成员 B 订单、评价与信誉实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成成员 B 的订单、模拟支付、交割、退款、评价和信誉闭环，并提供原生小程序页面、OpenAPI、测试与演示材料。

**Architecture:** 沿用 Express Controller -> Service -> Repository 结构。OrderService 在同一 MySQL 事务内完成资格、版本、幂等、状态日志和商品状态变更；CreditService 只通过唯一事件修改信誉。小程序只调用冻结 HTTP 接口并展示服务端返回的允许动作。

**Tech Stack:** Node.js 24、TypeScript、Express 5、MySQL 8.4、mysql2、node:test、原生微信小程序 WXML/WXSS。

## Global Constraints

- 编号对外使用字符串；金额使用整数分；订单权限由服务端检查。
- 状态动作唯一来源为 `server/contracts.ts` 的 `ORDER_TRANSITIONS`。
- 下单、支付、退款、取消、确认和评价都必须有测试覆盖。
- 同一商品最多一笔有效订单；评价唯一键为 `(order_id, reviewer_id)`；信誉事件唯一键为 `(event_type, source_id, user_id)`。
- 已付款订单不能直接取消，必须经过 `REFUNDING`；退款成功前不恢复商品。
- 商品恢复不得覆盖 `FROZEN` 状态或绕过禁用卖家限制。
- 信誉初始 80、范围 0～100，规则只来自 `CREDIT_RULES`。
- 已应用的 `003_b_orders.sql` 不得修改；后续数据库变化使用新迁移文件。
- 所有新增接口必须进入 `docs/openapi.json` 并通过接口契约检查。

---

### Task 1: 订单领域规则与测试入口

**Files:**
- Create: `server/orders/rules.ts`
- Create: `server/tests/order-unit.test.ts`
- Modify: `package.json`
- Modify: `server/contracts.ts`

**Interfaces:**
- Produces: `validateRequestId(value: unknown): string`
- Produces: `validateOrderNo(value: unknown): string`
- Produces: `validateEvaluation(body: Record<string, unknown>): { stars: number; content: string }`
- Produces: `actionActor(action: string): 'BUYER' | 'SELLER' | 'ADMIN' | 'SYSTEM'`
- Produces: `nextOrderState(current: string, action: string): OrderStatus`
- Produces: `creditDeltaForStars(stars: number): number`
- Produces: `OrderStatus`、`OrderAction`、`CreditEventType` 类型

- [ ] **Step 1: Write the failing domain tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { actionActor, creditDeltaForStars, nextOrderState, validateEvaluation, validateOrderNo, validateRequestId } from '../orders/rules.ts';

test('订单规则：动作角色和状态唯一映射', () => {
  assert.equal(actionActor('PAY'), 'BUYER');
  assert.equal(actionActor('ACCEPT'), 'SELLER');
  assert.equal(actionActor('RESOLVE_REFUND'), 'ADMIN');
  assert.equal(actionActor('EXPIRE'), 'SYSTEM');
  assert.equal(nextOrderState('PENDING_PAYMENT', 'PAY'), 'PAID');
  assert.equal(nextOrderState('REFUNDING', 'REFUND_SUCCEEDED'), 'CANCELLED');
  assert.throws(() => nextOrderState('PAID', 'CONFIRM'));
});

test('订单规则：请求编号与订单号边界', () => {
  assert.equal(validateRequestId('req_12345678'), 'req_12345678');
  assert.throws(() => validateRequestId('short'));
  assert.throws(() => validateRequestId('req with spaces'));
  assert.match(validateOrderNo('CM20261029120000ABCDEFGH'), /^CM/);
  assert.throws(() => validateOrderNo('ORDER-1'));
});

test('评价与信誉：星级、正文和边界分值', () => {
  assert.deepEqual(validateEvaluation({ stars: 5, content: ' 交易顺利 ' }), { stars: 5, content: '交易顺利' });
  assert.deepEqual(validateEvaluation({ stars: 3 }), { stars: 3, content: '' });
  assert.throws(() => validateEvaluation({ stars: 0 }));
  assert.throws(() => validateEvaluation({ stars: 4.5 }));
  assert.throws(() => validateEvaluation({ stars: 5, content: '好'.repeat(501) }));
  assert.equal(creditDeltaForStars(1), -3);
  assert.equal(creditDeltaForStars(3), 0);
  assert.equal(creditDeltaForStars(5), 2);
});
```

- [ ] **Step 2: Add the test file to `npm test` and verify red**

Run: `.\scripts\npm.ps1 test -- --test-name-pattern="订单规则"`

Expected: FAIL because `server/orders/rules.ts` does not exist.

- [ ] **Step 3: Implement the domain rules**

Use `ensure` from `server/common/errors.ts`; validate request IDs with `/^[A-Za-z0-9_-]{8,64}$/`, order numbers with `/^CM[A-Z0-9]{16,30}$/`, star values as safe integers from 1 through 5, and content as at most 500 Unicode code points. Derive action roles from explicit sets and call `ORDER_TRANSITIONS` for the next state. Return `CREDIT_RULES.stars[stars]`.

- [ ] **Step 4: Run the focused test and verify green**

Run: `.\scripts\npm.ps1 test -- --test-name-pattern="订单规则"`

Expected: all order-domain tests pass.

- [ ] **Step 5: Commit**

```powershell
git add package.json server/contracts.ts server/orders/rules.ts server/tests/order-unit.test.ts
git commit -m "test: define order domain rules"
```

### Task 2: 迁移与数据库约束

**Files:**
- Create: `database/migrations/003_b_orders.sql`
- Modify: `server/tests/integration.test.ts`

**Interfaces:**
- Produces tables: `orders`, `order_status_log`, `evaluation`, `credit_event`
- Produces generated column: `orders.active_product_id`

- [ ] **Step 1: Add an integration assertion for migration constraints before creating the migration**

Append a failing test that reads `information_schema`:

```ts
test('DB-B：订单迁移具有有效订单、评价和信誉事件唯一约束', async () => {
  const [tables] = await pool.query<any[]>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('orders','order_status_log','evaluation','credit_event')"
  );
  assert.equal(tables.length, 4);
  const [indexes] = await pool.query<any[]>(
    "SELECT DISTINCT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN ('orders','evaluation','credit_event')"
  );
  const names = indexes.map(row => row.index_name || row.INDEX_NAME);
  assert.ok(names.includes('uq_orders_active_product'));
  assert.ok(names.includes('uq_evaluation_reviewer'));
  assert.ok(names.includes('uq_credit_event'));
});
```

- [ ] **Step 2: Verify red against a fresh test database**

Run: `.\scripts\npm.ps1 run test:integration -- --test-name-pattern="DB-B"`

Expected: FAIL because the four tables do not exist.

- [ ] **Step 3: Create the migration**

Create InnoDB/utf8mb4 tables with:

- `orders`: all fields from the design, enum status, unsigned version, `buyer_request_id`, millisecond timestamps, foreign keys, `UNIQUE(buyer_id,buyer_request_id)`, generated active product column and `UNIQUE(active_product_id)`.
- `order_status_log`: nullable actor id, actor role enum, request id, unique `(order_id,request_id)`, index `(order_id,created_at,id)`.
- `evaluation`: star check, content, reviewer/reviewee foreign keys, unique `(order_id,reviewer_id)`, index `(reviewee_id,created_at,id)`.
- `credit_event`: user, event type, source id, delta, unique `(event_type,source_id,user_id)`, index `(user_id,created_at,id)`.

Use generated expression:

```sql
CASE WHEN status IN
('PENDING_PAYMENT','PAID','PENDING_DELIVERY','IN_PROGRESS','PENDING_CONFIRMATION','DISPUTED','REFUNDING')
THEN product_id ELSE NULL END
```

- [ ] **Step 4: Verify green**

Run: `.\scripts\npm.ps1 run db:migrate`

Run: `.\scripts\npm.ps1 run test:integration -- --test-name-pattern="DB-B"`

Expected: migration succeeds and the schema test passes.

- [ ] **Step 5: Commit**

```powershell
git add database/migrations/003_b_orders.sql server/tests/integration.test.ts
git commit -m "feat: add order credit database schema"
```

### Task 3: CreditService

**Files:**
- Create: `server/orders/credit-service.ts`
- Create: `server/tests/credit.test.ts`
- Modify: `package.json`
- Modify: `server/tests/integration.test.ts`

**Interfaces:**

```ts
export type CreditEventInput = {
  userId: string;
  eventType: CreditEventType;
  sourceId: string;
  delta: number;
};

export class CreditService {
  async applyEvent(db: Db, input: CreditEventInput): Promise<{ applied: boolean; creditScore: number }>;
}
```

- [ ] **Step 1: Write failing integration test**

```ts
test('CREDIT-B：同一信誉事件只计分一次并限制在0到100', async () => {
  const [user] = await pool.query<any[]>("SELECT id,credit_score FROM app_user WHERE demo_account='buyer'");
  const userId = String(user[0].id);
  const initial = Number(user[0].credit_score);
  const credit = new CreditService();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const first = await credit.applyEvent(connection, { userId, eventType: 'REPORT', sourceId: 'report-test-1', delta: -5 });
    const duplicate = await credit.applyEvent(connection, { userId, eventType: 'REPORT', sourceId: 'report-test-1', delta: -5 });
    await connection.commit();
    assert.equal(first.applied, true);
    assert.equal(first.creditScore, initial - 5);
    assert.equal(duplicate.applied, false);
    assert.equal(duplicate.creditScore, initial - 5);
  } finally {
    connection.release();
  }
  const upper = await credit.applyEvent(pool, { userId, eventType: 'COMPLETED', sourceId: 'upper', delta: 999 });
  const lower = await credit.applyEvent(pool, { userId, eventType: 'FRAUD', sourceId: 'lower', delta: -999 });
  assert.equal(upper.creditScore, 100);
  assert.equal(lower.creditScore, 0);
});
```

- [ ] **Step 2: Verify red**

Run: `.\scripts\npm.ps1 run test:integration -- --test-name-pattern="CREDIT-B"`

Expected: FAIL because `CreditService` is missing.

- [ ] **Step 3: Implement the service**

In the caller's transaction, lock `app_user` with `SELECT credit_score ... FOR UPDATE`, use `INSERT IGNORE` on `credit_event`, update `credit_score` only when `affectedRows === 1`, and always return the resulting locked score. Reject missing users and unsafe integer deltas with `AppError`.

- [ ] **Step 4: Verify green**

Run: `.\scripts\npm.ps1 run test:integration -- --test-name-pattern="CREDIT-B"`

Expected: PASS and no duplicate `credit_event`.

- [ ] **Step 5: Commit**

```powershell
git add package.json server/orders/credit-service.ts server/tests/credit.test.ts server/tests/integration.test.ts
git commit -m "feat: add idempotent credit events"
```

### Task 4: OrderRepository and order creation transaction

**Files:**
- Create: `server/orders/repository.ts`
- Create: `server/orders/service.ts`
- Modify: `server/tests/integration.test.ts`

**Interfaces:**
- Produces: `OrderService.create(actor: Actor, body: Record<string, unknown>): Promise<OrderDetail>`
- Produces: `OrderRepository.findByBuyerRequest(db: Db, buyerId: string, requestId: string)`
- Produces: `OrderRepository.insert(...)`
- Produces: `OrderRepository.present(row: Row, extra?: Record<string, unknown>)`

- [ ] **Step 1: Add failing create-order integration tests**

Create helpers in `server/tests/integration.test.ts` for an approved seller product and order payload. Test:

```ts
const created = await api('/api/orders', {
  method: 'POST', token: tokens.buyer,
  body: { productId: pid, requestId: 'buy-order-0001' }
});
assert.equal(created.status, 201);
assert.equal(created.data.amountCents, 2500);
assert.equal(created.data.status, 'PENDING_PAYMENT');

const repeated = await api('/api/orders', {
  method: 'POST', token: tokens.buyer,
  body: { productId: pid, requestId: 'buy-order-0001' }
});
assert.equal(repeated.status, 201);
assert.equal(repeated.data.orderNo, created.data.orderNo);

assert.equal((await api('/api/orders', {
  method: 'POST', token: tokens.seller,
  body: { productId: pid, requestId: 'self-buy-0001' }
})).status, 403);
```

Add a concurrent test with two buyers. Seed or create a second verified buyer through the existing demo seed, then call two POSTs with different request IDs and `Promise.all`. Assert statuses sort to `201,409`, one active order exists, and product status is `LOCKED`.

- [ ] **Step 2: Verify red**

Run: `.\scripts\npm.ps1 run test:integration -- --test-name-pattern="订单创建|并发下单"`

Expected: FAIL with 404 because `/api/orders` is not implemented.

- [ ] **Step 3: Implement repository and create transaction**

Implement response presentation, request-id lookup, fixed-order user locks, product row lock, conditional `ON_SALE -> LOCKED` update with version, order insert, `CREATE` status log, and audit. Generate order numbers as `CM` plus UTC timestamp plus `randomBytes(5).toString('hex').toUpperCase()`.

Map these errors:

- self purchase: `403 SELF_PURCHASE`
- unverified participant: `403 CERTIFICATION_REQUIRED`
- disabled participant: `403 ACCOUNT_DISABLED`
- non-sale product: `409 PRODUCT_UNAVAILABLE`
- concurrent active order: `409 PRODUCT_RESERVED`

- [ ] **Step 4: Verify green**

Run: `.\scripts\npm.ps1 run test:integration -- --test-name-pattern="订单创建|并发下单"`

Expected: PASS; two competing buyers produce one order.

- [ ] **Step 5: Commit**

```powershell
git add server/orders server/tests/integration.test.ts
git commit -m "feat: create orders with atomic product locking"
```

### Task 5: Order list, detail, actions and lazy timeouts

**Files:**
- Modify: `server/orders/repository.ts`
- Modify: `server/orders/service.ts`
- Modify: `server/tests/integration.test.ts`

**Interfaces:**
- Produces: `OrderService.list(actor: Actor, query: Record<string, unknown>)`
- Produces: `OrderService.detail(actor: Actor, orderNo: string)`
- Produces: `OrderService.act(actor: Actor, orderNo: string, body: Record<string, unknown>, forcedAction?: string)`
- Produces: `OrderService.sweepExpired(): Promise<void>`

- [ ] **Step 1: Add failing main-flow and security tests**

Test the sequence:

```ts
PAY -> PAID
ACCEPT -> PENDING_DELIVERY
START_DELIVERY -> IN_PROGRESS
MARK_DELIVERED -> PENDING_CONFIRMATION
CONFIRM -> COMPLETED
```

For each action, assert `version` increments and `history` grows. Add separate assertions for:

- Buyer cannot `ACCEPT`.
- Seller cannot `PAY`.
- Outsider gets 404 for detail.
- Stale version returns 409.
- Repeating PAY with the same request ID returns 200 and unchanged version.
- Reusing a request ID with another action returns 409.

- [ ] **Step 2: Verify red**

Run: `.\scripts\npm.ps1 run test:integration -- --test-name-pattern="主流程|订单权限|重复支付"`

Expected: FAIL because list/detail/pay/status/confirm routes are absent.

- [ ] **Step 3: Implement list, detail and actions**

List only the current buyer or seller side with page/pageSize validation. Detail returns product snapshot, public buyer/seller profiles, status history, evaluations, `actions`, and `canEvaluate`. Action authorization compares `actionActor(action)` with the authenticated actor and current order role; admin-only resolve/refund actions are allowed through the status route.

For repeated actions, query the status log before version/state checks. On successful completion, set the product to `SOLD`, write completion credit events for both sides, and apply `+1` once per user.

- [ ] **Step 4: Implement refund, cancellation and lazy timeouts**

Use `updated_at` or the latest action log to enforce 15-minute payment and 24-hour acceptance deadlines. `sweepExpired` processes at most 50 eligible orders through the same transaction method. List/detail/create call it through a 30-second process-level throttle.

Release `LOCKED` products only for `CANCELLED`; never release during `REFUNDING`. On refund success, restore only when product is still `LOCKED` and seller is `ACTIVE/VERIFIED`.

- [ ] **Step 5: Verify green**

Run: `.\scripts\npm.ps1 run test:integration -- --test-name-pattern="主流程|订单权限|重复支付|退款|超时"`

Expected: all selected tests pass.

- [ ] **Step 6: Commit**

```powershell
git add server/orders server/tests/integration.test.ts
git commit -m "feat: implement order state actions and refunds"
```

### Task 6: Evaluations and public reputation history

**Files:**
- Modify: `server/orders/repository.ts`
- Modify: `server/orders/service.ts`
- Modify: `server/tests/integration.test.ts`

**Interfaces:**
- Produces: `OrderService.evaluate(actor: Actor, orderNo: string, body: Record<string, unknown>)`
- Produces: `OrderService.userEvaluations(userId: string, query: Record<string, unknown>)`

- [ ] **Step 1: Add failing evaluation tests**

After a completed order:

```ts
const buyerReview = await api(`/api/orders/${orderNo}/evaluations`, {
  method: 'POST', token: tokens.buyer,
  body: { stars: 5, content: '交付准时' }
});
assert.equal(buyerReview.status, 201);

const sellerReview = await api(`/api/orders/${orderNo}/evaluations`, {
  method: 'POST', token: tokens.seller,
  body: { stars: 4, content: '沟通顺利' }
});
assert.equal(sellerReview.status, 201);
```

Assert duplicate evaluation is 409, outsiders are 403, pre-completion evaluation is 409, public history omits `orderNo`, and each user receives completed `+1` plus one star delta.

- [ ] **Step 2: Verify red**

Run: `.\scripts\npm.ps1 run test:integration -- --test-name-pattern="评价与信誉|公开评价"`

Expected: FAIL because evaluation routes are absent.

- [ ] **Step 3: Implement evaluations**

Lock the order, require `COMPLETED`, identify the reviewer and reviewee, insert the unique evaluation, and call `CreditService.applyEvent` with `EVALUATION` and `sourceId` equal to the inserted evaluation ID. Return public evaluation data without internal identity fields.

- [ ] **Step 4: Implement public evaluation pagination**

Query by `reviewee_id`, newest first, join reviewer public profile, return `{items,total,page,pageSize}`. Never select order number, buyer id, seller id, encrypted identity, or student id fields.

- [ ] **Step 5: Verify green**

Run: `.\scripts\npm.ps1 run test:integration -- --test-name-pattern="评价与信誉|公开评价"`

Expected: PASS, including duplicate-event assertions.

- [ ] **Step 6: Commit**

```powershell
git add server/orders server/tests/integration.test.ts
git commit -m "feat: add bidirectional evaluations"
```

### Task 7: HTTP routes and OpenAPI

**Files:**
- Modify: `server/app.ts`
- Modify: `scripts/generate-openapi.mjs`
- Modify: `docs/openapi.json`
- Modify: `scripts/check-contracts.mjs`

**Interfaces:**
- Consumes: all `OrderService` methods from Tasks 4-6
- Produces: eight frozen member B operations

- [ ] **Step 1: Add failing contract coverage check**

Extend `scripts/check-contracts.mjs` with required member B routes:

```js
for (const route of [
  'post /api/orders',
  'get /api/orders',
  'get /api/orders/{orderNo}',
  'post /api/orders/{orderNo}/pay',
  'put /api/orders/{orderNo}/status',
  'post /api/orders/{orderNo}/confirm',
  'post /api/orders/{orderNo}/evaluations',
  'get /api/users/{id}/evaluations'
]) if (!declared.includes(route)) throw new Error('缺少成员B接口：' + route);
```

- [ ] **Step 2: Verify red**

Run: `.\scripts\npm.ps1 run check`

Expected: FAIL with “缺少成员B接口”.

- [ ] **Step 3: Implement routes and register OrderService**

Create one `OrderService` in `createApp`, add `auth` to every member B route, register `/api/orders/:orderNo/pay` before the generic status handlers, and pass forced `PAY`/`CONFIRM` actions for dedicated endpoints. Keep `/api/users/:id/evaluations` public.

- [ ] **Step 4: Add OpenAPI schemas and operations**

Add reusable `Order`, `OrderDetail`, `OrderHistory`, `Evaluation`, `EvaluationInput`, `OrderActionInput`, and list schemas. Document 201 for create/evaluate, 403 role failures, 409 stale/idempotency/state failures, and the admin-only order actions.

- [ ] **Step 5: Generate and verify**

Run: `node scripts/generate-openapi.mjs`

Run: `.\scripts\npm.ps1 run check`

Expected: TypeScript, mini-program and OpenAPI checks all pass with no missing routes.

- [ ] **Step 6: Commit**

```powershell
git add server/app.ts scripts/generate-openapi.mjs scripts/check-contracts.mjs docs/openapi.json
git commit -m "feat: expose order and evaluation APIs"
```

### Task 8: Mini-program order utilities and orders page

**Files:**
- Modify: `miniprogram/utils/api.js`
- Modify: `miniprogram/utils/format.js`
- Modify: `miniprogram/app.json`
- Create: `miniprogram/pages/orders/orders.js`
- Create: `miniprogram/pages/orders/orders.json`
- Create: `miniprogram/pages/orders/orders.wxml`
- Create: `miniprogram/pages/orders/orders.wxss`
- Modify: `server/tests/miniprogram.test.ts`

**Interfaces:**
- Produces: `api.requestId(): string`
- Produces: order status labels in `format.status`
- Produces page route: `/pages/orders/orders`

- [ ] **Step 1: Write failing mini-program tests**

Test that `requestId()` returns unique URL-safe values of at least 16 characters, order statuses map to Chinese labels, and the orders page uses `GET /api/orders?side=buyer&page=1` by default. Verify switching to seller makes a new request with `side=seller`.

- [ ] **Step 2: Verify red**

Run: `.\scripts\npm.ps1 test -- --test-name-pattern="订单页面"`

Expected: FAIL because the request utility and page do not exist.

- [ ] **Step 3: Implement utility helpers and orders page**

Use `Date.now().toString(36)` plus two random base-36 chunks for request IDs. Add buyer/seller segmented controls, pagination, empty/error states, amount formatting, and navigation to order detail.

- [ ] **Step 4: Verify green**

Run: `.\scripts\npm.ps1 test -- --test-name-pattern="订单页面"`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add miniprogram/utils miniprogram/app.json miniprogram/pages/orders server/tests/miniprogram.test.ts
git commit -m "feat: add mini-program order list"
```

### Task 9: Product detail checkout and order detail actions

**Files:**
- Modify: `miniprogram/pages/detail/detail.js`
- Modify: `miniprogram/pages/detail/detail.wxml`
- Modify: `miniprogram/pages/detail/detail.wxss`
- Create: `miniprogram/pages/order-detail/order-detail.js`
- Create: `miniprogram/pages/order-detail/order-detail.json`
- Create: `miniprogram/pages/order-detail/order-detail.wxml`
- Create: `miniprogram/pages/order-detail/order-detail.wxss`
- Modify: `miniprogram/app.json`
- Modify: `server/tests/miniprogram.test.ts`

**Interfaces:**
- Consumes: `POST /api/orders`, `POST /api/orders/{orderNo}/pay`, `PUT /api/orders/{orderNo}/status`, `POST /api/orders/{orderNo}/confirm`

- [ ] **Step 1: Write failing page-behavior tests**

Test that a non-owner `ON_SALE` product exposes checkout, checkout posts one `productId` and one request ID, and a disabled/loading state prevents a second click. Test that order detail only renders server-provided `actions` and sends the exact action/version/requestId payload.

- [ ] **Step 2: Verify red**

Run: `.\scripts\npm.ps1 test -- --test-name-pattern="下单|订单详情"`

Expected: FAIL because checkout and order-detail page behavior are absent.

- [ ] **Step 3: Implement checkout and order detail**

Product detail sends unauthenticated users to login. Order detail displays amount snapshot, participants, status and history. Buttons come from `data.order.actions`; `PAY` uses the pay endpoint, `CONFIRM` uses confirm, and other actions use the status endpoint. Disable button submission while a request is in progress.

- [ ] **Step 4: Verify green**

Run: `.\scripts\npm.ps1 test -- --test-name-pattern="下单|订单详情"`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add miniprogram/pages/detail miniprogram/pages/order-detail miniprogram/app.json server/tests/miniprogram.test.ts
git commit -m "feat: connect checkout and order actions"
```

### Task 10: Evaluation UI and public review history

**Files:**
- Modify: `miniprogram/pages/order-detail/order-detail.js`
- Modify: `miniprogram/pages/order-detail/order-detail.wxml`
- Modify: `miniprogram/pages/order-detail/order-detail.wxss`
- Create: `miniprogram/pages/reviews/reviews.js`
- Create: `miniprogram/pages/reviews/reviews.json`
- Create: `miniprogram/pages/reviews/reviews.wxml`
- Create: `miniprogram/pages/reviews/reviews.wxss`
- Modify: `miniprogram/pages/detail/detail.js`
- Modify: `miniprogram/pages/detail/detail.wxml`
- Modify: `miniprogram/pages/profile/profile.js`
- Modify: `miniprogram/pages/profile/profile.wxml`
- Modify: `miniprogram/app.json`
- Modify: `server/tests/miniprogram.test.ts`

- [ ] **Step 1: Write failing evaluation UI tests**

Test star selection boundaries, empty content submission, duplicate submission blocking, and public review page using `GET /api/users/{id}/evaluations?page=1`. Test profile navigation to `/pages/orders/orders` and seller review navigation to `/pages/reviews/reviews?userId=...`.

- [ ] **Step 2: Verify red**

Run: `.\scripts\npm.ps1 test -- --test-name-pattern="评价页面|评价记录"`

Expected: FAIL because the evaluation controls and review page are absent.

- [ ] **Step 3: Implement evaluation and review pages**

Only show the evaluation form when `order.canEvaluate` is true. Allow 1～5 stars, optional content, and navigate back/refresh after 201. Public reviews show nickname, stars, content and date only. Add profile entries “我的订单” and seller review links without exposing internal order data.

- [ ] **Step 4: Verify green**

Run: `.\scripts\npm.ps1 test -- --test-name-pattern="评价页面|评价记录"`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add miniprogram/pages server/tests/miniprogram.test.ts
git commit -m "feat: add evaluation interfaces"
```

### Task 11: Required safety and concurrency integration tests

**Files:**
- Modify: `server/tests/integration.test.ts`

**Interfaces:**
- Consumes: completed order API

- [ ] **Step 1: Add the security matrix**

Add named tests for:

- `CONC-B`: concurrent checkout.
- `SEC-B-ORDER`: self-purchase, outsider detail, wrong role, stale version and arbitrary status.
- `IDEMP-B`: repeated create, pay, cancel, refund and evaluation.
- `SEC-B-REFUND`: refund does not release before success; completion sets `SOLD`.
- `SEC-B-FREEZE`: frozen product and disabled seller are not restored by cancellation or refund.
- `CREDIT-BOUND`: scores remain within 0～100 under repeated events.

- [ ] **Step 2: Run all new integration tests and inspect failures**

Run: `.\scripts\npm.ps1 run test:integration -- --test-name-pattern="B"`

Expected: any uncovered branch fails for a concrete reason; fix production code or test setup without weakening assertions.

- [ ] **Step 3: Run the full integration suite**

Run: `.\scripts\npm.ps1 run test:integration`

Expected: all legacy A tests and new B tests pass sequentially against MySQL.

- [ ] **Step 4: Commit**

```powershell
git add server/tests/integration.test.ts
git commit -m "test: cover order concurrency privacy and refunds"
```

### Task 12: Documentation and acceptance evidence

**Files:**
- Modify: `README.md`
- Modify: `docs/design.md`
- Modify: `docs/test-report.md`
- Modify: `docs/classroom-demo.md`
- Modify: `docs/tasks.md`
- Modify: `docs/changes.md`
- Create: `docs/orders.md`

**Interfaces:**
- Produces: migration notes, Mermaid state diagram, test commands, demo script

- [ ] **Step 1: Write `docs/orders.md`**

Include the migration table list, active-order generated key, transaction order, idempotency rules, roles, timeout behavior, refund release conditions, credit event contract and a Mermaid `sequenceDiagram` for the full flow.

- [ ] **Step 2: Update existing documents**

Replace statements that B is unimplemented. Mark B-01～B-07 complete only after all tests pass. Add the exact verified test counts and commands to the test report. Add a 6～8 minute classroom script showing happy path plus one concurrency or permission rejection.

- [ ] **Step 3: Verify documentation references**

Run: `rg -n "B尚未实现|B实现业务|订单.*后续|当前未提供.*下单" README.md docs`

Expected: no stale statement claims member B remains unimplemented.

- [ ] **Step 4: Commit**

```powershell
git add README.md docs
git commit -m "docs: document completed order and credit flow"
```

### Task 13: Final verification

**Files:**
- Verify only; modify files only to fix verification failures.

- [ ] **Step 1: Run static checks**

Run: `.\scripts\npm.ps1 run check`

Expected: exit code 0; mini-program and OpenAPI checks pass.

- [ ] **Step 2: Run unit and mini-program tests**

Run: `.\scripts\npm.ps1 test`

Expected: exit code 0 and zero failures.

- [ ] **Step 3: Run MySQL integration tests**

Run: `.\scripts\npm.ps1 run test:integration`

Expected: exit code 0 and zero failures.

- [ ] **Step 4: Run production build**

Run: `.\scripts\npm.ps1 run build`

Expected: exit code 0 and `dist/server/main.js` exists.

- [ ] **Step 5: Inspect final diff and history**

Run: `git status --short --branch`

Run: `git diff --check HEAD~5..HEAD`

Run: `git log --oneline --decorate -10`

Expected: no whitespace errors and all intended changes committed.

- [ ] **Step 6: Commit verification-only fixes if any**

```powershell
git add server database miniprogram scripts docs package.json
git commit -m "fix: address final member B verification"
```
