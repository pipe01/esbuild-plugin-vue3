"use strict";

const esbuild = require("esbuild");

/**
 * @type import("esbuild").Plugin
 */
const vuePlugin = {
    name: "vue",
    setup(build) {
        const path = require('path');
        const fs = require('fs');
        const sfc = require('@vue/compiler-sfc');
        const pug = require("pug");
        const sass = require("sass");

        let idCounter = 1000;

        // Resolve main ".vue" import
        build.onResolve({ filter: /\.vue$/ }, async (args) => {
            return {
                path: path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path),
                namespace: "vue-sfc"
            }
        });

        // Resolve script import from stub
        build.onResolve({ filter: /\.vue._script$/ }, async (args) => {
            return {
                path: args.importer,
                namespace: "sfc-script",
                pluginData: args.pluginData
            }
        });

        // Resolve template import from stub
        build.onResolve({ filter: /\.vue._tmpl$/ }, async (args) => {
            return {
                path: args.importer,
                namespace: "sfc-template",
                pluginData: args.pluginData
            }
        });

        // Resolve style import from stub
        build.onResolve({ filter: /\.vue._style\d+$/ }, async (args) => {
            return {
                path: args.path,
                namespace: "sfc-style",
                pluginData: args.pluginData
            }
        });

        // Load stub when .vue is requested
        build.onLoad({ filter: /\.vue$/, namespace: "vue-sfc" }, async args => {
            const encPath = args.path.replace(/\\/g, "\\\\");

            const source = await fs.promises.readFile(args.path, 'utf8');
            const filename = path.relative(process.cwd(), args.path);
            
            const { descriptor } = sfc.parse(source, {
                filename
            });

            const id = "data-v-" + idCounter++;
            let code = "";

            if (descriptor.script || descriptor.scriptSetup) {
                code += `import script from "${encPath}._script";`
            } else {
                code += "let script = {};"
            }

            for (const style in descriptor.styles) {
                code += `import "${encPath}._style${style}";`
            }

            code += `import { render } from "${encPath}._tmpl"; script.render = render;`

            code += `script.__file = ${JSON.stringify(filename)}; script.__scopeId = ${JSON.stringify(id)};`;
            code += "export default script;";

            return {
                contents: code,
                resolveDir: path.dirname(args.path),
                pluginData: { descriptor, id },
                watchFiles: [ args.path ]
            }
        })

        build.onLoad({ filter: /.*/, namespace: "sfc-script" }, async (args) => {
            const { descriptor, id } = args.pluginData;

            if (descriptor.script || descriptor.scriptSetup) {
                const script = sfc.compileScript(descriptor, { id });
                let code = script.content;

                if (script.lang === "ts") {
                    const result = await esbuild.transform(code, {
                        loader: "ts"
                    });

                    code = result.code;
                }

                return {
                    contents: code,
                    loader: "js",
                    resolveDir: path.dirname(args.path),
                }
            }
        })

        build.onLoad({ filter: /.*/, namespace: "sfc-template" }, async (args) => {
            const { descriptor, id } = args.pluginData;
            let source = descriptor.template.content;

            if (descriptor.template.lang === "pug") {
                source = pug.render(descriptor.template.content);
            }

            const template = sfc.compileTemplate({
                id,
                source,
                filename: args.path,
                scoped: descriptor.styles.some(o => o.scoped)
            });

            return {
                contents: template.code,
                loader: "js",
                resolveDir: path.dirname(args.path),
            }
        })

        build.onLoad({ filter: /.*/, namespace: "sfc-style" }, async (args) => {
            const styleIndex = /(?<=\._style)\d+$/.exec(args.path);
            if (!styleIndex) {
                throw new Error("invalid style path");
            }
            const index = Number(styleIndex[0]);

            const { descriptor, id } = args.pluginData;

            /**
             * @type import("@vue/compiler-sfc").SFCStyleBlock
             */
            const style = descriptor.styles[index];
            let source = style.content;
            let includedFiles = [];

            if (style.lang === "sass" || style.lang === "scss") {
                /** @type import("sass").Result */
                const result = await new Promise((resolve, reject) => sass.render({
                    data: source,
                    indentedSyntax: style.lang === "sass",
                    includePaths: [
                        path.dirname(args.path)
                    ]
                }, (ex, res) => ex ? reject(ex) : resolve(res)));

                includedFiles = result.stats.includedFiles;
                source = result.css;
            }

            const template = await sfc.compileStyleAsync({
                id,
                source,
                scoped: style.scoped,
            });

            return {
                contents: template.code,
                loader: "css",
                resolveDir: path.dirname(args.path),
                watchFiles: includedFiles
            }
        })
    }
};

/**
 * @type import("esbuild").BuildOptions
 */
const buildOpts = {
    entryPoints: ['src/app.ts'],
    bundle: true,
    outfile: 'dist/out.js',
    plugins: [vuePlugin],
    target: "es2015",
    minify: true,
    define: {
        "__VUE_OPTIONS_API__ ": true,
        "__VUE_PROD_DEVTOOLS__": false
    }
}

if (process.argv.includes("--serve")) {
    esbuild.serve({
        servedir: "dist",
        port: 8080
    }, buildOpts)
    
    console.log("Serving on http://localhost:8080");
} else {
    if (process.argv.includes("-w")) {
        buildOpts.watch = true;
        console.log("Watching for changes");
    }

    esbuild.build(buildOpts).catch(() => process.exit(1));
}
