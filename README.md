# 校园拾集

当前联合试用分支 `codex/try-bc` 集成 A、B、C，包含订单评价、咨询收藏和监管入口，修正举报信誉适配及订单取消/退款保留监管冻结。使用方式与本次验证见 [B/C联合试用](docs/bc-trial.md)。下文各成员交付记录保留原验收快照。

**最新界面（2026-10-31）**：[橙红首页、黄蓝绿专区及真实截图](docs/ui-colours.md)。目前为开发试用版本，尚未正式发布到微信搜索。

高校二手物品可信交易小程序，《软件工程基础》课程设计。

## 报告与小组协作入口

**报告已上传：Word当前是A+C增量版（报告说明为16页），B的订单实现说明单独在线提供，尚未并入Word。下表均指向最新试用分支。**

| 资料 | 入口 |
|---|---|
| Word实现报告（A+C增量版） | [第三部分软件实现报告.docx](https://github.com/Boss-H24/campus-trust-market/blob/codex/try-bc/docs/implementation-report/第三部分软件实现报告.docx) |
| 在线报告正文（含C新增章节） | [直接在 GitHub 阅读](https://github.com/Boss-H24/campus-trust-market/blob/codex/try-bc/docs/implementation-report/实现报告正文.md) |
| B：订单、评价与信誉实现说明 | [直接在线阅读](https://github.com/Boss-H24/campus-trust-market/blob/codex/try-bc/docs/orders.md) |
| 报告版本与更新位置 | [版本说明及C章节入口](https://github.com/Boss-H24/campus-trust-market/blob/codex/try-bc/docs/implementation-report/README.md) |
| PPT 截图与讲解提纲 | [图片、流程图及逐页讲解](https://github.com/Boss-H24/campus-trust-market/tree/codex/try-bc/docs/implementation-report/ppt-assets) |
| 三人任务规划 | [A/B/C 分工和任务认领](https://github.com/Boss-H24/campus-trust-market/blob/codex/try-bc/docs/tasks.md) |
| 其他成员接入交接 | [B/C 从这里开始](https://github.com/Boss-H24/campus-trust-market/tree/codex/try-bc/docs/handoff) |
| 申请加入小组 | [点击填写协作申请](https://github.com/Boss-H24/campus-trust-market/issues/new?template=join-team.yml) |
| 完整工程与协作规则 | [当前完整代码](https://github.com/Boss-H24/campus-trust-market/tree/codex/try-bc) · [分支和 PR 约定](https://github.com/Boss-H24/campus-trust-market/blob/codex/try-bc/CONTRIBUTING.md) |

A阶段原分支和历史标签保留原样，当前统一试用与报告入口为`codex/try-bc`。同学推送自己的功能分支后，需将文档修改同步到该分支；其他分支不会自动更新。

**加入协作**：本仓库现已公开，代码与文档可直接阅读。小组同学请登录 GitHub 后点击[申请加入小组](https://github.com/Boss-H24/campus-trust-market/issues/new?template=join-team.yml)，填写群内昵称和分工。负责人可从申请作者直接看到 GitHub 账号，确认后发送协作邀请。接受邀请后即可推送自己的分支，也可通过 Fork 和 PR 提交修改。

本地试用分支集成 A、B、C：认证与商品、订单与评价、咨询收藏及监管。当前联调验证另见本地试用记录，原分支验收数据保留为历史记录。

验收状态：当前综合套件包含20项单元/页面行为测试、23组真实MySQL集成测试、11个原生小程序页面静态检查及28个OpenAPI操作一致性检查，均通过；成员 B 新增页面尚待微信开发者工具原生编译与真实导航复验。A 基线曾通过官方WXML/WXSS编译和十步模拟器流程。真机及微信平台真实登录的联调状态单列于测试报告。

组员从[交接包入口](docs/handoff/README.md)开始，按[任务看板](docs/tasks.md)认领工作；分支、PR与提交约定见[仓库协作说明](CONTRIBUTING.md)。当前完整交付分支为 `codex/try-bc`，见[PR #1](https://github.com/Boss-H24/campus-trust-market/pull/1)，另一位组员复核后合入 `main`。

界面预览：[校园首页](docs/images/home.jpg)、[商品详情](docs/images/detail.png)。图片来自真实开发者工具，商品与学生身份均为虚构演示数据。

商品摄影素材及来源见[样图说明](assets/demo-products/README.md)。新环境首次初始化即有四件摄影样图商品；再次seed不会覆盖组员已有商品。已有环境可在编辑页面选择该目录图片，修改后仍须管理员审核。

## 快速运行 Windows

在项目根目录打开 PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

首次准备需要联网：下载项目本地 npm、MySQL，必要时下载 Node 24。运行文件保存在 `.tools`，数据库、图片与日志保存在 `.runtime`，不安装 Windows 服务，不修改全局 npm。中文目录会自动在用户本地应用目录 `CampusTrustMarket` 下创建专用 ASCII junction 兼容 MySQL 的路径处理；数据仍在项目目录。

服务地址：[健康检查](http://127.0.0.1:3000/api/health)。MySQL 默认监听 `127.0.0.1:3307`。首次启动随机生成 `.env`，其中 `DEMO_PASSWORD` 是演示账号的共同密码；不要将 `.env` 发进群或提交 Git。再次 setup 不覆盖配置和业务数据。

如果依赖已经准备好，离线执行 `scripts/setup.ps1 -SkipDownloads`。如使用自己安装的数据库，修改 `.env` 的连接配置，跳过 `start-db.ps1`，直接执行迁移与种子命令。

### 微信开发者工具

1. 安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)，选择“导入项目”，目录为 `miniprogram`。
2. 当前项目已配置本组申请的测试号 AppID `wx586d8f7c807a2c06`。使用该号需要相应开发权限；组员也可换成自己的测试号或 `touristappid`。本地调试关闭合法域名校验，工具可能要求先登录微信。
3. 保持后端启动，在“我的”中选择“课堂演示登录”，输入 `.env` 中的 `DEMO_PASSWORD`。登录页根据服务端开关显示可用方式，未配置微信密钥时直接提供课堂演示身份。
4. 真机不能访问电脑的 `127.0.0.1`。真机联调时把 `miniprogram/config.js` 改为电脑局域网地址，同时修改 `.env` 的 `HOST`，配置网络访问。上线使用 HTTPS 和已登记域名。

真实微信登录：配置服务端 `.env` 中的 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`，以及小程序 `project.config.json` 中的同一个 AppID。密钥只放服务端；`session_key` 不返回客户端。`NODE_ENV=production` 强制禁用演示登录并要求微信配置。当前已配置测试号 AppID，AppSecret 尚未配置，平台真实登录未验收。

## 演示身份

以下数据均为虚构，学校为“演示大学”。

| 账号 | 身份 | 初始认证 | 用途 |
|---|---|---|---|
| seller | 陈同学 | 已通过 | 发布与管理商品 |
| buyer | 周同学 | 已通过 | 浏览商品、验证越权 |
| newstudent | 林同学 | 未认证 | 姓名“林同学”、学号 `2023000004`、手机号 `13800000004`，演示完整审核流程 |
| admin | 平台管理员 | 已通过 | 审核实名、审核商品 |
| outsider | 访客同学 | 未认证，无有效学籍 | 演示身份校验拦截 |

## 开发与测试

无需系统全局 npm，可使用仓库脚本：

```powershell
.\scripts\npm.ps1 run check
.\scripts\npm.ps1 test
.\scripts\npm.ps1 run build
.\scripts\npm.ps1 run test:integration
.\scripts\npm.ps1 run test:performance
# 可选：使用已安装的官方原生编译器检查模板和样式
.\scripts\check-native.ps1 -DevToolsPath 'E:\Apps\微信web开发者工具'
```

数据库初始化：`scripts/npm.ps1 run db:migrate`、`scripts/npm.ps1 run db:seed`。独立测试库为 `campus_market_test`，集成测试只重置该库；不会清空 `campus_market`。停止便携数据库执行 `scripts/stop-db.ps1`，先退出后端进程。

原生模拟器自动验收另见 [测试报告](docs/test-report.md#原生模拟器流程复验)。可选工具 SDK 安装到忽略的 `.tools/automator`，不加入应用依赖；脚本使用真实页面、接口和 MySQL，仅为相册选择器提供虚构图片。

## 协作文档

- [三人分工及交接契约](docs/team-handoff.md)
- [B/C交接包与首次接入](docs/handoff/README.md)
- [订单、评价与信誉实现说明](docs/orders.md)
- [实施任务规划及认领清单](docs/tasks.md)
- [仓库目录、分支和PR约定](CONTRIBUTING.md)
- [实现说明及数据库关系](docs/design.md)
- [OpenAPI 接口契约](docs/openapi.json)
- [测试记录与人工验收单](docs/test-report.md)
- [课堂演示步骤与讲解](docs/classroom-demo.md)
- [第三部分软件实现Word报告及PPT素材](docs/implementation-report/README.md)

技术：Node 24 LTS、TypeScript、Express 5、MySQL2、MySQL 8.4；后端 Controller → Service → Repository。公共接口返回 `{code,message,data,requestId}`；金额采用整数分，数据库 bigint 编号以字符串传输。
