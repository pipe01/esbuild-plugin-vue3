import esbuild from "esbuild";
import path from "path";
import fs from 'fs';

import { fileExists, getUrlParams } from "./utils"

const aliasPlugin: esbuild.Plugin = {
    name: "alias",
    setup(build) {
        build.onResolve({ filter: /.*/ }, async args => {
            const aliased = replacePrefix(args.path);
            const fullPath = path.isAbsolute(aliased) ? aliased : path.join(args.resolveDir, aliased);
            
            if (!await fileExists(fullPath)) {
                const possible = [
                    "/index.ts",
                    "/index.js",
                ]

                for (const postfix of possible) {
                    if (await fileExists(fullPath + postfix)) {
                        return {
                            path: path.normalize(fullPath + postfix),
                            namespace: "file"
                        }
                    }
                }
            } else if (aliased != args.path) {
                return {
                    path: path.normalize(aliased),
                    namespace: "file"
                }
            }
        })
    }
}

import sfc from '@vue/compiler-sfc';
import pug from "pug";
import sass from "sass";

const vuePlugin: esbuild.Plugin = {
    name: "vue",
    setup(build) {
        build.initialOptions.define = {
            ...build.initialOptions.define,
            "__VUE_OPTIONS_API__": "false",
            "__VUE_PROD_DEVTOOLS__": "false"
        }

        let idCounter = 1000;

        // Resolve main ".vue" import
        build.onResolve({ filter: /\.vue/ }, async (args) => {
            const params = getUrlParams(args.path);

            return {
                path: path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path),
                namespace:
                    params.type === "script" ? "sfc-script" :
                    params.type === "template" ? "sfc-template" :
                    params.type === "style" ? "sfc-style" : "file",
                pluginData: {
                    ...args.pluginData,
                    index: params.index
                }
            }
        });

        // Load stub when .vue is requested
        build.onLoad({ filter: /\.vue$/ }, async args => {
            const encPath = args.path.replace(/\\/g, "\\\\");

            const source = await fs.promises.readFile(args.path, 'utf8');
            const filename = path.relative(process.cwd(), args.path);
            
            const { descriptor } = sfc.parse(source, {
                filename
            });

            const id = "data-v-" + idCounter++;
            let code = "";

            if (descriptor.script || descriptor.scriptSetup) {
                code += `import script from "${encPath}?type=script";`
            } else {
                code += "let script = {};"
            }

            for (const style in descriptor.styles) {
                code += `import "${encPath}?type=style&index=${style}";`
            }

            code += `import { render } from "${encPath}?type=template"; script.render = render;`

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

                if (build.initialOptions.sourcemap && script.map) {
                    const sourceMap = Buffer.from(JSON.stringify(script.map)).toString("base64");
                    
                    code += "\n\n//@ sourceMappingURL=data:application/json;charset=utf-8;base64," + sourceMap;
                }

                return {
                    contents: code,
                    loader: script.lang === "ts" ? "ts" : "js",
                    resolveDir: path.dirname(args.path),
                }
            }
        })

        build.onLoad({ filter: /.*/, namespace: "sfc-template" }, async (args) => {
            const { descriptor, id } = args.pluginData;
            let source = descriptor.template.content;

            if (descriptor.template.lang === "pug") {
                source = pug.render(descriptor.template.content);

                // Fix #default="#default" and v-else="v-else"
                source = source.replace(/(#.*?|v-.*?)="\1"/g, "$1");
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
            const { descriptor, index, id } = args.pluginData;

            const style: import("@vue/compiler-sfc").SFCStyleBlock = descriptor.styles[index];
            let source = style.content;
            let includedFiles = [];

            if (style.lang === "sass" || style.lang === "scss") {
                const result: sass.Result = await new Promise((resolve, reject) => sass.render({
                    data: source,
                    indentedSyntax: style.lang === "sass",
                    includePaths: [
                        path.dirname(args.path)
                    ],
                    importer: [
                        url => {
                            const modulePath = path.join(process.cwd(), "node_modules", url);

                            if (fs.existsSync(modulePath)) {
                                return { file: modulePath }
                            }

                            return null
                        },
                        url => ({ file: replacePrefix(url) })
                    ]
                }, (ex, res) => ex ? reject(ex) : resolve(res)));

                includedFiles = result.stats.includedFiles;
                source = String(result.css);
            }

            const template = await sfc.compileStyleAsync({
                filename: args.path,
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

const buildOpts: esbuild.BuildOptions = {
    entryPoints: ['src/main-client.ts'],
    bundle: true,
    outfile: 'dist/out.js',
    plugins: [aliasPlugin, vuePlugin],
    target: "es2015",
    // platform: "node",
    sourcemap: true,
    // minify: true
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

    esbuild.build(buildOpts).catch(o => console.error(o))
}
