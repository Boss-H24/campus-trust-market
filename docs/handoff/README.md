# B/C交接包：从这里开始

本目录和仓库源码共同组成成员A的交接包。A已实现可运行的用户/商品基础；B/C按各自接入清单继续开发。当前完整版本位于 `feature/interface-polish`，复核入口为[PR #1](https://github.com/Boss-H24/campus-trust-market/pull/1)。

本地`feature/chat-reports`另包含C实现，参见[C→B交接](c-to-b.md)、[C设计与演示](../member-c-design.md)及[C测试证据](../member-c-test-report.md)。B正式信誉服务和最终全组联调仍待完成。

## 获取与启动

仓库已公开，可直接在线阅读。按[协作说明](../../CONTRIBUTING.md)克隆并切换分支进行开发；小组同学先填写[协作申请](https://github.com/Boss-H24/campus-trust-market/issues/new?template=join-team.yml)，负责人核对身份后邀请写入权限。每台电脑首次执行setup生成独立配置，不需要A的数据库或密码。

固定交接快照：[member-a-20261028 源码ZIP](https://github.com/Boss-H24/campus-trust-market/archive/refs/tags/member-a-20261028.zip)。该快照供验收留档，后续协作使用Git分支与PR，避免相互覆盖文件。

后补的[第三部分软件实现报告及PPT素材](../implementation-report/README.md)随当前分支提供；含报告的完整交接快照为[member-a-report-20261028](https://github.com/Boss-H24/campus-trust-market/archive/refs/tags/member-a-report-20261028.zip)，保留原代码快照不变。

可运行性检查：启动后端→`http://127.0.0.1:3000/api/health`→开发者工具导入`miniprogram`→匿名查看四件摄影样图商品→演示卖家登录→“我的商品”。密码从自己电脑生成的`.env`读取。

## 包内资料

| 资料 | 使用方式 |
|---|---|
| [根README](../../README.md) | 环境、启动、演示账号、测试命令 |
| [仓库说明](../../CONTRIBUTING.md) | 目录、分支、PR和迁移协作 |
| [任务清单](../tasks.md) | A/B/C认领及验收状态 |
| [B接入清单](member-b.md) / [C接入清单](member-c.md) | 第一个可提交增量、依赖与验收 |
| [接口交接](../team-handoff.md) / [OpenAPI](../openapi.json) | B/C边界；本分支含A+C共42个已实现操作 |
| [设计](../design.md) / [变更记录](../changes.md) | 分层、ER图、隐私及交接冲突处理 |
| [测试报告](../test-report.md) / [课堂脚本](../classroom-demo.md) | 验收证据与展示步骤 |
| [素材说明](../../assets/demo-products/README.md) | 摄影图片、授权与演示样图标注 |

## 公共规则

- 接口前缀`/api`；统一返回`{code,message,data,requestId}`，`code:0`表示成功；权限依HTTP状态码处理。
- 登录得到的token放`Authorization: Bearer ...`；小程序复用`miniprogram/utils/api.js`，不放URL。
- 编号为字符串、金额为整数分、列表默认每页20条。客户端提交动作；角色、所有权、状态及版本由后端检查。
- 公共类型和订单/信誉常量在`server/contracts.ts`。数据库事务复用`server/db/database.ts`的`transaction`，事务内传同一个连接。
- B 和 C 增量均已提交，本地试用分支进行联合验证；原始独立交付边界详见两份交接记录。

## 接手确认

- [ ] 取得个人GitHub协作权限并在任务清单填写用户名。
- [ ] 自己电脑能初始化、启动、显示四件商品并用本机演示身份登录。
- [ ] 跑过类型、构建、单元及MySQL集成，理解测试库与演示库的区别。
- [ ] 确认B/C迁移编号、信誉事件接口及公共文件修改边界。
- [ ] 创建个人功能分支，先交一个带测试和文档的最小PR。

A的当前限制：AppID已配置，AppSecret未配置，真实微信登录及真机联调未验收；演示登录和模拟器完整流程已通过。原始需求/设计DOCX未改动，差异只记在仓库变更记录中。
