<script setup>
import { NCard, NAlert, NTag, NText, NA, NSpace, NEmpty, NImage } from 'naive-ui';
import { i18n } from '../i18n.js';
import { proxyMediaUrl } from '../api.js';
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
  <n-card class="article-card" :class="{ 'is-error': !result.ok }" :bordered="false">
    <!-- 解析成功 -->
    <template v-if="result.ok">
      <header class="article-head">
        <n-image
          v-if="result.cover"
          class="article-cover"
          :src="proxyMediaUrl(result.cover)"
          :width="96"
          :height="68"
          object-fit="cover"
          :img-props="{ alt: '', loading: 'lazy' }"
          :style="{ borderRadius: '8px' }"
        />
        <div class="article-meta">
          <n-text tag="h3" strong class="article-title">
            {{ result.title || t('unknownTitle') }}
          </n-text>
          <n-a
            class="article-url"
            :href="result.url"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ result.url }}
          </n-a>
        </div>
      </header>

      <div v-if="result.videos.length" class="video-list">
        <VideoItem v-for="(v, i) in result.videos" :key="i" :video="v" :article-url="result.url" />
      </div>
      <n-empty
        v-else
        size="small"
        class="empty-note"
        :description="
          result.unsupported?.length
            ? t('unsupportedOnly', { n: result.unsupported.length })
            : t('noVideo')
        "
      />

      <n-alert
        v-if="result.videos.length && result.unsupported?.length"
        type="warning"
        :bordered="false"
        :show-icon="false"
        class="unsupported-note"
      >
        <span v-for="(u, i) in result.unsupported" :key="i">
          {{ u.message }}<template v-if="i < result.unsupported.length - 1">；</template>
        </span>
      </n-alert>
    </template>

    <!-- 解析失败 -->
    <template v-else>
      <n-space align="center" :size="12" wrap>
        <n-tag type="error" size="small" :bordered="false">{{ t('parseFailed') }}</n-tag>
        <n-a class="article-url" :href="result.url" target="_blank" rel="noopener noreferrer">
          {{ result.url }}
        </n-a>
      </n-space>
      <n-alert type="error" :bordered="false" class="error-note">
        {{ errText(result) }}
      </n-alert>
      <n-text depth="3" class="error-hint">{{ t('openOriginalHint') }}</n-text>
    </template>
  </n-card>
</template>
