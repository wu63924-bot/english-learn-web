# 部署说明

沿用 FitFlow 的两段式部署：

- 前端：GitHub Pages（静态 `dist/`，HTTPS，可安装 PWA）
- 后端：阿里云函数计算 FC 3.0 Web Function（AI 代理，密钥只放 FC 环境变量）

前端与后端不同域，因此代理必须允许 Pages 来源；前端构建时从 `web/.env.github` 读取 FC 地址。

## 当前部署

- 前端：`https://wu63924-bot.github.io/english-learn-web/`
- 后端：`https://englishenin-web-dwssyeazdk.cn-beijing.fcapp.run`
- 仓库：`https://github.com/wu63924-bot/english-learn-web`

## 前置条件

- GitHub 仓库。免费版 GitHub Pages 要求仓库公开。
- 阿里云 FC 3.0 Web Function，Node 22.18+ 或 24。
- DeepSeek API Key。

## 一、部署后端（FC）

在 `web/` 目录构建零依赖代码包：

```sh
npm run build:api
```

产物在 `web/api-dist/server/`，包含编译后的 `.js` 与生成的 `package.json`。把**该目录的内容**（不是外层目录）压缩成 ZIP，作为 FC 代码包上传；不要包含 `.env`、`src/`、`server/` 源码或 `node_modules`。

FC 配置：

| 项 | 值 |
| --- | --- |
| 运行环境 | Node 22 或 24 |
| 启动命令 | `node index.js` |
| 监听端口 | `9000` |
| 请求超时 | ≥ 60 秒（课程生成可能需要 10 秒以上） |
| 最大实例数 | `1`（个人自用，控制费用与内存限流一致性） |

环境变量：

```text
AI_PROVIDER=openai
AI_API_KEY=<DeepSeek 密钥>
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-flash
AI_THINKING=disabled
HOST=0.0.0.0
PORT=9000
ALLOWED_ORIGINS=https://<你的 GitHub 用户名>.github.io
AI_RATE_LIMIT_MAX=20
AI_DAILY_REQUEST_LIMIT=60
AI_DAILY_TOKEN_LIMIT=200000
AI_ACCESS_TOKEN=<随机口令>
```

`AI_ACCESS_TOKEN` 是个人访问口令。设置后，所有 AI 请求必须带 `X-Access-Token`，设置页也要填同一个口令；留空则不校验，适合本地开发。生成口令：

```powershell
[Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24)).ToLower()
```

说明：

- `ALLOWED_ORIGINS` 只写来源，不带仓库路径；例如 `https://wu63924-bot.github.io`，不要写 `/english-web/`。
- 本地调试可再加 `http://localhost:5173,http://127.0.0.1:5173`。
- 密钥只存在 FC 环境变量，不要提交到 Git，也不要写进前端变量。
- 代理没有账号鉴权，依赖个人访问口令、CORS 与限流；口令保存在本机 IndexedDB，备份文件会排除它。

### 自动部署（推荐）

`.github/workflows/deploy-fc.yml` 在 `web/server/**`、部署脚本或 workflow 自身变化时自动构建并更新 FC 代码，不会改动 FC 的环境变量与触发器。

仓库 Settings → Secrets and variables → Actions：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Secret | `ALIBABA_CLOUD_ACCESS_KEY_ID` | RAM 用户的 AccessKey ID |
| Secret | `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | RAM 用户的 AccessKey Secret |
| Variable | `FC_FUNCTION_NAME` | FC 控制台里的函数名，例如 `englishenin-web` |
| Variable | `FC_REGION` | `cn-beijing`，可省略 |

RAM 用户只授予更新函数所需的最小权限：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["fc:GetFunction", "fc:UpdateFunction"],
      "Resource": "*"
    }
  ]
}
```

不要使用主账号 AccessKey。配置好后在 Actions 里手动运行一次 `Deploy AI proxy to Alibaba Cloud FC`，确认输出中的 `environmentPreserved` 为 `true`。

首次创建函数、修改环境变量、启动命令或触发器仍需在 FC 控制台操作；自动部署只更新代码。

部署后检查：

```text
https://<fc 域名>/health
```

应返回 `{"ok":true,...}`，且 `provider` 为 `openai`。

## 二、部署前端（GitHub Pages）

### 1. 启用 Pages

workflow 会用 `actions/configure-pages` 自动创建 Pages 站点。若首次运行仍失败，到仓库 Settings → Pages → Source 手动选择 **GitHub Actions**，再重跑 workflow。

### 2. 配置构建地址

前端构建地址写在仓库根目录的 `web/.env.github`，内容只有公开地址：

```text
VITE_AI_API_URL=https://englishenin-web-dwssyeazdk.cn-beijing.fcapp.run
```

改 FC 地址时编辑该文件并提交，不需要在 GitHub 里建 API 变量。

可选的仓库变量只有：

| 变量 | 必填 | 值 |
| --- | --- | --- |
| `PAGES_BASE` | 否 | 默认 `/<仓库名>/`；仓库名含非 ASCII 或想自定义路径时手动设置 |

### 3. 推送触发

推送到 `main` 后，`.github/workflows/deploy-pages.yml` 会：

1. `npm ci`
2. `npm run build:github`（base 使用 `GITHUB_PAGES_BASE`，默认仓库名）
3. 复制 `index.html` 为 `404.html`，写入 `.nojekyll`
4. 上传 `web/dist` 并发布 Pages

线上地址：`https://<用户名>.github.io/<仓库名>/`。

### 4. 本地验证 GitHub 构建

```powershell
cd web
$env:GITHUB_PAGES_BASE='/english-learn-web/'
npm run build:github
npm run preview -- --mode github
```

打开 `http://localhost:4173/english-learn-web/`。`VITE_AI_API_URL` 会自动从 `.env.github` 读取。

## 三、安装与验收

1. 用手机或 iPad 打开线上 HTTPS 地址。
2. Android Chrome / Edge：浏览器菜单 → 安装应用。
3. iPhone / iPad Safari：分享 → 添加到主屏幕。
4. 打开一次，断网，再打开，确认应用外壳与本地数据仍可用。
5. 在联网状态下做一道开放题并请 AI 批改；再断网提交一道，确认出现“批改已排队”，恢复网络后自动或手动处理。

## 四、数据与迁移

IndexedDB 按 origin 隔离。从 `localhost:5173` 换到 Pages 域名、或换 Pages 仓库名后，旧数据不会自动出现。

迁移方式：旧地址 → 设置 → 导出备份；新地址 → 设置 → 导入备份。

## 五、更新

发布新版本后，已安装的页面顶部会出现“有新版本可用”。点击“更新并重载”才切换，避免作答过程中被刷新。

## 六、常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| AI 调用 403 `ORIGIN_NOT_ALLOWED` | `ALLOWED_ORIGINS` 没加 Pages 来源 | 加 `https://<用户名>.github.io` 后重启/更新 FC |
| 页面空白或资源 404 | base 与仓库路径不一致 | 设置仓库变量 `PAGES_BASE=/<仓库名>/` 后重新构建 |
| 直接访问子路由 404 | 缺少 `404.html` 或 Pages 未走 Actions | 确认构建脚本与 Pages Source |
| 线上仍请求 `127.0.0.1:8788` | 构建时没有读到 `web/.env.github` | 检查该文件并重新部署 |
| 手机上无法安装 | 使用了 HTTP 或 IP 地址 | 必须使用 HTTPS 域名 |
| 数据不见了 | origin 变了 | 从旧地址导出备份再导入 |
