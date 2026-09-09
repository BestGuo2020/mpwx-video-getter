<script setup>
import { ref, computed } from 'vue';
import { NButton, NSelect, NSpace, NText, NIcon, useMessage } from 'naive-ui';
import {
  Play,
  PlayOutline,
  EyeOffOutline,
  DownloadOutline,
  CopyOutline,
  CheckmarkOutline,
  OpenOutline,
} from '@vicons/ionicons5';
import { i18n } from '../i18n.js';
import { proxyMediaUrl } from '../api.js';

const props = defineProps({
  video: { type: Object, required: true },
  articleUrl: { type: String, default: '' },
});

const t = (key, params) => i18n.t(key, params);

const message = useMessage();

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

const sourceOptions = computed(() =>
  sources.value.map((s, i) => ({ label: sourceLabel(s), value: i }))
);

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
    message.success(t('copied'));
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    window.prompt(t('copyManual'), props.video.url);
  }
}
</script>

<template>
  <div class="video-item">
    <div class="video-media" @click="playing = !playing">
      <video
        v-if="playing"
        :src="mediaUrl"
        controls
        autoplay
        :poster="proxyMediaUrl(video.cover)"
      ></video>
      <template v-else>
        <img :src="proxyMediaUrl(video.cover)" alt="" loading="lazy" />
        <span class="play-ov" aria-hidden="true">
          <n-icon :size="36" color="#fff" :component="Play" />
        </span>
      </template>
    </div>
    <div class="video-info">
      <n-text depth="3" class="video-vid">{{ video.vid || 'mpvideo' }}</n-text>
      <div v-if="sources.length > 1" class="quality-row">
        <n-text depth="3" class="quality-label">{{ t('qualityLabel') }}</n-text>
        <n-select
          v-model:value="selectedIdx"
          class="quality-select"
          size="small"
          :options="sourceOptions"
          :consistent-menu-width="false"
        />
      </div>
      <n-space :size="8" wrap>
        <n-button size="small" secondary @click="playing = !playing">
          <template #icon>
            <n-icon :component="playing ? EyeOffOutline : PlayOutline" />
          </template>
          {{ playing ? t('hidePreview') : t('previewBtn') }}
        </n-button>
        <n-button size="small" type="primary" tag="a" :href="downloadUrl" rel="noopener">
          <template #icon>
            <n-icon :component="DownloadOutline" />
          </template>
          {{ t('downloadBtn') }}
        </n-button>
        <n-button
          size="small"
          :type="copied ? 'success' : 'default'"
          secondary
          @click="copyLink"
        >
          <template #icon>
            <n-icon :component="copied ? CheckmarkOutline : CopyOutline" />
          </template>
          {{ copied ? t('copied') : t('copyBtn') }}
        </n-button>
        <n-button
          size="small"
          secondary
          tag="a"
          :href="video.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          <template #icon>
            <n-icon :component="OpenOutline" />
          </template>
          {{ t('openBtn') }}
        </n-button>
      </n-space>
    </div>
  </div>
</template>
