# 仓库协作说明

项目为《软件工程基础》课程设计“高校二手物品可信交易小程序”，展示名“校园拾集”。这是同一个小程序工程，后端提供HTTP接口。A已交付用户和商品增量；B/C按任务清单继续实现。

## 仓库入口

公开仓库：[Boss-H24/campus-trust-market](https://github.com/Boss-H24/campus-trust-market)，代码和文档均可直接阅读。小组同学登录GitHub后填写[加入申请](https://github.com/Boss-H24/campus-trust-market/issues/new?template=join-team.yml)，负责人会从申请作者识别账号、核对身份后邀请协作；无需另填用户名。接受邀请后可推送自己的分支，也可通过Fork和PR贡献。当前最新交付在 `feature/interface-polish`（[PR #1](https://github.com/Boss-H24/campus-trust-market/pull/1)），`main`为已验收的基础版。PR由另一位同学复核后合入。

| 目录 | 用途及负责人 |
|---|---|
| `miniprogram/pages` | 原生页面；各自新增自己负责的页面 |
| `miniprogram/utils` | A维护的请求、图片及格式化封装 |
| `server/app.ts` | Controller路由、公共鉴权与响应 |
| `server/users`、`server/products` | A的Service/Repository，供接入参考 |
| `server/contracts.ts` | 公共角色、状态、订单流转和信誉规则 |
| `server/db`、`database/migrations` | 数据库工具、种子、不可变迁移 |
| `server/tests` | 单元/原生页面行为、真实MySQL集成测试 |
| `scripts` | Windows环境、启动、检查及验收脚本 |
| `docs`、`assets/demo-products` | 任务、接口、设计、测试、演示和授权摄影样图 |
| `.github/workflows` | CI：类型、构建、单元、MySQL集成、性能 |

## 第一次加入

```powershell
git clone https://github.com/Boss-H24/campus-trust-market.git
cd campus-trust-market
git switch main
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

从项目根目录运行命令。导入 `miniprogram` 到微信开发者工具；演示身份和密码位置见根目录README。不要复制A电脑的`.env`或数据库；setup会为每台电脑生成本地配置和虚构数据。

## 开发与提交

1. `main`为A、B、C接续完成的统一项目。每次先同步main，再提交自己的小范围改动；运行和交付均以main为准。
2. 在[任务清单](docs/tasks.md)对应项填写自己的GitHub用户名并勾选状态。一次PR只处理一个可验证增量。
3. 003/004迁移已合入；后续从005开始协调新增迁移。已应用的迁移不能修改，迁移工具会校验摘要。
4. 公共鉴权、状态或接口变化先与A及相关成员讨论；实际接口同步OpenAPI和接入文档。
5. 提交前执行下列检查；PR写清需求/任务编号、行为、迁移、验证命令及未完成事项。

```powershell
.\scripts\npm.ps1 run check
.\scripts\npm.ps1 run build
.\scripts\npm.ps1 test
.\scripts\npm.ps1 run test:integration
```

集成和性能测试仅操作明确的`DB_NAME + '_test'`库，彼此及模拟器验收不能同时运行。提交前检查`git diff --check`和`git status`。提交示例：`feat(orders): lock product when creating an order`。推送自己的功能分支，打开PR，由另一位同学复核且CI通过后合入main。

配置模板为`.env.example`。`.env`、`.runtime`、`.tools`、日志、开发者工具私有配置和真实身份材料均不提交。摄影来源与授权说明随素材保留。

## 交付标准

每人同时交付页面、接口、迁移、测试和讲解。以[任务清单](docs/tasks.md)、[完整接口边界](docs/team-handoff.md)和[交接包](docs/handoff/README.md)为验收依据。真实微信登录和真机测试单独记录；订单付款为课堂模拟流程。
