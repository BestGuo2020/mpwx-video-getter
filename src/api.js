// src/api.js — 前端与解析后端（本地 Node / 线上 Cloudflare Worker / EdgeOne）的通信

export async function parseArticles(urls) {
  const res = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    const err = new Error('请求失败');
    err.code = 'REQUEST_FAILED';
    throw err;
  }

  if (!res.ok || !data.ok) {
    const err = new Error(data?.error?.message || '请求失败');
    err.code = data?.error?.code || 'REQUEST_FAILED';
    throw err;
  }

  return data.results;
}

/**
 * 把微信系资源（视频直链 / 封面图 / 缩略图）包装成本站 /api/media 中转地址。
 * 服务端带微信 Referer 抓取，绕过 mpvideo / mmbiz CDN 的跨站防盗链
 * （直连时浏览器会收到 403 或「未经允许不可引用」占位图）。
 */
export function proxyMediaUrl(raw) {
  return `/api/media?u=${encodeURIComponent(raw)}`;
}
