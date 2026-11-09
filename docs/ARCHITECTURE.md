# 架构

状态：**设计稿**。除标注“FitFlow 已实证”的部分外，本项目代码尚未创建。

## 1. 技术选型

与 FitFlow 一致，降低迁移成本：

| 层 | 选择 | 来源 |
| --- | --- | --- |
| 构建 | Vite 8 + TypeScript | FitFlow 已实证 |
| UI | React 19 + react-router 8 | FitFlow 已实证 |
| 存储 | Dexie 4 over IndexedDB | FitFlow 已实证 |
| PWA | vite-plugin-pwa 1.3（Workbox，`autoUpdate`） | FitFlow 已实证 |
| 后端代理 | Node 原生 `http`，独立进程，无框架 | FitFlow 已实证 |
| AI | DashScope compatible-mode（OpenAI 协议） | FitFlow 已实证（仅视觉识别场景） |

不引入 UI 组件库、状态库、图表库。样式沿用 FitFlow 的单一 CSS + CSS 变量做法，移动优先、`max-width` 居中。

## 2. 目录（目标）

```
web/
  src/
    db/            Dexie 定义、版本迁移、幂等种子
    repositories/  按表拆分的读写函数
    services/      业务服务：批改、复习调度、备份、AI 调用、导入
    pages/         今日 / 复习 / 记录 / 设置 / 课程
    components/    AppShell、UI 基础组件、课程模块组件
    types/         领域类型
    utils/         日期、格式化、纯函数规则
  server/          AI 代理（课程生成、批改、问老师）
  docs/            验收记录
```

规则：页面不直接 import `db`；只有 `db/` 与 `repositories/` 接触 Dexie。

## 3. 数据模型（目标）

```
courses        id, dateKey, status, topic, source(ai|sample|import), createdAt
courseModules  id, courseId, kind(word|grammar|reading|review), order, status
answers        id, courseId, moduleId, itemId, value, savedAt, grade(obj|ai|none)
grades         id, answerId, correct, score, feedback, aiStatus
knowledge      id, label, stage, status(unseen|learning|needs_review|mastered)
reviews        id, knowledgeId, dueDate, reason, state(pending|done)
mistakes       id, knowledgeId, courseId, itemId, reason, createdAt
studyDays      dateKey(主键), seconds, coursesCompleted, firstActiveAt
aiUsage        id, dateKey, kind, model, tokensIn, tokensOut, status, costEstimate
settings       id='app', aiBudget, currentCourseId, appVersion
```

版本管理沿用 FitFlow 的做法：`db.version(n).stores({...})`，破坏性结构变化时显式写 `upgrade()`；数据库名独立（例如 `EnglishLearnDB`），不与 FitFlow 共用。

## 4. 状态与日期规则

- 课程状态：`not_started → in_progress → completed`。**课程不因跨天自动结束**（与 FitFlow 的 `expireWorkoutSessions` 相反，见 P0 报告）。
- 模块状态：`todo → draft → answered → graded`；开放题多一个 `awaiting_ai`。
- 学习日：以设备本地 `00:00` 为日界，`dateKey` 生成日期键。
- 学习天数：同一 `dateKey` 只记 1 天，且需满足“完成 ≥1 个模块”或“累计 ≥5 分钟”。
- 跨天时长：按本地日期分段归属，课程本身保持同一 `courseId`。

## 5. 批改与 AI

- 客观题：本地比对，纯函数，`utils/` 内实现，可单测。
- 开放题：P1 显示“待批改”；P2 由代理批改，返回 `correct | partial | uncertain`，`uncertain` 显示“暂无法判断”。
- 代理接口（已实现，默认 mock）：`POST /api/course/generate`、`POST /api/grade`、`POST /api/tutor`、`GET /health`。
- 代理约束（已实现）：CORS 白名单、64KB 请求体上限、30s 超时、失败重试 1 次、每分钟限流、并发上限、结构化日志（不记录密钥与作答内容）、请求参数逐项限长。
- 密钥只在后端进程环境变量；前端仅持有公开 API 地址。
- 去重（已实现）：前端按请求键单飞合并；服务端按 `Idempotency-Key` 缓存 10 分钟；课程写入使用确定性 id `ai-<课号>`，重复保存返回已有课程。
- 预算（已实现，进程内）：每日请求数与 token 上限，超限返回 402；本地 `aiUsage` 表持久记录本机用量。进程重启后服务端计数清零。
- 真实模型：OpenAI 兼容实现已完成，但参数与结构化输出开关尚未按供应商文档核对，也未做过真实调用。

## 6. PWA

- precache：HTML、JS、CSS、图标、字体；**不缓存** API 响应。
- `autoUpdate` 存在“页面打开期间被新版本接管”的风险，P5 必须实测数据库与未保存答案是否受影响；必要时改为提示更新。
- 离线：已缓存课程可打开与作答；AI 请求进入待处理队列，联网后继续。
- iOS Safari 存储可能被系统回收，因此提供手动导出备份与提醒文案。

## 7. 备份与恢复

沿用 FitFlow 已验证的结构：

1. 导出文件包含 `app` 标识、`version`、`exportedAt`、`data`。
2. 导入时逐字段校验，再校验主键唯一与引用完整。
3. 恢复在**单个读写事务**内清空并写入，失败整体回滚。
4. 恢复前自动导出当前数据为“恢复前备份”。
5. 版本升级路径在 `parseBackup` 内归一化旧版本。

## 8. 已知风险

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| iOS 存储回收 | 数据丢失 | 备份为必需功能 + 备份提醒 |
| AI 结构化输出不稳定 | 课程缺字段 | 服务端严格校验，失败不落库 |
| 课程包含错误内容 | 学错 | 示例课程人工核对；真实课程可标注、可修正 |
| 跨天课程与时长口径 | 统计错误 | 固定“开始日归属 + 分日时长”规则并有测试 |
| 单文件 CSS 膨胀 | 维护成本 | 首版沿用，超过约 1500 行再拆分 |
