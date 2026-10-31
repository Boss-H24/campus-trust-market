# 仓库协作说明

本仓库是《软件工程基础》课程设计“高校二手物品可信交易小程序”的统一项目。公开仓库：[Boss-H24/campus-trust-market](https://github.com/Boss-H24/campus-trust-market)。当前完整且唯一的交付版本在 `main`，按业务功能协作，不把不同成员的工作拆成不同产品版本。

## 加入项目

小组同学可直接阅读代码和文档。要取得写入权限，请登录 GitHub 后填写[协作申请](https://github.com/Boss-H24/campus-trust-market/issues/new?template=join-team.yml)；仓库负责人可从申请作者确认账号后发送邀请。接受邀请后从统一的 `main` 开始协作。

## 工程目录

| 目录 | 内容 |
|---|---|
| `miniprogram/pages` | 微信原生页面与业务交互 |
| `miniprogram/utils` | 请求、图片和格式化等共享封装 |
| `server` | Express 路由、业务 Service、Repository、鉴权与数据库工具 |
| `database/migrations` | 按序追加且不可修改的数据库迁移 |
| `server/tests` | 单元、页面行为和真实 MySQL 集成测试 |
| `scripts` | Windows 环境准备、运行、检查脚本 |
| `docs` | 需求设计、接口、实现报告、任务和测试资料 |
| `docs/implementation-report/ppt-assets` | 课堂展示截图、流程图和来源清单 |

## 开发流程

1. 从 `main` 同步后，按一个可验证的业务功能创建分支；避免把未完成代码直接提交到 `main`。
2. 在[任务清单](docs/tasks.md)更新对应功能、状态和认领人。一次 PR 尽量只覆盖一个可复核的功能增量。
3. 数据结构变化新增迁移文件；已应用迁移不得改写。当前迁移序号从仓库最新编号继续，提交前检查现有文件名。
4. 接口变化同步更新 `docs/openapi.json` 与相关说明。共享鉴权、错误格式、订单状态和信誉事件规则先在项目中协调，再提交。
5. PR 写明功能、影响范围、数据库迁移、运行命令、结果及仍未完成事项；由另一位组员复核并通过 CI 后合入 `main`。

建议提交前运行：

```powershell
.\scripts\npm.ps1 run check
.\scripts\npm.ps1 run build
.\scripts\npm.ps1 test
.\scripts\npm.ps1 run test:integration
git diff --check
```

集成测试仅操作 `.env` 中配置的独立 `_test` 数据库。不要在集成测试、性能测试与本机演示验收同时运行时修改同一数据库。

## 隐私与课堂演示

`.env`、`.runtime`、`.tools`、本地日志、真实身份材料和微信开发者工具凭据不得提交。仓库只使用虚构身份和授权摄影样图。演示付款和退款为模拟业务；真实微信平台登录和真机验收单独记录。每台电脑用 `scripts/setup.ps1` 创建自己的本地配置，不复制其他人的密码或数据库。

更多入口见根目录 [README](README.md)、[任务规划](docs/tasks.md)、[统一项目交接说明](docs/handoff/README.md) 和 [实现报告](docs/implementation-report/README.md)。
