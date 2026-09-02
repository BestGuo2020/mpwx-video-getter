// server/dev-server.mjs — 本地开发用 API 服务器（Node 18+，零依赖）
// 与 Cloudflare Pages Worker (_worker.js) 共用同一份解析逻辑 worker/parser.js。
// 启动：pnpm dev:api（默认端口 8788，可通过 PORT 环境变量覆盖）
// Vite 开发服务器会把 /api/* 代理到这里（见 vite.config.js）。

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArticle, isArticleUrl, isMediaUrl, fetchMediaStream } from '../worker/parser.js';

const PORT = Number(process.env.PORT || 8788);
const MAX_URLS = 10;

// 生产构建产物目录：存在时本地服务器直接托管 dist/（便于沙箱/无 vite 环境端到端验证）
const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

function send(res, status, data) {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, jsonHeaders);
    return res.end();
  }

  // GET /api/media — 视频流中转（与线上 Worker 行为一致）
  if (url.pathname === '/api/media' && req.method === 'GET') {
    return handleMedia(req, res, url);
  }

  if (url.pathname === '/api/parse' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 1_000_000) break;
    }

    let body = {};
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      /* 非 JSON 按空对象处理 */
    }

    const urls = (Array.isArray(body.urls) ? body.urls : [])
      .filter((u) => typeof u === 'string' && u.trim())
      .slice(0, MAX_URLS);

    if (!urls.length) {
      return send(res, 400, { ok: false, error: { code: 'BAD_REQUEST', message: '缺少 urls 参数' } });
    }

    console.log(`[dev-api] parse ${urls.length} url(s)`);

    const results = await Promise.all(
      urls.map(async (u) => {
        const url = u.trim();
        if (!isArticleUrl(url)) {
          return { url, ok: false, error: { code: 'INVALID_URL', message: '仅支持 mp.weixin.qq.com/s/ 公众号文章链接' } };
        }
        try {
          const data = await parseArticle(url);
          console.log(`[dev-api] ok: ${data.title || url} videos=${data.videos.length}`);
          return { url, ...data };
        } catch (err) {
          console.error(`[dev-api] fail: ${url} -> ${err.code || 'INTERNAL'} ${err.message}`);
          return {
            url,
            ok: false,
            error:
              err?.code && err?.message
                ? { code: err.code, message: err.message }
                : { code: 'INTERNAL', message: err?.message || '解析失败' },
          };
        }
      })
    );

    return send(res, 200, { ok: true, results });
  }

  // 本地托管 dist/ 静态产物（生产构建后可用）；SPA 无扩展名路径回退 index.html
  if (await serveStatic(res, url.pathname)) return;

  send(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
});

/**
 * GET /api/media — 视频流中转（带微信 Referer 抓取 mpvideo CDN，绕过防盗链 403）
 */
async function handleMedia(req, res, url) {
  const target = url.searchParams.get('u') || '';
  const article = url.searchParams.get('a') || '';
  const vid = (url.searchParams.get('v') || '').slice(0, 64);
  const dl = url.searchParams.get('dl') === '1';

  if (!isMediaUrl(target)) {
    return send(res, 400, { ok: false, error: { code: 'BAD_REQUEST', message: '缺少或非法的媒体地址' } });
  }

  const range = req.headers.range || '';

  let resp = await fetchMediaStream(target, { range });

  // 直链 403：签名可能绑定出口 IP 或已失效 → 重新解析文章拿新签名，重试一次
  if (resp.status === 403 && article && vid) {
    try {
      const data = await parseArticle(article);
      const v = data.videos?.find((x) => x.vid === vid);
      if (v?.url && v.url !== target) {
        resp = await fetchMediaStream(v.url, { range });
      }
    } catch {
      /* 保留原响应，走下方错误处理 */
    }
  }

  if (resp.status !== 200 && resp.status !== 206) {
    console.error(`[dev-api] media upstream ${resp.status}: ${target.slice(0, 100)}`);
    return send(res, 502, { ok: false, error: { code: 'MEDIA_FAILED', message: `视频源返回 ${resp.status}，请重新解析后再试` } });
  }

  const out = {};
  for (const k of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
    const v = resp.headers.get(k);
    if (v) out[k] = v;
  }
  out['Accept-Ranges'] = 'bytes';
  out['Cache-Control'] = 'private, max-age=3600';
  out['Access-Control-Allow-Origin'] = '*';
  if (dl) {
    const fname = /^[A-Za-z0-9_-]{1,60}$/.test(vid) ? vid : 'wechat_video';
    out['Content-Disposition'] = `attachment; filename="${fname}.mp4"`;
  }

  res.writeHead(resp.status, out);
  for await (const chunk of resp.body) {
    res.write(chunk);
  }
  res.end();
}

/**
 * 从 dist/ 提供静态文件。返回 false 表示未命中（交给 404）。
 */
async function serveStatic(res, pathname) {
  if (!existsSync(DIST_DIR)) return false;

  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let file = path.normalize(path.join(DIST_DIR, rel));

  if (!file.startsWith(DIST_DIR)) {
    send(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'forbidden' } });
    return true;
  }

  // SPA 回退：无扩展名且未命中文件时回退 index.html
  if (!existsSync(file) || !statSync(file).isFile()) {
    if (!path.extname(rel) && existsSync(path.join(DIST_DIR, 'index.html'))) {
      file = path.join(DIST_DIR, 'index.html');
    } else {
      return false;
    }
  }

  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

server.listen(PORT, () => {
  console.log(`[dev-api] listening on http://127.0.0.1:${PORT}`);
});
