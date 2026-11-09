# 架构

状态：**设计稿**。除标注“FitFlow 已实证”的部分外，本项目代码尚未创建。

## 1. 技术选型

与 FitFlow 一致，降低迁移成本：

| 层 | 选择 | 来源 |
| --- | --- | --- |
| 构建 | Vite 8 + TypeScript | FitFlow 已实证 |
| UI | React 19 + react-router 8 | FitFlow 已实证 |
| 存储 | Dexie 4 over IndexedDB | FitFlow 已实证 |
| PWA | vite-plugin-pwa 1.3（Workbox，提示更新） | FitFlow 已实证 |
| 后端代理 | Node 原生 `http`，独立进程，无框架 | FitFlow 已实证 |
| AI | DeepSeek OpenAI 兼容接口（`https://api.deepseek.com`，`deepseek-flash`） | 官方文档已核对，见 §5 |

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
historyDays    id, dayNumber, topic, source, evidence(studied|listed_only), answerCount, confirmed
studyDays      dateKey(主键), seconds, coursesCompleted, firstActiveAt
aiUsage        id, dateKey, kind, model, tokensIn, tokensOut, status, costEstimate
pendingAi      id, courseId, moduleId, questionId, answer, status(pending|failed), createdAt
wordReviews    id, courseId, moduleId, wordId, term, status(known|fuzzy|unknown), updatedAt
settings       id='app', aiBudget, appVersion, historyImportedAt, aiAccessToken, knowledgeUnifiedAt
```

版本管理沿用 FitFlow 的做法：`db.version(n).stores({...})`，破坏性结构变化时显式写 `upgrade()`；数据库名独立（例如 `EnglishLearnDB`），不与 FitFlow 共用。当前为 v4（新增单词反馈表）。

## 4. 状态与日期规则

- 课程状态：`not_started → in_progress → completed`。**课程不因跨天自动结束**（与 FitFlow 的 `expireWorkoutSessions` 相反，见 P0 报告）。
- 模块状态：`todo → draft → answered → graded`；开放题多一个 `awaiting_ai`。
- 学习日：以设备本地 `00:00` 为日界，`dateKey` 生成日期键。
- 学习天数：同一 `dateKey` 只记 1 天，且需满足“完成 ≥1 个模块”或“累计 ≥5 分钟”。
- 跨天时长：按本地日期分段归属，课程本身保持同一 `courseId`。

## 5. 批改与 AI

### 复习规则（已实现）

- 状态：未学习 → 学习中 ⇄ 需巩固 → 已掌握；单次对错不翻转状态。
- 需巩固：连续答错 2 次进入；连续答对 2 次回到学习中。
- 已掌握：学习中连续答对 3 次，且跨至少 3 个不同日期，才进入；连续答错 2 次才回落。
- 到期：优先看 `nextReviewDate`；只有没有排期的“需巩固”才立即到期。
- 间隔：1 → 3 → 7 天（学习中），已掌握 14 天；答错次日复习。
- 实现为纯函数 `src/services/reviewRules.ts`，多日行为由单元测试固定。
- 题目通过 `knowledgeIds` 关联知识点；知识点按规范化标签生成稳定 id（`kp-...`），历史导入、各课程与复习共用同一份记录，启动时合并旧课号 id。
- 客观题：本地比对，纯函数，`utils/` 内实现，可单测。
- 开放题：P1 显示“待批改”；P2 由代理批改，返回 `correct | partial | uncertain`，`uncertain` 显示“暂无法判断”。
- 代理接口（已实现，默认 mock）：`POST /api/course/generate`、`POST /api/grade`、`POST /api/tutor`、`POST /api/drill`、`GET /health`。
- 代理约束（已实现）：CORS 白名单（`ALLOWED_ORIGINS`，部署时必须加入实际站点来源）、个人访问口令（`AI_ACCESS_TOKEN`，请求带 `X-Access-Token`）、64KB 请求体上限、30s 超时、失败重试 1 次、每分钟限流、并发上限、结构化日志（不记录密钥与作答内容）、请求参数逐项限长。
- 密钥只在后端进程环境变量；前端仅持有公开 API 地址。
- 去重（已实现）：前端按请求键单飞合并；服务端按 `Idempotency-Key` 缓存 10 分钟；课程写入使用确定性 id `ai-<课号>`，重复保存返回已有课程。
- 预算（已实现，进程内）：每日请求数与 token 上限，超限返回 402；本地 `aiUsage` 表持久记录本机用量。进程重启后服务端计数清零。
- 真实模型（DeepSeek，已按官方文档核对）：
  - base URL `https://api.deepseek.com`，模型 `deepseek-flash`（旧名 `deepseek-v4-flash` 仍可用）。
  - `response_format: {"type":"json_object"}` 支持，但提示词必须含 `json` 字样，否则 400；本应用系统提示词已包含。
  - JSON 模式下不可解析的输出会被替换为空格，可能返回空 `content`；实现中对空内容自动重试一次。
  - `finish_reason=length` 视为失败并提示提高 `AI_MAX_OUTPUT_TOKENS`（默认 8000）。
  - 默认关闭思考模式（`thinking: {"type":"disabled"}`），省钱且降低延迟；思考模式会忽略 `temperature`。
  - 官方未提供严格 JSON Schema 保证，因此服务端逐字段校验仍是唯一准入。
  - 实测：嵌套 schema 下模型会漏闭合括号，已改为扁平 schema；JSON 解析失败重试一次。
  - 已用真实密钥验证：生成、批改、提问均成功；样本 token 与耗时见 `PROGRESS.md`。
  - 课程 JSON 输出较长，`AI_MAX_OUTPUT_TOKENS` 默认 8000；`finish_reason=length` 视为失败。

## 6. PWA（已实现，实机待验收）

- DB v4：新增 `pendingAi` 与 `wordReviews` 表；备份升到 v4，仍接受 v1–v3。
- precache：HTML、JS、CSS、PNG / SVG 图标、字体；**不缓存** API 响应。
- 更新策略：`registerType: 'prompt'`。新版本就绪时顶部显示“有新版本可用”，用户点击后才重载，避免页面打开期间被接管。
- 图标：`icon-192.png`、`icon-512.png`（含 maskable）；manifest 使用 PNG，兼容 iOS 主屏图标。
- 离线：应用外壳由 Service Worker 提供；课程与作答数据在 IndexedDB，可离线打开与作答。AI 批改在断网或超时时写入 `pendingAi`，启动或恢复联网时自动重试，设置页可手动“立即处理”。
- iOS Safari 存储可能被系统回收，因此提供手动导出备份与提醒文案。

## 7. 备份与恢复

沿用 FitFlow 已验证的结构：

1. 导出文件包含 `app` 标识、`version`、`exportedAt`、`data`。
2. 导入时逐字段校验，再校验主键唯一与引用完整。
3. 恢复在**单个读写事务**内清空并写入，失败整体回滚。
4. 恢复前自动导出当前数据为“恢复前备份”。
5. 版本升级路径在 `parseBackup` 内归一化旧版本；v4 新增单词反馈，v3 新增待批改队列，旧版本导入时补空表。

## 8. 部署（配置已实现，尚未上线）

沿用 FitFlow 的两段式部署，详细步骤见 `docs/DEPLOY.md`：

- 前端：GitHub Pages。`build:github` 使用 `GITHUB_PAGES_BASE`（默认 `/<仓库名>/`）生成子路径资源、`404.html` 与 `.nojekyll`；workflow 在推送 `main` 后自动发布，仓库变量名用 `PAGES_BASE`。
- 后端：阿里云 FC 3.0 Web Function。`build:api` 把 `server/` 编译到 `api-dist/server`，只含 JS 与零依赖 `package.json`；密钥通过 FC 环境变量注入。服务端代码变化时由 `.github/workflows/deploy-fc.yml` 自动更新代码。
- 连接：前端构建时从 `web/.env.github` 读取 `VITE_AI_API_URL`，写入 FC HTTPS 地址；代理 `ALLOWED_ORIGINS` 加入 Pages 来源。
- 限制：代理没有账号鉴权，公网使用需要额外的访问控制。

## 9. 已知风险

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| iOS 存储回收 | 数据丢失 | 备份为必需功能 + 备份提醒 |
| AI 结构化输出不稳定 | 课程缺字段 | 服务端严格校验，失败不落库 |
| 课程包含错误内容 | 学错 | 示例课程人工核对；真实课程可标注、可修正 |
| 跨天课程与时长口径 | 统计错误 | 固定“开始日归属 + 分日时长”规则并有测试 |
| 单文件 CSS 膨胀 | 维护成本 | 首版沿用，超过约 1500 行再拆分 |
