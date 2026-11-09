# 英语学习 PWA

单人在本机使用的英语学习应用：按课程分模块学习、自动保存作答、本地批改、错题与复习。

当前状态：P1–P4 已完成，P5 进行中（PWA 基础已实现，真机安装与 iOS 验收待做）。首版定位见 `docs/PRD.md`，目标架构见 `docs/ARCHITECTURE.md`。

## 文档

| 文件 | 内容 |
| --- | --- |
| `docs/PRD.md` | 产品目标、范围、页面与验收标准 |
| `docs/ARCHITECTURE.md` | 技术路线、数据模型、AI 代理、PWA 方案 |
| `docs/PROGRESS.md` | 当前阶段、已验证与待办 |
| `docs/P0-BASELINE.md` | P0 复用报告、数据规则、开发任务清单 |
| `AGENTS.md` | 本项目的开发约束 |

## 参考来源

FitFlow（`C:\Users\wy\Documents\ChatGPT\健身小程序`）为只读参考实现，结论见 `docs/P0-BASELINE.md`。本项目不复制其业务数据，也不修改其代码。

## 运行

在 `web/` 目录：

```sh
npm install
npm run dev          # 本地开发，默认 http://localhost:5173/
npm run typecheck    # 类型检查
npm test             # Vitest（数据库、判分、备份、学习日）
npm run build        # 生产构建，输出 dist/
npm run preview      # 预览构建结果
```

数据保存在浏览器 IndexedDB（`EnglishLearnDB`）。换浏览器、换端口或清理站点数据前，先在“设置 → 导出备份”保存 JSON。

## 历史导入

设置 → 历史导入 → 选择 `docs/history/history-import.json`（或粘贴同样结构的 JSON）。

- 只写入“学过／出现过”的历史天数和知识点，不写成绩、错题或完成状态。
- 导入前自动下载当前数据备份；导入在一个事务内完成，失败不改变现有数据。
- 导入后可直接生成衔接复习课，重点覆盖历史材料里反复出现的 5 个语法点。

## AI 代理

课程生成、开放题批改与“问老师”走独立的后端代理，前端不持有任何密钥。

```sh
# 终端 A：代理（默认 mock，不联网、不花钱）
npm run dev:api     # http://127.0.0.1:8788/health

# 终端 B：前端
npm run dev
```

- 默认 `AI_PROVIDER=mock`，生成内容只用于验证流程。
- 真实模型（DeepSeek，已按官方文档核对）：复制 `.env.example` 为 `.env`，设置 `AI_PROVIDER=openai`、`AI_API_KEY`、`AI_MODEL=deepseek-flash`。`AI_BASE_URL` 默认 `https://api.deepseek.com`，`AI_THINKING=disabled` 省钱提速。
- 真实调用前先确认余额与预算上限，并保留首次小样本记录；密钥只写在 `.env`。
- `.env` 已被 Git 忽略，不要提交密钥。
- 部署到其他端口或域名时，把实际前端来源加入 `ALLOWED_ORIGINS`（逗号分隔），否则代理会以 403 拒绝。

## PWA 与离线

- `npm run build` 后 `npm run preview` 可检查生产构建；安装到主屏、真实离线与 iOS 行为需要 HTTPS 环境。
- 应用外壳与图标由 Service Worker 预缓存；课程和作答在 IndexedDB，断网仍可打开与作答。
- 断网或代理超时时的 AI 批改会进入待处理队列，恢复联网、重新打开应用或在设置页点“立即处理”时自动补批改。
- 发布新版本后，页面顶部会出现“有新版本可用”，点击“更新并重载”才切换，避免作答过程中被强制刷新。
