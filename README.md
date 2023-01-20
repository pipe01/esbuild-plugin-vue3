# esbuild-plugin-vue3

[![npm version](https://badge.fury.io/js/esbuild-plugin-vue3.svg)](https://badge.fury.io/js/esbuild-plugin-vue3)

[esbuild](https://esbuild.github.io/) plugin for resolving and loading Vue.js 3 SFCs.
This plugin is meant to mimick the default [Vue CLI](https://cli.vuejs.org/) behaviour, for example it supports path aliases defined in the tsconfig.json file.

## Install:

```
npm i -D esbuild-plugin-vue3
```

## Supported
* HTML and Pug `<template>`
* JavaScript and TypeScript `<script>` and `<script setup>` (the latter is still experimental)
* CSS, SCSS and SASS `<style>`
* Path aliases from tsconfig.json, e.g. `import "@/Component.vue"` resolves to `import "../../Component.vue`
* Emit HTML file and inject output CSS and JS files

## Usage

Simple usage, this will resolve all `.vue` imports and load its parts independently. By default path aliases will be loaded from the tsconfig.json file, if any.

```js
const vuePlugin = require("esbuild-plugin-vue3")

esbuild.build({
    entryPoints: ["src/app.ts"],
    bundle: true,
    outfile: "dist/app.js",
    plugins: [vuePlugin()]
})
```

More advanced usage, generating HTML file:

```js
const vuePlugin = require("esbuild-plugin-vue3")

esbuild.build({
    entryPoints: ["src/app.ts"],
    bundle: true,
    outfile: "dist/app.js",
    entryNames: '[dir]/[name]-[hash]',
    metafile: true,
    plugins: [vuePlugin({
        generateHTML: "src/index.html"
        // Or:
        generateHTML: {
            sourceFile: "src/index.html",
            pathPrefix: "assets/",
            preload: [{ href: "https://example.com/my-external.css", as: "stylesheet" }]
        }
    })]
})
```

### The library is still not thoroughly tested, use at your own risk.
