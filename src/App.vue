<script setup>
import { computed } from 'vue';
import {
  NConfigProvider,
  NLoadingBarProvider,
  NMessageProvider,
  zhCN,
  enUS,
  dateZhCN,
  dateEnUS,
} from 'naive-ui';
import { i18n } from './i18n.js';
import { theme, themeOverrides } from './theme.js';
import HomePage from './HomePage.vue';

const locale = computed(() => (i18n.lang === 'zh' ? zhCN : enUS));
const dateLocale = computed(() => (i18n.lang === 'zh' ? dateZhCN : dateEnUS));
</script>

<template>
  <n-config-provider
    abstract
    :theme="theme"
    :theme-overrides="themeOverrides"
    :locale="locale"
    :date-locale="dateLocale"
  >
    <n-loading-bar-provider>
      <n-message-provider>
        <HomePage />
      </n-message-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>
