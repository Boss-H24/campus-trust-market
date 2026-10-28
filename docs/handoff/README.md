# B/C交接包：从这里开始

本目录和仓库源码共同组成成员A的交接包。A已实现可运行的用户/商品基础；B/C按各自接入清单继续开发。当前完整版本位于 `feature/interface-polish`，复核入口为[PR #1](https://github.com/Boss-H24/campus-trust-market/pull/1)。

## 获取与启动

有私有仓库权限后，按[协作说明](../../CONTRIBUTING.md)克隆并切换分支。也可在[完整交付分支](https://github.com/Boss-H24/campus-trust-market/tree/feature/interface-polish)点击 **Code → Download ZIP**；ZIP包含源码、迁移、配置模板、授权图片及全部文档。每台电脑首次执行setup生成独立配置，不需要A的数据库或密码。

固定交接快照：[member-a-20261028 源码ZIP](https://github.com/Boss-H24/campus-trust-market/archive/refs/tags/member-a-20261028.zip)。私有仓库下载需先登录获邀账号。该快照供验收留档，后续协作继续使用Git分支，避免相互覆盖文件。

后补的[第三部分软件实现报告及PPT素材](../implementation-report/README.md)随当前分支提供；含报告的完整交接快照为[member-a-report-20261028](https://github.com/Boss-H24/campus-trust-market/archive/refs/tags/member-a-report-20261028.zip)，保留原代码快照不变。

可运行性检查：启动后端→`http://127.0.0.1:3000/api/health`→开发者工具导入`miniprogram`→匿名查看四件摄影样图商品→演示卖家登录→“我的商品”。密码从自己电脑生成的`.env`读取。

## 包内资料

| 资料 | 使用方式 |
|---|---|
| [根README](../../README.md) | 环境、启动、演示账号、测试命令 |
| [仓库说明](../../CONTRIBUTING.md) | 目录、分支、PR和迁移协作 |
| [任务清单](../tasks.md) | A/B/C认领及验收状态 |
| [B接入清单](member-b.md) / [C接入清单](member-c.md) | 第一个可提交增量、依赖与验收 |
| [接口交接](../team-handoff.md) / [OpenAPI](../openapi.json) | B/C冻结边界；20个A已实现操作 |
| [设计](../design.md) / [变更记录](../changes.md) | 分层、ER图、隐私及交接冲突处理 |
| [测试报告](../test-report.md) / [课堂脚本](../classroom-demo.md) | 验收证据与展示步骤 |
| [素材说明](../../assets/demo-products/README.md) | 摄影图片、授权与演示样图标注 |

## 公共规则

- 接口前缀`/api`；统一返回`{code,message,data,requestId}`，`code:0`表示成功；权限依HTTP状态码处理。
- 登录得到的token放`Authorization: Bearer ...`；小程序复用`miniprogram/utils/api.js`，不放URL。
- 编号为字符串、金额为整数分、列表默认每页20条。客户端提交动作；角色、所有权、状态及版本由后端检查。
- 公共类型和订单/信誉常量在`server/contracts.ts`。数据库事务复用`server/db/database.ts`的`transaction`，事务内传同一个连接。
- B/C接口当前尚未实现；详细请求和权限以`docs/team-handoff.md`为准。新增真实接口时同步OpenAPI，不以空响应代替功能。

## 接手确认

- [ ] 取得个人GitHub协作权限并在任务清单填写用户名。
- [ ] 自己电脑能初始化、启动、显示四件商品并用本机演示身份登录。
- [ ] 跑过类型、构建、单元及MySQL集成，理解测试库与演示库的区别。
- [ ] 确认B/C迁移编号、信誉事件接口及公共文件修改边界。
- [ ] 创建个人功能分支，先交一个带测试和文档的最小PR。

A的当前限制：AppID已配置，AppSecret未配置，真实微信登录及真机联调未验收；演示登录和模拟器完整流程已通过。原始需求/设计DOCX未改动，差异只记在仓库变更记录中。
