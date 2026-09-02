# 公众号视频提取工具（mpwx-video-getter）

粘贴微信公众号文章链接（`mp.weixin.qq.com/s/...`），一键解析并提取文章中的**微信原生视频**（`mpvideo.qpic.cn`）签名直链，支持在线预览、复制链接与下载。纯静态部署 + Serverless 解析后端，无服务器运维成本。

## 为什么不能纯前端

- `mp.weixin.qq.com` 不返回 CORS 头，浏览器直接抓取会被拦截；
- 微信对非浏览器请求有环境检测（返回「环境异常」验证页）；
- 视频直链带时效签名（`dis_k` / `dis_t`），必须即时解析、不做缓存。

因此解析放在后端（Cloudflare Pages Worker / 本地 Node 服务器），前端与后端同域部署，规避全部 CORS 问题。

## 技术栈

- **前端**：Vue 3 + Vite（构建产物为纯静态文件），中英双语客户端切换
- **后端**：Cloudflare Pages 高级模式 Worker（`_worker.js`）：解析 + **视频流中转**
- **共享逻辑**：`worker/parser.js` 平台无关，同时被线上 Worker 与本地 Node 开发服务器复用

> 为什么预览必须走中转：实测 `mpvideo.qpic.cn` 的防盗链只放行微信域名 Referer（或无 Referer 的极简请求），第三方页面里的 `<video>` 直连一律 403。浏览器无法伪造跨站 Referer，因此本站用 `/api/media` 服务端中转（服务端带微信 Referer 抓取、透传 Range），浏览器只与本域通信，即可正常播放与下载。

## 目录结构

```
├─ index.html               # 页面入口（SEO meta / JSON-LD）
├─ src/                     # Vue 前端
│  ├─ App.vue               # 主页面
│  ├─ components/           # ArticleCard / VideoItem
│  ├─ i18n.js               # 中英双语
│  └─ api.js                # /api/parse 调用
├─ worker/parser.js         # 核心解析逻辑（抓文章 → 提取 mpvideo 直链）
├─ _worker.js               # Cloudflare Pages Worker 入口
├─ server/dev-server.mjs    # 本地开发 API 服务器（Node 18+，零依赖）
├─ scripts/postbuild.mjs    # 构建后将 Worker/SEO 文件拷入 dist/
├─ _redirects               # SPA 回退
└─ robots.txt / sitemap.xml # SEO（上线前需替换实际域名）
```

## 解析原理

文章页 HTML 内嵌 `mp_video_trans_info` 数据（每个视频多个清晰度各一条直链）：

```
url: 'http://mpvideo.qpic.cn/xxx.f10002.mp4?dis_k=...\x26amp;dis_t=...\x26amp;play_scene=10120\x26amp;auth_info=...\x26amp;auth_key=...'
```

解析流程（`worker/parser.js`）：

1. 服务端以浏览器 UA 抓取文章 HTML（绕过 CORS / 环境检测）；
2. 规范化 JS 转义（`\x26amp;`、`\u0026`、`\/` 等）后正则提取全部 mpvideo 直链；
3. 按视频路径分组（同一视频多清晰度归一组），组内**优先带 auth 参数的直链、其次超清 f10002**；
4. 与 iframe 候选（`data-mpvid="wxv_..."`）按顺序配对，取各自封面；
5. 兜底：若文章内无直链，则并发请求播放器模板页提取；
6. 返回的直链带 `dis_k/dis_t/auth_info/auth_key` 签名，**无需任何特殊请求头即可直接播放/下载**（实测 206 Partial Content）；CDN 偶发限流 403 时稍等重试即可。

已实测通过：短链 `/s/xxx` 与长链 `/s?__biz=...` 两种形式、单视频与多视频文章、以及视频号（channels）卡片的识别标注。

## 本地开发

需要 Node 18+（开发环境为 Node 24 验证通过）与 pnpm。

```bash
pnpm install

# 终端 1：启动解析 API（端口 8788）
pnpm dev:api

# 终端 2：启动前端开发服务器（端口 5173，/api 自动代理到 8788）
pnpm dev
```

访问 http://localhost:5173 ，粘贴文章链接即可测试。

> 备选：执行 `pnpm build` 后，直接运行 `pnpm dev:api`，服务器会同时托管 `dist/` 静态产物并提供 `/api/parse`，访问 http://localhost:8788 即可在不启动 vite 的情况下预览生产构建。

## 生产构建与部署（Cloudflare Pages）

```bash
pnpm build   # vite build + postbuild 拷贝 Cloudflare 文件到 dist/
```

在 Cloudflare Pages 创建项目：

- **Build command**：`pnpm build`（或 `npm run build`）
- **Build output directory**：`dist`
- `dist/_worker.js` 会让站点进入 **Worker 高级模式**：`/api/parse`、`/api/media` 由 Worker 处理，其余请求由 `env.ASSETS` 提供静态资源。

## 生产构建与部署（腾讯 EdgeOne Pages）

```bash
pnpm build   # 同时校验双平台解析核心一致性（防漂移）
```

在 EdgeOne Pages 控制台导入本仓库：

- **Build command**：`pnpm build`
- **Build output directory**：`dist`
- 边缘函数无需配置：`edge-functions/` 目录自动生成路由（`/api/parse`、`/api/media`），未命中函数的请求自动回退静态资源
- 中国大陆自定义域名需已 ICP 备案；EdgeOne 出口为腾讯自有网络，抓取微信源更稳定

> 两套部署共用同一份解析核心（`worker/parser.js` ↔ `edge-functions/lib/parser.js`），
> postbuild 会强制校验两份副本一致，不一致时构建直接失败，防止双平台行为漂移。

> 上线前请把 `index.html`、`robots.txt`、`sitemap.xml` 中的占位域名 `https://mpwx.bestguo.top` 替换为实际域名。

## API 契约

```
POST /api/parse
{ "urls": ["https://mp.weixin.qq.com/s/...", ...] }   # 最多 10 条

→ { "ok": true, "results": [
    {
      "url": "...",
      "ok": true,
      "title": "文章标题",
      "cover": "https://mmbiz.qpic.cn/...",
      "videos": [ { "vid": "wxv_xxx", "cover": "...", "url": "https://mpvideo.qpic.cn/...?dis_k=...&dis_t=...&auth_info=...&auth_key=..." } ],
      "unsupported": [ { "kind": "tencent"|"channels", "message": "..." } ]
    },
    { "url": "...", "ok": false, "error": { "code": "INVALID_URL"|"FETCH_FAILED"|"BLOCKED"|"RATE_LIMITED", "message": "..." } }
  ] }

GET /api/media?u=<mpvideo 直链>&a=<文章链接>&v=<vid>[&dl=1]
# 视频流中转（仅放行 mpvideo.qpic.cn 的 mp4，防止开放代理）：
# 服务端带微信 Referer 抓取、透传 Range/206，dl=1 时附加 attachment 下载头。
# 直链 403 时自动重新解析文章换取新签名并重试一次。
```

## 成本与配额提示

- 预览/下载流量经 Worker 中转，会消耗 Cloudflare egress（免费版每日 10 万请求、单响应 ≤100MB，本工具视频普遍 6~20MB，个人使用绰绰有余）。
- 如需节省流量，可在 UI 上提示用户优先用「打开直链」自行尝试（部分网络直连可用）。

## 已知限制与风险

- 微信反爬/环境检测规则可能变动，偶发解析失败属行业共性；页面提供原文跳转兜底。
- 视频直链签名有时效（dis_t 到期后失效），解析后应尽快下载，失效后重新解析即可。
- mpvideo CDN 防盗链只放行微信域名 Referer：跨站直连（含复制到地址栏）大概率 403，预览/下载请用站内按钮（自动中转）。
- MVP 仅支持微信原生视频（mpvideo）；腾讯视频嵌入（v.qq.com）、视频号（channels）会返回 `unsupported` 提示，后续迭代接入。
- Worker 实例内存限频（30 次/分钟/IP）仅为基本防护。

## 合规声明

本工具仅用于个人学习研究，请尊重原作者与版权方的权益，勿将解析内容用于商业用途。本仓库不含任何广告组件。
