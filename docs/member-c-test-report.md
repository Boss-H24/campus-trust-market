# C 本地验证记录

日期：2026-10-29；Windows PowerShell 5、Node v24.19.0、MySQL 8.4.13。A完整基线 `08471a9`，C分支 `feature/chat-reports`。测试只使用与 `DB_NAME + '_test'` 严格匹配的独立库，不重置演示库。

## 已执行

| 检查 | 结果 |
|---|---|
| TypeScript / 小程序静态检查 / OpenAPI一致性 | 通过，11页、42个已实现操作 |
| TypeScript构建 | 通过 |
| 原有单元/页面测试 | 13项通过 |
| C单元/页面测试 | 7项通过 |
| A真实MySQL回归 | 9组通过 |
| C真实MySQL专项 | 11组通过 |
| 100并发商品查询 | 100成功；212件商品，p95 194.70ms，目标≤2000ms |
| `git diff --check` | 通过 |

性能只代表本地HTTP和当前数据规模，证据在忽略目录 `.artifacts/performance.json`。不代表真机、图片下载或生产负载。

C单元覆盖：规则边界和恶意参数、3秒轮询/立即续页/隐藏卸载停止、隐藏前在途响应、换账号清理草稿、消息网络重试沿用幂等键、不跳游标、A审核版本及冲突刷新、列表模式切换/分页。

C集成覆盖：并发复用会话、禁止自聊、未认证可咨询、陌生人与管理员不能进入参与者接口、消息唯一键/异内容冲突/内容拦截、50条分页和bigint游标、收藏幂等与失效展示、举报人隔离/重复工单/凭证授权、规则版本和动态频率、分类停用保留引用、日志脱敏、账号撤销令牌/恢复、禁止role和credit赋值、举报驳回与成立禁用。

事务专项：默认生产适配器缺少B时503并全回滚；注入信誉服务报错回滚；并发成立一成功一409；扣分之后再发生商品状态错误时账本与分数也回滚；锁定商品冻结保留LOCKED；独立冻结标志防状态误改绕过；解冻校验版本且不直接上架。

## 可复现命令

```powershell
.\scripts\npm.ps1 run check
.\scripts\npm.ps1 run build
.\scripts\npm.ps1 test
.\scripts\npm.ps1 run test:integration
.\scripts\npm.ps1 run test:performance
git diff --check
```

上述标准`npm test`（20项）和`npm run test:integration`（20组）均已执行通过。受限环境最初阻止Node测试执行器创建子进程（spawn EPERM）；放行测试进程后标准命令通过，同样测试也已分别用无子进程模式验证。受限环境可使用：

```powershell
.\.tools\node\node.exe --test --test-isolation=none server/tests/unit.test.ts server/tests/miniprogram.test.ts server/tests/community.test.ts
.\.tools\node\node.exe --env-file=.env --test --test-isolation=none server/tests/integration.test.ts
.\.tools\node\node.exe --env-file=.env --test --test-isolation=none server/tests/community.integration.test.ts
```

两个数据库测试文件必须分别执行或使用默认文件隔离且 `--test-concurrency=1`，不可在无隔离模式下一次合并两个文件，因为文件级before/after夹具各自持有服务与清理过程。性能测试也串行执行。

## 未计为通过

- B真实 `CreditService`、正式 `credit_event` 唯一键、订单取消/退款的冻结保护及最终A+B+C排练。C测试使用明确的测试信誉适配器，不是B生产验收。
- 微信开发者工具的新页面原生编译、模拟器交互、真实微信登录及真机联调。本机只验证JS/JSON/WXML结构、绑定事件和页面逻辑；未声称视觉或原生编译通过。
- GitHub上分支推送、PR、CI及同伴复核。本次交付在本地分支；不代替A/B确认公共接口变更。

## 环境修复

PowerShell原生下载失败后通过官方URL下载并校验Node SHA256、npm SHA512及MySQL既定MD5；依赖缓存改到项目内忽略目录。`start-db.ps1`改用隐藏进程、stderr日志文件和退出码判断MySQL初始化，避免PowerShell 5将正常stderr信息日志当作失败。项目内数据、本机随机`.env`和专用ASCII junction按A脚本生成，不提交凭据。
