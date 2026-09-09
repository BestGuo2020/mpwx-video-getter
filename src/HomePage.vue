<script setup>
import { ref, computed } from 'vue';
import {
  NButton,
  NInput,
  NCard,
  NAlert,
  NSpace,
  NTag,
  NGrid,
  NGi,
  NText,
  NH1,
  NH2,
  NIcon,
  useMessage,
  useLoadingBar,
} from 'naive-ui';
import { MoonOutline, SunnyOutline } from '@vicons/ionicons5';
import { i18n, setLang } from './i18n.js';
import { isDark } from './theme.js';
import { parseArticles } from './api.js';
import ArticleCard from './components/ArticleCard.vue';
import UsageGuide from './components/UsageGuide.vue';

// 示例链接（用于「填入示例」按钮；2025-07 实测含微信原生视频的公开文章）
const EXAMPLE_URL = 'https://mp.weixin.qq.com/s/nwsNHE3f1TVVzDiP1maUfg';

const input = ref('');
const results = ref([]);
const loading = ref(false);
const errorCode = ref('');

const message = useMessage();
const loadingBar = useLoadingBar();

const t = (key, params) => i18n.t(key, params);

function splitUrls(text) {
  return [...new Set(String(text).split(/[\s,，;；]+/).filter(Boolean))];
}

const inputCount = computed(() => splitUrls(input.value).length);

async function onParse() {
  const urls = splitUrls(input.value);
  if (!urls.length) {
    errorCode.value = 'EMPTY_INPUT';
    return;
  }
  errorCode.value = '';
  loading.value = true;
  results.value = [];
  loadingBar.start();
  try {
    results.value = await parseArticles(urls);
    loadingBar.finish();
    const okCount = results.value.filter((r) => r.ok).length;
    if (okCount) {
      message.success(t('resultsTitle') + ` × ${results.value.length}`);
    }
  } catch (e) {
    errorCode.value = e.code || 'UNKNOWN';
    loadingBar.error();
  } finally {
    loading.value = false;
  }
}

function useExample() {
  input.value = EXAMPLE_URL;
  errorCode.value = '';
}

function onClear() {
  input.value = '';
  results.value = [];
  errorCode.value = '';
}

function toggleLang() {
  setLang(i18n.lang === 'zh' ? 'en' : 'zh');
}

const errText = computed(() => {
  if (!errorCode.value) return '';
  const map = {
    EMPTY_INPUT: 'emptyInput',
    INVALID_URL: 'errorInvalid',
    BLOCKED: 'errorBlocked',
    FETCH_FAILED: 'errorFetch',
    RATE_LIMITED: 'errorRateLimited',
    REQUEST_FAILED: 'errorRequestFailed',
    UNKNOWN: 'errorUnknown',
  };
  return t(map[errorCode.value] || 'errorUnknown');
});
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <span class="logo" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="30" height="30">
            <rect width="64" height="64" rx="14" fill="#07c160" />
            <path d="M25 19l20 13-20 13z" fill="#fff" />
          </svg>
        </span>
        <div>
          <n-text strong class="brand-name">{{ t('appName') }}</n-text>
          <n-text depth="3" class="brand-tag">{{ t('appTagline') }}</n-text>
        </div>
      </div>
      <n-space :size="8" align="center">
        <n-button size="small" round secondary @click="toggleLang">
          {{ i18n.lang === 'zh' ? 'EN' : '中文' }}
        </n-button>
        <n-button
          size="small"
          round
          secondary
          :title="isDark ? 'Light mode' : 'Dark mode'"
          @click="isDark = !isDark"
        >
          <template #icon>
            <n-icon :component="isDark ? SunnyOutline : MoonOutline" />
          </template>
        </n-button>
      </n-space>
    </header>

    <main>
      <section class="hero">
        <n-h1 class="hero-title">{{ t('heroTitle') }}</n-h1>
        <n-text depth="3" class="hero-sub">{{ t('heroSub') }}</n-text>
      </section>

      <n-card class="panel" :bordered="false">
        <div class="panel-head">
          <n-text tag="label" for="url-input" strong class="panel-label">
            {{ t('inputLabel') }}
          </n-text>
          <n-tag v-if="inputCount" type="success" size="small" round :bordered="false">
            × {{ inputCount }}
          </n-tag>
        </div>
        <n-input
          id="url-input"
          v-model:value="input"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 10 }"
          :placeholder="t('inputPlaceholder')"
          spellcheck="false"
        />
        <n-space class="panel-actions" :size="10" wrap>
          <n-button type="primary" :loading="loading" @click="onParse">
            {{ loading ? t('parsing') : t('parseBtn') }}
          </n-button>
          <n-button secondary :disabled="loading" @click="useExample">
            {{ t('example') }}
          </n-button>
          <n-button secondary :disabled="loading" @click="onClear">
            {{ t('clearBtn') }}
          </n-button>
        </n-space>
        <n-alert v-if="errText" type="error" :bordered="false" class="error-alert" role="alert">
          {{ errText }}
        </n-alert>
      </n-card>

      <section v-if="results.length" class="results">
        <n-h2 class="section-title">
          {{ t('resultsTitle') }}（{{ results.length }}）
        </n-h2>
        <ArticleCard v-for="(r, idx) in results" :key="idx" :result="r" />
      </section>

      <UsageGuide />

      <n-grid class="info" cols="1 s:2" responsive="screen" x-gap="16" y-gap="16">
        <n-gi>
          <n-card :bordered="false" size="small" :title="t('supportedTitle')">
            <n-text depth="3" class="info-text">{{ t('supportedText') }}</n-text>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card :bordered="false" size="small" :title="t('tipsTitle')">
            <n-space vertical :size="8">
              <n-text depth="3" class="info-text">{{ t('tipExpire') }}</n-text>
              <n-text depth="3" class="info-text">{{ t('tipReferer') }}</n-text>
            </n-space>
          </n-card>
        </n-gi>
      </n-grid>
    </main>

    <footer class="footer">
      <n-text depth="3" class="footer-text">{{ t('footerDisclaimer') }}</n-text>
    </footer>
  </div>
</template>
