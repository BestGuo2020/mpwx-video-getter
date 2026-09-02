<script setup>
import { computed } from 'vue';
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
    <h2>{{ t('guideTitle') }}</h2>
    <div class="guide-grid">
      <div v-for="(s, i) in steps" :key="i" class="guide-card">
        <div class="guide-img">
          <img :src="s.img" :alt="s.title" loading="lazy" />
        </div>
        <div class="guide-body">
          <span class="guide-step" aria-hidden="true">{{ i + 1 }}</span>
          <h3>{{ s.title }}</h3>
          <p>{{ s.desc }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
