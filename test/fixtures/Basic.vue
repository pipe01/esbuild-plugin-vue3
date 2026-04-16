<template>
  <div class="hello">{{ msg }}</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'Basic',
  props: {
    msg: { type: String, default: 'Hello' }
  }
});
</script>

<style scoped>
.hello {
  color: red;
}
</style>
