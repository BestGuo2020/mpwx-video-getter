import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 本地开发时，/api 请求代理到 Node 开发服务器（pnpm dev:api，端口 8788）。
// 生产环境由 Cloudflare Pages 的 _worker.js 直接处理同域 /api/parse，无需代理。
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
    },
  },
});
