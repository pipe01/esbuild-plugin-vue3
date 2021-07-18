<template lang="pug">
h1 Hello world
Button
</template>

<script lang="ts">
import { defineComponent } from "vue";

import Button from "./MyButton.vue";

export default defineComponent({
    components: {
        Button
    },
    setup() {
        return {
            nice: "asd"
        }
    }
})
</script>

<style scoped lang="sass">
@import "./style"

h1
    color: $my-color
</style>
