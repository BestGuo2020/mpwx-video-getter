// src/theme.js — naive-ui 主题配置（品牌绿 + 暗色模式，localStorage 持久化）

import { ref, computed, watch } from 'vue';
import { darkTheme } from 'naive-ui';

export const isDark = ref(
  (() => {
    try {
      return localStorage.getItem('mpwx-theme') === 'dark';
    } catch {
      return false;
    }
  })()
);

watch(isDark, (v) => {
  try {
    localStorage.setItem('mpwx-theme', v ? 'dark' : 'light');
  } catch {
    /* 忽略隐私模式下 localStorage 不可用 */
  }
  document.body.dataset.theme = v ? 'dark' : 'light';
});

// 初始化时同步 body 标记（供全局 CSS 切换背景/文字色）
document.body.dataset.theme = isDark.value ? 'dark' : 'light';

export const theme = computed(() => (isDark.value ? darkTheme : null));

export const themeOverrides = {
  common: {
    primaryColor: '#07C160',
    primaryColorHover: '#059E4E',
    primaryColorPressed: '#048A43',
    primaryColorSuppl: '#07C160',
    borderRadius: '10px',
  },
  Button: {
    borderRadiusMedium: '999px',
    borderRadiusSmall: '999px',
    borderRadiusLarge: '999px',
  },
  Card: {
    borderRadius: '16px',
  },
};
