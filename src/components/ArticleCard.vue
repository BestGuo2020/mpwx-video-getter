<script setup>
import { i18n } from '../i18n.js';
import VideoItem from './VideoItem.vue';

defineProps({
  result: { type: Object, required: true },
});

const t = (key, params) => i18n.t(key, params);

function errText(result) {
  const code = result.error?.code || 'UNKNOWN';
  const map = {
    INVALID_URL: 'errorInvalid',
    BLOCKED: 'errorBlocked',
    FETCH_FAILED: 'errorFetch',
    RATE_LIMITED: 'errorRateLimited',
  };
  const key = map[code];
  if (key) return t(key, { detail: result.error?.message || '' });
  return t('errorUnknown', { detail: result.error?.message || code });
}
</script>

<template>
  <article class="article-card" :class="{ 'is-error': !result.ok }">
    <!-- 解析成功 -->
    <template v-if="result.ok">
      <header class="article-head">
        <img
          v-if="result.cover"
          class="article-cover"
          :src="result.cover"
          alt=""
          loading="lazy"
        />
        <div class="article-meta">
          <h3 class="article-title">{{ result.title || t('unknownTitle') }}</h3>
          <a class="article-url" :href="result.url" target="_blank" rel="noopener noreferrer">
            {{ result.url }}
          </a>
        </div>
      </header>

      <div v-if="result.videos.length" class="video-list">
        <VideoItem v-for="(v, i) in result.videos" :key="i" :video="v" :article-url="result.url" />
      </div>
      <p v-else class="empty-note">
        {{ result.unsupported?.length ? t('unsupportedOnly', { n: result.unsupported.length }) : t('noVideo') }}
      </p>

      <p v-if="result.videos.length && result.unsupported?.length" class="unsupported-note">
        <span v-for="(u, i) in result.unsupported" :key="i">
          {{ u.message }}<template v-if="i < result.unsupported.length - 1">；</template>
        </span>
      </p>
    </template>

    <!-- 解析失败 -->
    <template v-else>
      <div class="error-head">
        <span class="error-badge">{{ t('parseFailed') }}</span>
        <a class="article-url" :href="result.url" target="_blank" rel="noopener noreferrer">
          {{ result.url }}
        </a>
      </div>
      <p class="error-note">{{ errText(result) }}</p>
      <p class="error-hint">{{ t('openOriginalHint') }}</p>
    </template>
  </article>
</template>
