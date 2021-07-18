<template>
<h1>This is green</h1>
<button @click="count++">Count is {{count}}</button>
</template>

<script lang="ts">
import { defineComponent, ref } from "vue"

export default defineComponent({
    setup() {
        return {
            count: ref(0)
        }
    }
})
</script>

<style scoped>
h1 {
    color: green;
}
</style>