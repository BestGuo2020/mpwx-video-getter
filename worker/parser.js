// worker/parser.js
// 微信公众号文章 → 微信原生视频（mpvideo.qpic.cn）签名直链解析。
//
// 平台无关：同时供 Cloudflare Pages Worker (_worker.js) 与本地 Node 开发
// 服务器 (server/dev-server.mjs) 使用，只依赖全局 fetch / URL / AbortController。
//
// 解析思路：
//   1. 以浏览器 UA 服务端抓取文章 HTML（绕过浏览器 CORS 与 Referer 限制）
//   2. 识别「环境异常」验证页并报错
//   3. 提取 iframe / 自定义标签候选（video_player_tmpl、data-mpvid=wxv_...）
//   4. 文章 HTML 中直接出现的 mpvideo.qpic.cn 直链直接配对
//   5. 其余候选并发请求播放器模板页，从 HTML 与 window.__mpTempData JSON
//      中提取签名直链（dis_k/dis_t 有时效，故解析结果不做任何缓存）

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_ARTICLE = 15000;
const FETCH_TIMEOUT_PLAYER = 10000;
const MAX_VIDEOS_PER_ARTICLE = 8;
const MAX_CANDIDATES = 6;

export class ParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
  }
}

/** 仅接受 mp.weixin.qq.com 公众号文章链接 */
export function isArticleUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    return (
      (u.hostname === 'mp.weixin.qq.com' || u.hostname === 'weixin.qq.com') &&
      /^https?:$/.test(u.protocol) &&
      (u.pathname === '/s' || u.pathname.startsWith('/s/'))
    );
  } catch {
    return false;
  }
}

/**
 * 校验中转媒体地址，只放行微信系的 mp4 与图片（防止被当作开放代理）：
 * - mpvideo.qpic.cn 的 .mp4（视频）
 * - mmbiz.qpic.cn 的任意路径（文章封面 / 视频缩略图，可能无扩展名，如 /0?wx_fmt=jpeg）
 */
export function isMediaUrl(raw) {
  try {
    const u = new URL(String(raw));
    if (u.protocol !== 'https:') return false;
    if (u.hostname === 'mpvideo.qpic.cn') return u.pathname.toLowerCase().endsWith('.mp4');
    if (u.hostname === 'mmbiz.qpic.cn') return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * 服务端抓取媒体流（供 /api/media 中转使用）。
 * 关键：必须携带微信域名的 Referer。实测 mpvideo CDN 对非微信 Referer / 无 Referer
 * 的浏览器形态请求一律 403（防盗链），服务端带微信 Referer 即可正常返回 206/200。
 */
export async function fetchMediaStream(target, { range = '' } = {}) {
  const headers = {
    'User-Agent': UA,
    Accept: '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: 'https://mp.weixin.qq.com/',
  };
  if (range) headers.Range = range;
  return fetch(target, { headers, redirect: 'follow' });
}

function decodeEntities(s = '') {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function safeDecodeURI(s) {
  if (!s) return '';
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** 统一升级为 https，避免 https 页面上出现混合内容被浏览器拦截 */
function toHttps(u) {
  return String(u || '').replace(/^http:\/\//i, 'https://');
}

/**
 * 把文本中的 JS/JSON 转义规范化，便于后续正则直接命中 URL：
 * - \u002F、\/ → /（JSON 斜杠转义）
 * - \x26amp;、\u0026amp;、\x26 → &（微信 HTML 中 URL 参数的 JS 转义实体）
 * - //mpvideo.qpic.cn → https://...（协议相对地址，lookbehind 防止误替换 https://）
 */
function normalizeText(text) {
  return String(text)
    .replace(/\\u002F/gi, '/')
    .replace(/\\u0026amp;/gi, '&')
    .replace(/\\u0026/gi, '&')
    .replace(/\\x26amp;/gi, '&')
    .replace(/\\x26/gi, '&')
    .replace(/\\\//g, '/')
    .replace(/(?<!:)\/\/mpvideo\.qpic\.cn/g, 'https://mpvideo.qpic.cn');
}

async function fetchText(url, { timeoutMs, referer } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? 15000);
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: referer || 'https://mp.weixin.qq.com/',
      },
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new ParseError('FETCH_FAILED', `HTTP ${resp.status}`);
    }
    return await resp.text();
  } catch (err) {
    if (err instanceof ParseError) throw err;
    if (err?.name === 'AbortError') throw new ParseError('FETCH_FAILED', 'timeout');
    throw new ParseError('FETCH_FAILED', err?.message || 'network error');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 识别微信的「环境异常 / 验证页 / 访问过于频繁」拦截页。
 * 实测：正常文章正文通常数 MB，而拦截页只有几十 KB（~30KB），
 * 故以 100KB 作为正文关键词判定的长度阈值。
 */
function looksBlocked(html) {
  if (/<title>[^<]*(环境异常|操作频繁|访问频繁|系统繁忙|验证)[^<]*<\/title>/i.test(html)) return true;
  return (
    html.length < 100000 &&
    /环境异常|操作频繁|访问频繁|系统繁忙|请完成验证|环境检测|扫描二维码/i.test(html)
  );
}

function extractMeta(html, prop) {
  const re1 = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? decodeEntities(m[1]).trim() : '';
}

function extractTitle(html) {
  const og = extractMeta(html, 'og:title');
  if (og) return og;
  const h = html.match(/<h1[^>]*class=["'][^"']*rich_media_title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
  if (h) return decodeEntities(h[1].replace(/<[^>]+>/g, '')).trim();
  const t = html.match(/<title>([\s\S]*?)<\/title>/i);
  return t ? decodeEntities(t[1]).trim() : '';
}

/**
 * 提取视频承载标签（iframe / video / mp-common-videosnap）的候选信息。
 * 只匹配开始标签即可，属性都在开始标签上。
 */
function extractCandidates(html) {
  const out = [];
  const re = /<(?:iframe|video|mp-common-videosnap)\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const rawSrc =
      (tag.match(/data-src=["']([^"']+)["']/i) || tag.match(/\ssrc=["']([^"']+)["']/i) || tag.match(/data-url=["']([^"']+)["']/i) || [])[1] || '';
    const rawVid =
      (tag.match(/data-mpvid=["']([^"']+)["']/i) || [])[1] ||
      (rawSrc.match(/[?&]vid=([\w.-]+)/) || [])[1] ||
      '';
    const rawCover =
      (tag.match(/data-cover=["']([^"']+)["']/i) || tag.match(/data-coverurl=["']([^"']+)["']/i) || tag.match(/poster=["']([^"']+)["']/i) || [])[1] || '';

    const src = safeDecodeURI(decodeEntities(rawSrc));
    const vid = decodeEntities(rawVid);
    const cover = safeDecodeURI(decodeEntities(rawCover));

    if (!src && !vid) continue;
    out.push({ src, vid, cover });
  }
  return out;
}

function classify(c) {
  const blob = `${c.src} ${c.vid}`;
  if (/^wxv_/i.test(c.vid) || blob.includes('mpvideo') || blob.includes('video_player_tmpl')) return 'wechat';
  if (blob.includes('v.qq.com')) return 'tencent';
  if (blob.includes('findermp') || blob.includes('channels.weixin') || blob.includes('finder.video')) return 'channels';
  return 'unknown';
}

const MPVIDEO_URL_RE = /https?:\/\/mpvideo\.qpic\.cn\/[^"'\\\s<>)]+/g;

/** 从任意文本中提取所有 mpvideo.qpic.cn 直链（去重、升 https、去掉尾部残渣） */
function extractMpvideoUrls(text) {
  const seen = new Set();
  const re = new RegExp(MPVIDEO_URL_RE.source, 'g');
  let m;
  while ((m = re.exec(text))) {
    let u = decodeEntities(m[0]).replace(/^http:\/\//i, 'https://');
    u = u.replace(/&+$/, '');
    seen.add(u);
  }
  return [...seen];
}

/** 清晰度优先级：f10002(超清) > f10102 > f10004(流畅) > f10104 > 其他 */
const QUALITY_ORDER = ['f10002', 'f10102', 'f10004', 'f10104'];

function qualityRank(url) {
  const m = url.match(/\.(f\d{5})\.mp4/);
  if (!m) return 0;
  const i = QUALITY_ORDER.indexOf(m[1]);
  return i === -1 ? 0 : QUALITY_ORDER.length - i;
}

/**
 * 把直链按视频分组（同一视频的多个清晰度共享路径前缀），
 * 每组内排序：带 auth_info 的优先，其次清晰度高。
 * 返回 [['https://...'], ['https://...'], ...]
 */
function groupByVideo(urls) {
  const groups = new Map();
  for (const u of urls) {
    const base = u.replace(/\.f\d{5}\.mp4.*$/, '');
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(u);
  }
  return [...groups.values()].map((list) =>
    list.sort((a, b) => {
      const hasAuth = (x) => (x.includes('auth_info') || x.includes('auth_key') ? 1 : 0);
      const da = hasAuth(b) - hasAuth(a);
      if (da) return da;
      return qualityRank(b) - qualityRank(a);
    })
  );
}

/** format_id → 清晰度标签（101xx 系列为同清晰度的省流编码变体） */
const QUALITY_LABEL_BY_FORMAT = {
  10002: '超清',
  10102: '超清',
  10003: '高清',
  10103: '高清',
  10004: '流畅',
  10104: '流畅',
  20003: '自动',
};

/** 从 URL 文件名推断清晰度标签（无元数据时的兜底） */
function labelForUrl(url) {
  const m = url.match(/\.(f(\d{5}))\.mp4/);
  if (!m) return '标清';
  return QUALITY_LABEL_BY_FORMAT[Number(m[2])] || '标清';
}

function baseOf(url) {
  return url.replace(/\.f\d{5}\.mp4.*$/, '');
}

/**
 * 解析文章 HTML 中的 mp_video_trans_info 数组（每个视频的完整清晰度清单 + 元数据）。
 * 兼容两种形态：url: 'http://...'（原始数据）与 url: ('http://...').replace(...)（JS 包装）。
 * 返回 [{url, formatId, width, height, filesize, durationMs, label}]，按 url 去重。
 */
function extractTransInfo(html) {
  const out = [];
  const seen = new Set();
  const re = /mp_video_trans_info\s*:\s*\[/g;
  let m;
  while ((m = re.exec(html))) {
    let pos = m.index + m[0].length;
    while (pos < html.length) {
      const open = html.indexOf('{', pos);
      if (open === -1) break;
      const close = html.indexOf('}', open);
      if (close === -1) break;
      const item = html.slice(open, close + 1);
      // 数组外的后续字段没有 format_id，遇之即停
      if (!item.includes('format_id')) break;
      const g = (re2) => (item.match(re2) || [])[1] || '';
      const rawUrl = g(/url:\s*(?:\(\s*)?'([^']+)'/);
      pos = close + 1;
      if (!rawUrl) continue;
      const url = decodeEntities(rawUrl).replace(/^http:\/\//i, 'https://');
      if (!url.includes('mpvideo.qpic.cn') || seen.has(url)) continue;
      seen.add(url);
      const formatId = Number(g(/format_id:\s*'(\d+)'/) || 0);
      out.push({
        url,
        formatId,
        width: Number(g(/width:\s*'(\d+)'/) || 0),
        height: Number(g(/height:\s*'(\d+)'/) || 0),
        filesize: Number(g(/filesize:\s*'(\d+)'/) || 0),
        durationMs: Number(g(/duration_ms:\s*'(\d+)'/) || 0),
        label: g(/video_quality_wording:\s*'([^']*)'/) || QUALITY_LABEL_BY_FORMAT[formatId] || '标清',
      });
    }
  }
  return out;
}

/** 按视频分组 trans_info 条目，组内排序：清晰度优先、同档位大文件（标准编码）优先 */
function groupTransInfo(items) {
  const groups = new Map();
  for (const t of items) {
    const base = baseOf(t.url);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(t);
  }
  return [...groups.values()].map((list) =>
    list.sort((a, b) => qualityRank(b.url) - qualityRank(a.url) || b.filesize - a.filesize)
  );
}

/** 一组 trans_info 条目 → 前端 sources 结构 */
function toSources(items) {
  return items.map((t) => ({
    url: t.url,
    label: t.label,
    width: t.width,
    height: t.height,
    filesize: t.filesize,
    durationMs: t.durationMs,
  }));
}

/** 一组裸 URL → sources（无元数据兜底，标签从文件名推断） */
function urlsToSources(urls) {
  return urls.map((u) => ({ url: u, label: labelForUrl(u), width: 0, height: 0, filesize: 0, durationMs: 0 }));
}

/** 递归收集 JSON 对象里所有含 mpvideo.qpic.cn 的字符串字段 */
function collectMpvideoUrls(obj, out = []) {
  if (typeof obj === 'string') {
    if (obj.includes('mpvideo.qpic.cn')) out.push(obj.replace(/^http:\/\//i, 'https://'));
    return out;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) collectMpvideoUrls(v, out);
    return out;
  }
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) collectMpvideoUrls(v, out);
    return out;
  }
  return out;
}

/** 解析播放器模板页中的 window.__mpTempData = {...} JSON */
function extractPlayerTempData(html) {
  const m = html.match(/window\.__mpTempData\s*=\s*([\s\S]*?)\s*;?\s*(?:<\/script>|var\s|window\.|$)/i);
  if (!m) return [];
  try {
    return collectMpvideoUrls(JSON.parse(m[1].replace(/;\s*$/, '')));
  } catch {
    return [];
  }
}

function playerUrlFor(candidate) {
  if (candidate.src && (candidate.src.includes('mpvideo') || candidate.src.includes('video_player_tmpl'))) {
    return candidate.src;
  }
  if (candidate.vid) {
    return `https://mp.weixin.qq.com/mp/readtemplate?t=pages/video_player_tmpl&action=mpvideo&auto=0&vid=${encodeURIComponent(candidate.vid)}`;
  }
  return '';
}

/** 解析单个微信视频候选：候选自带直链 → 播放器页直链 → __mpTempData → 一层嵌套兜底 */
async function resolveWechatVideo(candidate) {
  const direct = extractMpvideoUrls(candidate.src);
  if (direct.length) return { urls: direct, blocked: false };

  let pageUrl = playerUrlFor(candidate);
  if (!pageUrl) return { urls: [], blocked: false };

  const html = await fetchText(pageUrl, { timeoutMs: FETCH_TIMEOUT_PLAYER });
  if (looksBlocked(html)) return { urls: [], blocked: true };

  let urls = extractMpvideoUrls(html);
  if (!urls.length) urls = extractPlayerTempData(html);

  // 一层兜底：播放器页里再嵌 iframe
  if (!urls.length) {
    const nested = extractCandidates(html).filter((c) => classify(c) === 'wechat');
    for (const nc of nested) {
      const target = playerUrlFor(nc);
      if (!target || target === pageUrl) continue;
      try {
        const h2 = await fetchText(target, { timeoutMs: FETCH_TIMEOUT_PLAYER });
        urls = extractMpvideoUrls(h2);
        if (!urls.length) urls = extractPlayerTempData(h2);
      } catch {
        /* 忽略单个嵌套页面失败 */
      }
      if (urls.length) break;
    }
  }

  return { urls, blocked: false };
}

function dedupeCandidates(list) {
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const key = c.vid || c.src;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function dedupeVideos(list) {
  const seen = new Set();
  return list.filter((v) => {
    if (seen.has(v.url)) return false;
    seen.add(v.url);
    return true;
  });
}

/**
 * 解析一篇文章。
 * @param {string} rawUrl 文章链接
 * @returns {Promise<{ok:true,title:string,cover:string,videos:Array,unsupported:Array}>}
 *          失败时抛出 ParseError（code: INVALID_URL / FETCH_FAILED / BLOCKED）
 */
export async function parseArticle(rawUrl) {
  const url = String(rawUrl).trim();
  if (!isArticleUrl(url)) {
    throw new ParseError('INVALID_URL', '仅支持 mp.weixin.qq.com 公众号文章链接');
  }

  const htmlRaw = await fetchText(url, { timeoutMs: FETCH_TIMEOUT_ARTICLE });
  const html = normalizeText(htmlRaw);

  if (looksBlocked(html)) {
    throw new ParseError('BLOCKED', '微信返回环境异常/验证页，暂时无法解析，请稍后重试');
  }

  const title = extractTitle(html);
  const cover = extractMeta(html, 'og:image').replace(/^http:\/\//i, 'https://');

  const candidates = dedupeCandidates(extractCandidates(html));
  const wechatCandidates = candidates.filter((c) => classify(c) === 'wechat').slice(0, MAX_CANDIDATES);

  // 文章 HTML 内嵌 mp_video_trans_info：每个视频的完整清晰度清单 + 元数据
  const transGroups = groupTransInfo(extractTransInfo(html));
  const transBases = new Set(transGroups.map((g) => baseOf(g[0].url)));
  // 其余直链（老结构等，无元数据）：排除已覆盖的基路径，避免冷链接重复成组
  const extraGroups = groupByVideo(
    extractMpvideoUrls(html).filter((u) => !transBases.has(baseOf(u)))
  ).map((urls) => urlsToSources(urls));

  const unsupported = [];
  const seenKinds = new Set();
  for (const c of candidates) {
    const kind = classify(c);
    if (kind === 'tencent' && !seenKinds.has('tencent')) {
      seenKinds.add('tencent');
      unsupported.push({ kind: 'tencent', message: '腾讯视频嵌入暂不支持（后续版本）' });
    } else if (kind === 'channels' && !seenKinds.has('channels')) {
      seenKinds.add('channels');
      unsupported.push({ kind: 'channels', message: '视频号视频暂不支持，可跳转原文查看' });
    }
  }

  const videos = [];
  const pairedVids = new Set();

  // 情况一：文章 HTML 中直接出现直链/清晰度清单（每组 = 一个视频）
  const itemGroups = [...transGroups, ...extraGroups];
  if (itemGroups.length) {
    if (!wechatCandidates.length) {
      // 没有 iframe 承载，分组单独成条
      for (const g of itemGroups.slice(0, MAX_VIDEOS_PER_ARTICLE)) {
        videos.push({ vid: '', cover, url: g[0].url, sources: g });
      }
    } else {
      // 按顺序与候选配对（数量不齐时，多出的候选走播放器页兜底，多出的分组单独成条）
      wechatCandidates.forEach((c, i) => {
        const g = itemGroups[i];
        if (!g?.length) return;
        pairedVids.add(c.vid || c.src);
        videos.push({ vid: c.vid, cover: toHttps(c.cover) || cover, url: g[0].url, sources: g });
      });
      for (const g of itemGroups.slice(wechatCandidates.length)) {
        if (videos.length >= MAX_VIDEOS_PER_ARTICLE) break;
        videos.push({ vid: '', cover, url: g[0].url, sources: g });
      }
    }
  }

  // 情况二：剩余候选并发请求播放器模板页
  const pending = wechatCandidates.filter((c) => !pairedVids.has(c.vid || c.src));
  const settled = await Promise.allSettled(pending.map((c) => resolveWechatVideo(c)));
  settled.forEach((s, i) => {
    if (s.status !== 'fulfilled' || !s.value?.urls?.length) return;
    if (videos.length >= MAX_VIDEOS_PER_ARTICLE) return;
    const c = pending[i];
    const sources = urlsToSources(s.value.urls);
    videos.push({ vid: c.vid, cover: toHttps(c.cover) || cover, url: sources[0].url, sources });
  });

  return { ok: true, title, cover, videos: dedupeVideos(videos), unsupported };
}
