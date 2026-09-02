<script setup>
import { ref, computed } from 'vue';
import { i18n, setLang } from './i18n.js';
import { parseArticles } from './api.js';
import ArticleCard from './components/ArticleCard.vue';

// 示例链接（用于「填入示例」按钮；2025-07 实测含微信原生视频的公开文章）
const EXAMPLE_URL = 'https://mp.weixin.qq.com/s/nwsNHE3f1TVVzDiP1maUfg';

const input = ref('');
const results = ref([]);
const loading = ref(false);
const errorCode = ref('');

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
  try {
    results.value = await parseArticles(urls);
  } catch (e) {
    errorCode.value = e.code || 'UNKNOWN';
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
          <div class="brand-name">{{ t('appName') }}</div>
          <div class="brand-tag">{{ t('appTagline') }}</div>
        </div>
      </div>
      <button class="lang-btn" @click="setLang(i18n.lang === 'zh' ? 'en' : 'zh')">
        {{ i18n.lang === 'zh' ? 'EN' : '中文' }}
      </button>
    </header>

    <main>
      <section class="hero">
        <h1>{{ t('heroTitle') }}</h1>
        <p>{{ t('heroSub') }}</p>
      </section>

      <section class="panel">
        <div class="panel-head">
          <label for="url-input">{{ t('inputLabel') }}</label>
          <span v-if="inputCount" class="count">× {{ inputCount }}</span>
        </div>
        <textarea
          id="url-input"
          v-model="input"
          rows="4"
          :placeholder="t('inputPlaceholder')"
          spellcheck="false"
        ></textarea>
        <div class="panel-actions">
          <button class="btn btn-primary" :disabled="loading" @click="onParse">
            <span v-if="loading" class="spinner" aria-hidden="true"></span>
            {{ loading ? t('parsing') : t('parseBtn') }}
          </button>
          <button class="btn btn-ghost" @click="useExample">{{ t('example') }}</button>
          <button class="btn btn-ghost" @click="onClear">{{ t('clearBtn') }}</button>
        </div>
        <p v-if="errText" class="error-text" role="alert">{{ errText }}</p>
      </section>

      <section v-if="results.length" class="results">
        <h2>{{ t('resultsTitle') }}（{{ results.length }}）</h2>
        <ArticleCard v-for="(r, idx) in results" :key="idx" :result="r" />
      </section>

      <section class="info">
        <div class="info-card">
          <h3>{{ t('supportedTitle') }}</h3>
          <p>{{ t('supportedText') }}</p>
        </div>
        <div class="info-card">
          <h3>{{ t('tipsTitle') }}</h3>
          <p>{{ t('tipExpire') }}</p>
          <p>{{ t('tipReferer') }}</p>
        </div>
      </section>
    </main>

    <footer class="footer">
      <p>{{ t('footerDisclaimer') }}</p>
    </footer>
  </div>
</template>
