// edge-functions/api/parse.js — EdgeOne Pages 边缘函数
// 路由：POST /api/parse（公众号文章视频解析）
// 与 Cloudflare 版 _worker.js 行为一致，复用 edge-functions/lib/parser.js。

import { parseArticle, isArticleUrl } from '../lib/parser.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

// 简单的按 IP 限频（实例级、内存态，仅作基本防护）
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const hits = new Map();

function isRateLimited(key, now) {
  const entry = hits.get(key);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    hits.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

function clientIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

const MAX_URLS = 10;

export async function onRequest(context) {
  const request = context.request;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }
  if (request.method !== 'POST') {
    return json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求' } }, 405);
  }

  const ip = clientIp(request);
  if (isRateLimited(`${ip}:parse`, Date.now())) {
    return json({ ok: false, error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' } }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: { code: 'BAD_REQUEST', message: '请求体必须是 JSON' } }, 400);
  }

  const urls = (Array.isArray(body?.urls) ? body.urls : [])
    .filter((u) => typeof u === 'string' && u.trim())
    .slice(0, MAX_URLS);

  if (!urls.length) {
    return json({ ok: false, error: { code: 'BAD_REQUEST', message: '缺少 urls 参数' } }, 400);
  }

  const results = await Promise.all(
    urls.map(async (u) => {
      const url = u.trim();
      if (!isArticleUrl(url)) {
        return { url, ok: false, error: { code: 'INVALID_URL', message: '仅支持 mp.weixin.qq.com/s/ 公众号文章链接' } };
      }
      try {
        const data = await parseArticle(url);
        return { url, ...data };
      } catch (err) {
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

  return json({ ok: true, results });
}
