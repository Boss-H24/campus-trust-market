# PPT图片素材与课堂讲解提纲

本目录与统一项目的 Word 实现报告配套，包含20张微信开发者工具模拟器原图及4张按当前代码绘制的说明图。图片使用虚构演示身份和商品数据；模拟器原图保留页面原色，不裁改业务状态。图文件的SHA-256、路由、演示身份、日期、数据库和截图方式见 [provenance.json](provenance.json)。

## 原生页面截图

| 文件 | 页面 | 可展示内容 |
|---|---|---|
| [01-home.jpg](01-home.jpg) | 首页 | 橙红色导购区、分类、价格入口及商品卡片 |
| [02-detail.png](02-detail.png) | 商品详情 | 商品摄影、价格、成色、卖家认证与信誉 |
| [03-publish.png](03-publish.png) | 发布商品 | 图片、标题、类别、价格和描述表单 |
| [04-review.png](04-review.png) | 商品审核 | 待审队列与管理员审核操作 |
| [09-profile.png](09-profile.png) | 个人中心 | 身份卡、信誉分和业务入口 |
| [10-login.png](10-login.png) | 登录 | 本地课堂演示登录入口（密码框为空） |
| [11-certification.png](11-certification.png) | 学生认证 | 认证结果与个人资料脱敏展示 |
| [12-mine.png](12-mine.png) | 我的商品 | 审核、在售、下架及售出状态与操作 |
| [13-orders.png](13-orders.png) | 订单列表 | 买入订单及交易状态 |
| [14-order-paid.png](14-order-paid.png) | 订单详情 | 模拟付款后的状态与可执行动作 |
| [15-order-completed.png](15-order-completed.png) | 订单详情 | 完成后的状态历史和评价 |
| [16-evaluations.png](16-evaluations.png) | 公开评价 | 交易评价展示及隐私边界 |
| [17-chat.png](17-chat.png) | 站内咨询 | 买卖双方真实消息往返 |
| [18-favorites.png](18-favorites.png) | 收藏 | 商品收藏和当前可用状态 |
| [19-report.png](19-report.png) | 举报表单 | 举报原因与说明输入 |
| [20-reports.png](20-reports.png) | 我的互动 | 本人举报的处理结果与理由 |
| [21-moderation.png](21-moderation.png) | 监管工作台 | 待处理举报和调查处置入口 |
| [22-frozen.png](22-frozen.png) | 监管工作台 | 商品冻结后的状态与解冻入口 |
| [23-rules.png](23-rules.png) | 监管工作台 | 平台规则查看与修改入口 |
| [24-users.png](24-users.png) | 监管工作台 | 账号状态与信誉管理 |

## 代码与流程说明图

| 文件 | 说明 |
|---|---|
| [05-architecture.png](05-architecture.png) | 小程序、API、业务服务和MySQL分层 |
| [06-certification-flow.png](06-certification-flow.png) | 演示登录、学籍校验、管理员审核和认证生效 |
| [07-order-flow.png](07-order-flow.png) | 订单创建、交割、确认和评价的主要状态 |
| [08-chat-report-flow.png](08-chat-report-flow.png) | 咨询、举报、监管处置和信誉事件 |

这4张流程图为基于实现绘制的说明图，不是模拟器截图。商品摄影样图的授权和来源另见 [assets/demo-products/README.md](../../../assets/demo-products/README.md)。

## PPT建议结构（约8分钟）

1. **问题和整体结构（约50秒）**：展示05，概括客户端、服务端、业务服务与数据库职责。
2. **认证和隐私（约60秒）**：展示10、11、06，说明虚构学籍校验、管理员审核、加密与脱敏。
3. **发布、审核与商品检索（约80秒）**：展示03、04、01、02，说明待审不可见、编辑重审及分类检索。
4. **订单、交割和信誉（约100秒）**：展示07、13、14、15、16，强调事务锁定、模拟支付、状态机和评价幂等。
5. **咨询、收藏和举报监管（约100秒）**：展示17至24及08，说明参与者访问控制、本人举报记录、商品冻结与信誉事件。
6. **测试及范围说明（约50秒）**：摘录报告测试表，明确本机测试结果和未完成的真实微信登录/真机事项。

讲解时将支付和退款描述为课堂模拟；授权商品照片是演示样图，不是小组实物销售照片。微信开发者工具页面截图来自虚构本地数据，不能表述为已经上线或可在微信搜索使用。
