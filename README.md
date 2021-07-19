# esbuild-plugin-vue3

[esbuild](https://esbuild.github.io/) plugin for resolving and loading Vue.js 3 SFCs.
This plugin is meant to mimick the default [Vue CLI](https://cli.vuejs.org/) behaviour, for example it supports path aliases defined in the tsconfig.json file.

## Supported
* HTML and Pug `<template>`
* JavaScript and TypeScript `<script>` and `<script setup>` (the latter is still experimental)
* CSS, SCSS and SASS `<style>`
* Path aliases from tsconfig.json, e.g. `import "@/Component.vue"` resolves to `import "../../Component.vue`

### The library is still not thoroughly tested, use at your own risk.
