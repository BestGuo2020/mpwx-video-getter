// edge-functions/api/media.js — EdgeOne Pages 边缘函数
// 路由：GET /api/media?u=<mpvideo 直链>&a=<文章链接>&v=<vid>[&dl=1]
// 视频流中转：浏览器只与本域通信，CDN 只看到服务端请求（微信 Referer），绕过防盗链 403。

import { parseArticle, isMediaUrl, fetchMediaStream } from '../lib/parser.js';

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

const RATE_LIMIT_MAX = 60;
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

export async function onRequest(context) {
  const request = context.request;

  if (request.method !== 'GET') {
    return json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: '仅支持 GET 请求' } }, 405);
  }

  const ip = clientIp(request);
  if (isRateLimited(`${ip}:media`, Date.now())) {
    return json({ ok: false, error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' } }, 429);
  }

  const url = new URL(request.url);
  const target = url.searchParams.get('u') || '';
  const article = url.searchParams.get('a') || '';
  const vid = (url.searchParams.get('v') || '').slice(0, 64);
  const dl = url.searchParams.get('dl') === '1';

  if (!isMediaUrl(target)) {
    return json({ ok: false, error: { code: 'BAD_REQUEST', message: '缺少或非法的媒体地址' } }, 400);
  }

  const range = request.headers.get('Range') || '';

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
    return json(
      { ok: false, error: { code: 'MEDIA_FAILED', message: `视频源返回 ${resp.status}，请重新解析后再试` } },
      502
    );
  }

  const out = new Headers();
  for (const k of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
    const v = resp.headers.get(k);
    if (v) out.set(k, v);
  }
  out.set('Accept-Ranges', 'bytes');
  // 图片（封面/缩略图）可长缓存，视频保持私有短缓存
  out.set('Cache-Control', (out.get('Content-Type') || '').startsWith('image/') ? 'public, max-age=86400' : 'private, max-age=3600');
  out.set('Access-Control-Allow-Origin', '*');
  if (dl) {
    const fname = /^[A-Za-z0-9_-]{1,60}$/.test(vid) ? vid : 'wechat_video';
    out.set('Content-Disposition', `attachment; filename="${fname}.mp4"`);
  }

  return new Response(resp.body, { status: resp.status, headers: out });
}
