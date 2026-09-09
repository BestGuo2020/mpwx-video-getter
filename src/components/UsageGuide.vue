<script setup>
import { computed } from 'vue';
import { NGrid, NGi, NCard, NH2, NText, NAvatar } from 'naive-ui';
import { i18n } from '../i18n.js';
import step1 from '../assets/step1-article.png';
import step2 from '../assets/step2-input.png';
import step3 from '../assets/step3-results.png';

const t = (key) => i18n.t(key);

const steps = computed(() => [
  { img: step1, title: t('step1Title'), desc: t('step1Desc') },
  { img: step2, title: t('step2Title'), desc: t('step2Desc') },
  { img: step3, title: t('step3Title'), desc: t('step3Desc') },
]);
</script>

<template>
  <section class="guide">
    <n-h2 class="section-title">{{ t('guideTitle') }}</n-h2>
    <n-grid cols="1 s:3" responsive="screen" x-gap="16" y-gap="16">
      <n-gi v-for="(s, i) in steps" :key="i">
        <n-card class="guide-card" :bordered="false" content-style="padding: 14px 16px 16px;">
          <template #cover>
            <div class="guide-img">
              <img :src="s.img" :alt="s.title" loading="lazy" />
            </div>
          </template>
          <n-avatar
            round
            :size="22"
            color="#07C160"
            class="guide-step"
            aria-hidden="true"
          >
            {{ i + 1 }}
          </n-avatar>
          <n-text tag="h3" strong class="guide-title">{{ s.title }}</n-text>
          <n-text depth="3" tag="p" class="guide-desc">{{ s.desc }}</n-text>
        </n-card>
      </n-gi>
    </n-grid>
  </section>
</template>
