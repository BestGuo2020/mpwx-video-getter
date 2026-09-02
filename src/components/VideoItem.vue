<script setup>
import { ref, computed } from 'vue';
import { i18n } from '../i18n.js';
import { proxyMediaUrl } from '../api.js';

const props = defineProps({
  video: { type: Object, required: true },
  articleUrl: { type: String, default: '' },
});

const t = (key, params) => i18n.t(key, params);

const playing = ref(false);
const copied = ref(false);

// 预览/下载都走本站 /api/media 中转：服务端带微信 Referer 抓取，
// 绕过 mpvideo CDN 对跨站直连的 403 防盗链。
const mediaUrl = computed(() => {
  const p = new URLSearchParams({ u: props.video.url });
  if (props.articleUrl) p.set('a', props.articleUrl);
  if (props.video.vid) p.set('v', props.video.vid);
  return `/api/media?${p.toString()}`;
});

const downloadUrl = computed(() => `${mediaUrl.value}&dl=1`);

async function copyLink() {
  try {
    await navigator.clipboard.writeText(props.video.url);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    window.prompt(t('copyManual'), props.video.url);
  }
}
</script>

<template>
  <div class="video-item">
    <div class="video-media" @click="playing = !playing">
      <video v-if="playing" :src="mediaUrl" controls autoplay :poster="proxyMediaUrl(video.cover)"></video>
      <template v-else>
        <img :src="proxyMediaUrl(video.cover)" alt="" loading="lazy" />
        <span class="play-ov" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="34" height="34">
            <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
          </svg>
        </span>
      </template>
    </div>
    <div class="video-info">
      <div class="video-vid">{{ video.vid || 'mpvideo' }}</div>
      <div class="video-actions">
        <button class="btn btn-small btn-ghost" @click="playing = !playing">
          {{ playing ? t('hidePreview') : t('previewBtn') }}
        </button>
        <a class="btn btn-small btn-primary-soft" :href="downloadUrl" rel="noopener">
          {{ t('downloadBtn') }}
        </a>
        <button class="btn btn-small btn-ghost" :class="{ copied }" @click="copyLink">
          {{ copied ? t('copied') : t('copyBtn') }}
        </button>
        <a class="btn btn-small btn-ghost" :href="video.url" target="_blank" rel="noopener noreferrer">
          {{ t('openBtn') }}
        </a>
      </div>
    </div>
  </div>
</template>
