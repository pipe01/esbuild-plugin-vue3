<template>
  <div>
    <span>{{ id }} - {{ label }} [{{ priority }}]</span>
    <p v-if="description">{{ description }}</p>
  </div>
</template>

<script setup lang="ts">
import type { DerivedProps } from '@/types/derived';

defineProps<DerivedProps>();
</script>
