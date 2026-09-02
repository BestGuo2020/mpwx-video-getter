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
const selectedIdx = ref(0);

// 清晰度清单：后端按「清晰度优先、同档标准编码优先」排序，默认取第一个（最高清晰度）
const sources = computed(() =>
  props.video.sources?.length
    ? props.video.sources
    : [{ url: props.video.url, label: '默认', width: 0, height: 0, filesize: 0 }]
);

const current = computed(() => sources.value[selectedIdx.value] || sources.value[0]);

function sourceLabel(s) {
  const parts = [s.label];
  if (s.width && s.height) parts.push(`${s.width}×${s.height}`);
  if (s.filesize) parts.push(`${(s.filesize / 1048576).toFixed(0)}MB`);
  return parts.join(' · ');
}

// 预览/下载都走本站 /api/media 中转：服务端带微信 Referer 抓取，
// 绕过 mpvideo CDN 对跨站直连的 403 防盗链。
const mediaUrl = computed(() => {
  const p = new URLSearchParams({ u: current.value.url });
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
      <div v-if="sources.length > 1" class="quality-row">
        <label class="quality-label">{{ t('qualityLabel') }}</label>
        <select v-model.number="selectedIdx" class="quality-select">
          <option v-for="(s, i) in sources" :key="i" :value="i">{{ sourceLabel(s) }}</option>
        </select>
      </div>
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
