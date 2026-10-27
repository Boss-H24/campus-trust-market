# 校园拾集

高校二手物品可信交易小程序，《软件工程基础》课程设计。

当前交付是**成员 A 的可运行增量**：登录、学生认证、人工审核、商品发布检索、上下架、隐私保护与测试。订单、模拟支付、评价信誉、咨询和举报由 B/C 继续实现，当前界面不会伪造这些功能已完成。

验收状态：后端业务测试、官方WXML/WXSS编译和真实模拟器九步完整流程已通过。首次空白由开发工具基础库缓存移动失败引起，现已恢复；默认隐藏上传目录中的图片访问也已补回归并修复。真机及微信平台真实登录的联调状态单列于测试报告。

界面预览：[校园首页](docs/images/home.jpg)、[商品详情](docs/images/detail.png)。图片来自真实开发者工具，商品与学生身份均为虚构演示数据。

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
3. 保持后端启动，在“我的”中选择“课堂演示登录”，输入 `.env` 中的 `DEMO_PASSWORD`。
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
- [实现说明及数据库关系](docs/design.md)
- [OpenAPI 接口契约](docs/openapi.json)
- [测试记录与人工验收单](docs/test-report.md)
- [课堂演示步骤与讲解](docs/classroom-demo.md)

技术：Node 24 LTS、TypeScript、Express 5、MySQL2、MySQL 8.4；后端 Controller → Service → Repository。公共接口返回 `{code,message,data,requestId}`；金额采用整数分，数据库 bigint 编号以字符串传输。
