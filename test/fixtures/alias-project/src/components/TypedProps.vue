<template>
  <div>
    <span>{{ id }} - {{ label }}</span>
    <p v-if="description">{{ description }}</p>
  </div>
</template>

<script setup lang="ts">
import type { ExtendedProps } from '@/types/props';

defineProps<ExtendedProps>();
</script>
