# esbuild-plugin-vue3

[![npm version](https://badge.fury.io/js/esbuild-plugin-vue3.svg)](https://badge.fury.io/js/esbuild-plugin-vue3)

[esbuild](https://esbuild.github.io/) plugin for resolving and loading Vue.js 3 SFCs.
This plugin is meant to mimick the default [Vue CLI](https://cli.vuejs.org/) behaviour, for example it supports path aliases defined in the tsconfig.json file.

## Install:

```
npm i esbuild-plugin-vue3
```

## Supported
* HTML and Pug `<template>`
* JavaScript and TypeScript `<script>` and `<script setup>` (the latter is still experimental)
* CSS, SCSS and SASS `<style>`
* Path aliases from tsconfig.json, e.g. `import "@/Component.vue"` resolves to `import "../../Component.vue`
* Emit HTML file and inject output CSS and JS files

### The library is still not thoroughly tested, use at your own risk.
