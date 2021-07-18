<template>
<h1>Hello world</h1>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
    setup() {
        return {
            nice: "asd"
        }
    }
})
</script>

<style scoped>
h1 {
    color: red;
}
</style>