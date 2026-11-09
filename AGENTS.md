# 项目约束

## 范围

- 单人、单设备本地使用；跨设备同步不在首版。
- 主导航固定：今日（`/`）、复习（`/review`）、记录（`/records`）；设置入口在右上角（`/settings`）。
- 听力、写作专项、完整模拟考试、复杂统计图表不在首版。

## 技术约束

- 前端：Vite + React + TypeScript + react-router + Dexie（IndexedDB），PWA 用 `vite-plugin-pwa`。
- 数据只落在 IndexedDB；`localStorage` 仅可存放非关键 UI 偏好。
- 组件不直接访问 Dexie：页面 → repository → db。仅 `src/db/` 与 `src/repositories/` 可导入 `db`。
- 日期一律使用设备本地时区，日期键为 `YYYY-MM-DD`（`dateKey`）。禁止用 UTC 切日。
- 服务端密钥只存在后端进程环境变量；前端、构建产物、日志中不得出现。

## 安全与授权

- 真实付费 API 调用、远程推送、正式部署分别取得用户授权后才执行。
- 不提交 `.env`；只提供 `.env.example`。
- 不修改 FitFlow 目录下的任何文件。

## 验证

- 改动优先验证受影响逻辑；再执行 `npm run typecheck` 与 `npm run build`。
- 交互改动用浏览器实际验证；离线、PWA 安装、真实设备单独验收。
- 未验证项写进 `docs/PROGRESS.md`，不得标记通过。

## 文档维护

- 阶段结束更新 `docs/PROGRESS.md`。
- 需求变化更新 PRD，架构变化更新 ARCHITECTURE。
- 文档不得描述尚未实现的能力为已实现。
