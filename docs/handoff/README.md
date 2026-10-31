# 统一项目交接说明

本目录入口说明的是同一个高校二手交易小程序。所有功能、接口、数据库迁移、报告和截图已汇入仓库默认分支 `main`；课堂演示和后续协作均从这一版本开始。旧文件名或提交记录只用于追溯开发过程，不构成其他可运行版本。

## 获取与运行

仓库公开阅读：[Boss-H24/campus-trust-market](https://github.com/Boss-H24/campus-trust-market)。同学申请写入权限请用[GitHub协作申请](https://github.com/Boss-H24/campus-trust-market/issues/new?template=join-team.yml)。

```powershell
git clone https://github.com/Boss-H24/campus-trust-market.git
cd campus-trust-market
git switch main
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

服务启动后访问 `http://127.0.0.1:3000/api/health`；微信开发者工具导入 `miniprogram`。演示账号和本机口令位置见[根目录说明](../../README.md)。`.env`、数据库和微信工具凭据只保留在个人电脑，不在同学之间复制。

## 重要交付资料

| 资料 | 作用 |
|---|---|
| [项目首页](../../README.md) | 功能范围、Word报告链接、图片素材、试用和协作入口 |
| [第三部分 Word 实现报告](../implementation-report/第三部分软件实现报告.docx) | 当前统一功能实现、测试与课堂展示内容 |
| [在线报告正文](../implementation-report/实现报告正文.md) | 可直接在 GitHub 阅读和引用的正文 |
| [PPT素材目录](../implementation-report/ppt-assets/README.md) | 模拟器截图、流程图、来源与讲解提纲 |
| [任务进度](../tasks.md) | 统一功能模块及待办状态 |
| [协作说明](../../CONTRIBUTING.md) | 分支、PR、迁移及本地配置要求 |
| [设计说明](../design.md) / [OpenAPI](../openapi.json) | 架构、数据库关系、请求响应与权限 |
| [测试记录](../test-report.md) / [课堂流程](../classroom-demo.md) | 自动化证据、运行边界和试讲步骤 |
| [摄影素材授权](../../assets/demo-products/README.md) | 演示商品图片来源和说明 |

## 代码约定

- 接口前缀为 `/api`，统一响应 `{code,message,data,requestId}`。
- 会话令牌放在 `Authorization: Bearer ...` 请求头；不放进 URL。
- 编号按字符串传输，金额按整数分存储；列表默认每页20条。
- 角色、商品所有权、订单状态和审核版本由后端检查；客户端只发送业务动作。
- 已应用数据库迁移不得修改；结构变化以新迁移追加，并更新接口和测试。
- 课堂支付/退款为模拟流程；真实微信登录与真机验收需单独完成并如实记录。

首次接手请按协作说明从 `main` 同步；以实现报告和任务页中的当前状态准备课堂演示。历史 ZIP、标签和旧分支仅保留作提交追溯，不作为当前文档或截图来源。
