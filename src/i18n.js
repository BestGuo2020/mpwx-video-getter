// src/i18n.js — 轻量中英双语（客户端切换，localStorage 持久化）

import { reactive } from 'vue';

const messages = {
  zh: {
    appName: '公众号视频提取',
    appTagline: '微信文章视频 · 在线解析',
    heroTitle: '一键提取公众号文章视频',
    heroSub: '粘贴微信公众号文章链接，自动解析出文章内的视频直链，支持在线预览、复制链接与下载。',
    inputLabel: '文章链接',
    inputPlaceholder: '粘贴 mp.weixin.qq.com 文章链接，一行一个，支持批量解析\n例如：https://mp.weixin.qq.com/s/xxxxx',
    parseBtn: '开始解析',
    parsing: '解析中…',
    clearBtn: '清空',
    example: '填入示例',
    resultsTitle: '解析结果',
    unknownTitle: '（未获取到标题）',
    noVideo: '该文章未检测到微信原生视频。',
    unsupportedOnly: '检测到 {n} 个暂不支持的视频（腾讯视频/视频号），请跳转原文查看。',
    parseFailed: '解析失败',
    openOriginalHint: '提示：也可直接打开原文链接，在页面内播放视频。',
    previewBtn: '预览',
    hidePreview: '收起预览',
    qualityLabel: '清晰度',
    downloadBtn: '下载',
    copyBtn: '复制直链',
    copied: '已复制 ✓',
    openBtn: '打开直链',
    copyManual: '复制失败，请手动复制：',
    emptyInput: '请先粘贴至少一个公众号文章链接。',
    errorInvalid: '链接格式不正确，仅支持 mp.weixin.qq.com 公众号文章链接。',
    errorBlocked: '微信返回环境异常/验证页，暂时无法解析，请稍后重试。',
    errorFetch: '文章抓取失败：{detail}',
    errorRateLimited: '请求过于频繁，请稍后再试。',
    errorRequestFailed: '请求失败，请检查网络或稍后重试。',
    errorUnknown: '解析失败：{detail}',
    supportedTitle: '支持范围',
    supportedText: '目前支持解析微信公众号文章中的原生视频（mpvideo）。腾讯视频嵌入、视频号视频暂不支持，后续版本将陆续加入。',
    tipsTitle: '使用提示',
    tipExpire: '视频直链带时效签名（dis_k/dis_t/auth_key），解析后请尽快下载；失效后重新解析即可获取新链接。',
    tipReferer: '「预览」与「下载」由本站中转获取（微信防盗链只放行微信域名 Referer，跨站直连会被 403）；「打开直链」为原始地址，部分网络可能被拒，属正常现象。',
    footerDisclaimer: '本工具仅用于个人学习研究，请尊重原作者与版权方的权益，勿将内容用于商业用途。',
  },
  en: {
    appName: 'WeChat Video Grabber',
    appTagline: 'WeChat article videos · parsed online',
    heroTitle: 'Extract videos from WeChat articles in one click',
    heroSub: 'Paste a WeChat official account article link to resolve its direct video URLs. Preview online, copy the link or download.',
    inputLabel: 'Article links',
    inputPlaceholder: 'Paste mp.weixin.qq.com article links, one per line (batch supported)\ne.g. https://mp.weixin.qq.com/s/xxxxx',
    parseBtn: 'Parse',
    parsing: 'Parsing…',
    clearBtn: 'Clear',
    example: 'Try an example',
    resultsTitle: 'Results',
    unknownTitle: '(title unavailable)',
    noVideo: 'No WeChat native videos found in this article.',
    unsupportedOnly: 'Found {n} unsupported video(s) (Tencent Video / Channels). Please open the original article.',
    parseFailed: 'Parse failed',
    openOriginalHint: 'Tip: you can also open the original article and play the video there.',
    previewBtn: 'Preview',
    hidePreview: 'Hide preview',
    qualityLabel: 'Quality',
    downloadBtn: 'Download',
    copyBtn: 'Copy link',
    copied: 'Copied ✓',
    openBtn: 'Open URL',
    copyManual: 'Copy failed, please copy manually:',
    emptyInput: 'Please paste at least one WeChat article link.',
    errorInvalid: 'Invalid link. Only mp.weixin.qq.com article links are supported.',
    errorBlocked: 'WeChat returned a verification page. Please retry later.',
    errorFetch: 'Failed to fetch the article: {detail}',
    errorRateLimited: 'Too many requests, please try again later.',
    errorRequestFailed: 'Request failed. Please check your network and retry.',
    errorUnknown: 'Parse failed: {detail}',
    supportedTitle: 'Supported',
    supportedText: 'Currently supports native videos (mpvideo) in WeChat official account articles. Tencent Video embeds and WeChat Channels are not supported yet.',
    tipsTitle: 'Tips',
    tipExpire: 'Video URLs carry time-limited signatures (dis_k/dis_t/auth_key). Download promptly; re-parse to get fresh links after expiry.',
    tipReferer: '"Preview" and "Download" are proxied through this site (the WeChat CDN only accepts WeChat-domain Referer, so cross-site direct access returns 403). "Open URL" is the raw link and may be refused on some networks — that is normal.',
    footerDisclaimer: 'For personal study and research only. Please respect the original authors and copyright holders.',
  },
};

export const i18n = reactive({
  lang: (() => {
    try {
      return localStorage.getItem('mpwx-lang') === 'en' ? 'en' : 'zh';
    } catch {
      return 'zh';
    }
  })(),
  t(key, params) {
    let s = messages[this.lang]?.[key] ?? messages.zh[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    }
    return s;
  },
});

export function setLang(lang) {
  i18n.lang = lang === 'en' ? 'en' : 'zh';
  try {
    localStorage.setItem('mpwx-lang', i18n.lang);
  } catch {
    /* 忽略隐私模式下 localStorage 不可用 */
  }
  document.documentElement.lang = i18n.lang === 'zh' ? 'zh-CN' : 'en';
}
