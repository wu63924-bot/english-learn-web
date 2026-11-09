# P0 基线报告

日期：2026-11-09
调查方式：只读浏览工作目录与 FitFlow 源码；未运行 FitFlow，未修改其任何文件。

## 1. 现状

| 项 | 结论 |
| --- | --- |
| 工作目录 `D:\OpenChamber-Projects\英语web` | P0 前为空目录，无 Git 仓库 |
| 已有可复用代码 | 无 |
| 项目级 AGENTS.md | P0 新建 |
| 参考项目 FitFlow | 独立 Git 仓库，`web/` 下有完整实现 |

## 2. FitFlow 性质判定

**是 Web/PWA，不是微信小程序。** 依据：`web/package.json` 使用 Vite 8 + React 19；`vite.config.ts` 使用 `vite-plugin-pwa`；`README.md` 说明它是可安装 PWA。因此 PWA、IndexedDB、Node 代理均可直接借鉴，只有业务域不同。

FitFlow 体量：约 11.6k 文件（含 `node_modules`），业务源码约 60 个文件，单文件最大为 `src/styles.css`（64KB）。

## 3. 复用分类

### 3.1 直接复用（结构或整段代码模式）

| 模块 | FitFlow 位置 | 说明 | 状态 |
| --- | --- | --- | --- |
| 工程骨架 | `web/package.json`、`vite.config.ts`、`tsconfig*.json` | Vite + React + TS + Router + PWA 插件配置 | 已读源码，未运行 |
| 本地库 | `src/db/db.ts`、`src/db/seed.ts` | Dexie 定义、v1→v3 版本迁移、幂等种子 | 已读源码 |
| 分层约定 | `src/repositories/*` | 页面不直接碰 Dexie，按表拆分 | 已读源码 |
| 备份核心 | `src/services/backupService.ts` | 版本校验、逐字段类型守卫、主键唯一与引用校验、单事务替换 | 已读源码 |
| 日期键 | `src/utils/format.ts` | `dateKey` 本地时区生成 | 已读源码 |
| 应用壳 | `src/components/AppShell.tsx` | 固定底栏、路由高亮、子页面隐藏底栏 | 已读源码 |
| UI 原语 | `src/components/UI.tsx` | Toast、PageHeader、Modal、Empty/Loading/Error | 已读源码 |
| 设计变量 | `src/styles.css:1-30` | 色板、圆角、阴影、阴影语义 | 已读源码 |
| 代理骨架 | `server/app.ts`、`config.ts`、`errors.ts`、`rateLimiter.ts` | 原生 http、CORS 白名单、限流、并发上限、超时、结构化日志 | 已读源码 |
| 响应校验思路 | `server/schema.ts`、`qwenVisionClient.ts` | 剥离 ```json 围栏、逐字段验证、二次重试、错误码分类 | 已读源码 |

### 3.2 需改造后使用

| 模块 | 差距 | 改造方向 |
| --- | --- | --- |
| `styles.css` | 64KB，健身域样式 | 提取变量与通用块，删业务样式，重写课程与卡片 |
| `AppShell` | 5 个 tab，含训练中悬浮条 | 改为 3 个 tab + 右上角设置，去掉悬浮条 |
| `backupService` | 表固定为健身域，版本号 3 | 换成课程域表，版本号从 1 起；增加“恢复前自动导出” |
| AI 代理 | 只有图片识别单一端点，无鉴权、无预算、无去重 | 拆成生成／批改／提问三个端点，新增幂等键、用量与预算 |
| Prompt 与 schema | 食物字段，无 JSON Schema | 重写课程结构校验，含模块、题目、答案、知识点关联 |
| 种子数据 | 训练计划、食物库 | 改为 2–3 节人工核对示例课程，带 `source: 'sample'` |
| 日期规则 | `workoutDayEndsAt` 在 24:00 强制结束会话 | **不可照抄**：本应用要求跨天续学，见 §5.2 |

### 3.3 必须新建

- 课程、模块、题目、作答、批改、知识点、复习、错题、学习日、AI 用量共 10 张表及其仓储层。
- 课程内四模块界面与“一次只突出一个模块”的交互。
- 作答自动保存（防抖 + 失焦 + 换模块 + 页面隐藏）。
- 客观题本地批改与解析展示。
- 错题记录与回看。
- 规则驱动的复习调度与状态机。
- 历史记录导入预览（P3）。
- AI 待处理队列与联网续做（P5）。

## 4. 页面结构（P0 确定）

```
底部导航：今日 | 复习 | 记录
右上角：设置

/                今日：当前课程卡、四模块进度、开始/继续、今日时长
/course/:id      课程：顶部进度 + 退出，单模块聚焦，底部下一模块
/review          复习：到期项（含原因）、错题重做
/records         记录：日期倒序列表
/records/:id     记录详情：模块完成情况、正确率、时长、错题
/settings        设置：数据管理、AI 用量、版本、离线状态
/settings/data   备份/恢复/导入预览
```

课程内顺序固定：单词 → 语法与练习 → 阅读与翻译 → 巩固复习。不提供跳模块，允许退出后从首个未完成模块继续。

## 5. 数据规则（P0 确定）

### 5.1 状态机

```
course: not_started → in_progress → completed
module: todo → draft → answered → graded
open question: draft → awaiting_ai → graded | uncertain
```

### 5.2 日期与跨天

- 日期键：设备本地 `YYYY-MM-DD`。
- 课程**不因跨天失效**：FitFlow 在次日 00:00 自动把进行中的训练标记完成，本应用不能沿用该行为。
- 历史归属：课程归 `startedDate`；学习时长按实际发生的本地日期分段累加。
- 学习天数：每个 `dateKey` 最多记 1 天，条件为“完成 ≥1 模块”或“当日累计 ≥5 分钟”。仅打开页面不计。

### 5.3 作答保存

四个触发点：输入防抖 400ms、失焦、切换模块、`pagehide/visibilitychange`。每次写同一条作答记录（幂等），不产生重复行。

### 5.4 批改

- 客观题本地判定，结果立刻落库并写错题。
- 开放题 P1 只记 `awaiting_ai`，P2 由 AI 返回 `correct/partial/uncertain`；`uncertain` 必须显示“暂无法判断”，不得当成错误。
- 正确率只统计客观题，开放题单独展示。

### 5.5 示例与真实数据

`courses.source` 取 `sample | ai | import`。示例课程不进入复习队列与学习天数的正式统计，记录页显示“示例”标记。

## 6. 开发任务清单

### P0（本轮）

- [x] 目录与 Git 状态核查
- [x] FitFlow 只读调查
- [x] 复用分类
- [x] 页面结构与数据规则
- [x] 核心文档初始化
- [x] Git 仓库初始化（`main` 分支，已完成首次本地提交）
- [ ] 历史材料清单确认（待用户提供）

### P1（本地闭环，按此顺序）

1. 建工程与路由骨架、AppShell、三主页面空壳
2. Dexie v1 表结构与仓储层
3. 示例课程 2–3 节（人工核对，含音标与解析）
4. 单词模块
5. 语法与练习模块 + 客观题批改
6. 阅读与翻译模块
7. 巩固复习模块
8. 作答自动保存 + 恢复
9. 错题表与记录页
10. 学习时长与学习天数
11. 备份导出／导入 + 恢复前备份
12. 响应式检查（320／390／430／768／1280）

### P2

代理三端点 → 课程生成 → 结构校验 → 开放题批改 → 问老师 → 幂等与并发锁 → 超时/重试/错误码 → 用量与预算 → 模拟响应测试 → 授权后小样本真实调用与人工抽查。

### P3

材料整理 → 证据分级（出现／学过／答对过／复习后掌握）→ 导入预览 → 冲突处理 → 导入前备份 → 确定下一课。Day 18 及之前一律标“待核实”。

### P4

知识点清单 → 状态更新规则 → 到期复习 → 错题讲解与同类新题 → 下一课调整 → 多日模拟验证。

### P5

离线缓存 → 离线作答 → 待处理队列 → 更新安全性 → 三设备验收 → 部署说明。

## 7. 历史记录迁移所需材料（P3 输入）

| 材料 | 用途 | 缺失后果 |
| --- | --- | --- |
| 课程原始内容（文本／文档） | 确认上过哪些课 | 只能按日期推测 |
| 对话导出（含批改与作答） | 判断“答对过”“需复习” | 无法区分学过与答对 |
| 已完成课程清单或截图 | 交叉核对 | 无法确认完成状态 |
| 词表／语法点清单 | 建立知识点与复习基线 | 复习只能从新课程累积 |
| 已知薄弱项描述 | 初次生成课程目标 | 首课可能不对路 |

已知约束：Day 18 只能标为“待核实”，不得据此推断前 18 课全部完成。

## 8. 已核实的 FitFlow 能力

- Dexie 三个版本、v3 `upgrade()` 迁移逻辑（`src/db/db.ts`）。
- 备份格式 `version/app/exportedAt/data`、字段守卫、引用完整性校验（`src/services/backupService.ts`）。
- 单事务恢复并重新执行幂等种子（同上）。
- 代理：CORS 白名单、`requestTimeout=10s`、AI 调用 25s 超时、最多 2 次尝试、每分钟 6 次、并发 2、错误码映射（`server/app.ts`、`server/config.ts`、`server/qwenVisionClient.ts`）。
- PWA：`registerType: 'autoUpdate'`、precache 静态资源、不缓存 API（`vite.config.ts`）。
- 移动优先布局：`max-width: 560px`、底部安全区、360/400/561px 断点（`src/styles.css`）。

## 9. 未核实 / 不得当成已有能力

- FitFlow 的 AI 仅有**图片识别**，没有课程生成、文本批改、问老师；不能写成“已有生成能力”。
- 未运行 FitFlow 的任何测试或构建，上表能力仅为**读码结论**。
- FitFlow 无请求去重、无幂等键、无用量统计与预算。
- FitFlow 无单元测试框架（测试为 Node 脚本 + Playwright，部分依赖本机 Chrome）。
- FitFlow 无登录鉴权，代理仅靠 CORS 白名单；真实部署前需评估。
- 目标设备（iPad Safari）上的 PWA 安装与离线行为未验证。

## 10. 待确认

1. 是否 `git init` 并建立首次提交（本地，不推送）。
2. 应用名称。
3. 历史材料以何种形式提供。
4. 教材／词表范围。
5. 首版 AI 供应商是否沿用 DashScope compatible-mode。
