// scripts/postbuild.mjs — 构建后处理
// 将 Cloudflare Pages 所需的文件拷贝进 dist/：
//   _worker.js + worker/  → 高级模式 Worker 及其依赖
//   _redirects / robots.txt / sitemap.xml → 站点级配置
// 说明：不含任何广告相关文件。

import { cpSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entries = ['_worker.js', 'worker', '_redirects', 'robots.txt', 'sitemap.xml'];

// 防漂移校验：worker/parser.js 与 edge-functions/lib/parser.js 必须保持一致
// （EdgeOne 边缘函数引用后者；不一致会导致双平台行为差异，直接失败构建）
const cfParser = path.join(root, 'worker', 'parser.js');
const eoParser = path.join(root, 'edge-functions', 'lib', 'parser.js');
if (existsSync(cfParser) && existsSync(eoParser)) {
  const a = readFileSync(cfParser);
  const b = readFileSync(eoParser);
  if (!a.equals(b)) {
    console.error('[postbuild] 错误：worker/parser.js 与 edge-functions/lib/parser.js 内容不一致！');
    console.error('[postbuild] 同步命令：Copy-Item worker\\parser.js edge-functions\\lib\\parser.js');
    process.exit(1);
  }
  console.log('[postbuild] parser 双平台副本一致性校验通过');
}

for (const entry of entries) {
  const src = path.join(root, entry);
  const dst = path.join(root, 'dist', entry);
  if (!existsSync(src)) {
    console.warn(`[postbuild] skip (missing): ${entry}`);
    continue;
  }
  cpSync(src, dst, { recursive: true });
  console.log(`[postbuild] copied: ${entry}`);
}

console.log('[postbuild] done. dist/ 可直接发布到 Cloudflare Pages。');
