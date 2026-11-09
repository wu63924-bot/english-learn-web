# 英语学习 PWA

单人在本机使用的英语学习应用：按课程分模块学习、自动保存作答、本地批改、错题与复习。

当前状态：**P0 完成，业务代码尚未开始**。首版定位见 `docs/PRD.md`，目标架构见 `docs/ARCHITECTURE.md`。

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
