// src/api.js — 前端与解析后端（本地 Node / 线上 Cloudflare Worker）的通信

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
