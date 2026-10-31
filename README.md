# 校园拾集

高校二手物品可信交易小程序，《软件工程基础》课程设计。**本仓库是小组共用的唯一项目，所有已完成模块都集成在默认分支 `main`。** 项目供本地开发者工具试用，尚未发布到微信搜索。

## 项目、报告与协作

| 内容 | 链接 |
|---|---|
| **第三部分软件实现报告（Word）** | [打开完整报告](docs/implementation-report/第三部分软件实现报告.docx) |
| 实现报告（GitHub 在线正文） | [阅读 Markdown](docs/implementation-report/实现报告正文.md) |
| PPT 图片与素材来源 | [20张模拟器截图、4张流程图及讲解提纲](docs/implementation-report/ppt-assets/README.md) |
| 小组任务与进度 | [按功能模块查看](docs/tasks.md) |
| 同学加入协作 | [填写 GitHub 申请](https://github.com/Boss-H24/campus-trust-market/issues/new?template=join-team.yml) |
| 代码协作与接手说明 | [CONTRIBUTING](CONTRIBUTING.md) · [统一项目交接](docs/handoff/README.md) |

代码和文档均可公开阅读。申请写入权限后，可在同一项目中协作；功能改动通过分支和 PR 汇入 `main`，但运行、报告和演示始终以这一个统一项目为准。历史分支与提交只用于保留开发记录。

## 已实现功能

- 学生演示登录、学籍实名提交与管理员审核、个人资料脱敏。
- 商品图片上传、发布审核、上下架、编辑重审、分类/关键词/价格检索。
- 订单创建、模拟支付、交割确认、取消退款和纠纷处理。
- 双向评价、信誉事件、站内咨询、收藏、商品举报及监管工作台。
- 隐私加密、服务端权限/状态校验、重复发布与并发拦截。

## 小组成员与负责内容

| 成员 | 主要负责部分 |
|---|---|
| A | 公共工程、用户登录与实名认证、隐私保护、商品发布检索、项目整合 |
| B | 订单与状态流转、模拟支付/退款、交易评价和信誉 |
| C | 在线咨询、收藏、商品举报和监管工作台 |

支付、退款和学籍校验为本地课堂演示。微信平台真实登录需要配置服务端 AppSecret，尚未联调；本项目也尚未发布为可搜索的小程序。

## Windows 本地运行

在项目根目录打开 PowerShell：

```powershell
git clone https://github.com/Boss-H24/campus-trust-market.git
cd campus-trust-market
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

首次准备需要联网下载项目本地 Node/npm 和 MySQL。程序运行数据放在被 Git 忽略的 `.runtime`，本机配置 `.env` 不要提交或发给同学。健康检查：[http://127.0.0.1:3000/api/health](http://127.0.0.1:3000/api/health)。

### 微信开发者工具

1. 安装微信开发者工具，导入仓库中的 `miniprogram` 目录。
2. 保持本地后端运行；本地调试关闭合法域名校验。
3. 在“我的”页面选择课堂演示登录，使用本机 `.env` 中的 `DEMO_PASSWORD`。
4. 真机联调需要改用电脑局域网地址；线上环境需要 HTTPS 和登记域名。

演示账号均为虚构数据：`seller`（陈同学）、`buyer`（周同学）、`newstudent`（林同学）、`admin`（平台管理员）、`outsider`（未认证访客）。密码只保存在本机配置。

## 检查命令

```powershell
.\scripts\npm.ps1 run check
.\scripts\npm.ps1 run build
.\scripts\npm.ps1 test
.\scripts\npm.ps1 run test:integration
.\scripts\npm.ps1 run test:performance
```

当前报告记录了类型/构建、页面与接口契约、单元及 MySQL 集成、原生编译和本机并发检索证据，及其适用范围：[测试记录](docs/test-report.md)。集成测试只重置 `.env` 明确配置的独立 `_test` 数据库，不要与其他数据库任务同时运行。

## 文档索引

- [需求与设计](docs/design.md) · [接口与功能交接](docs/team-handoff.md) · [OpenAPI 接口](docs/openapi.json) · [变更记录](docs/changes.md)
- [测试记录](docs/test-report.md) · [课堂演示流程](docs/classroom-demo.md)
- [摄影样图来源与授权](assets/demo-products/README.md)

技术路线：微信原生小程序、TypeScript、Node.js 24、Express 5、MySQL 8.4（兼容8.0）；服务端按 Controller、Service、Repository 分层。
