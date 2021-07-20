import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from 'fs';
import * as crypto from "crypto";

import * as sfc from '@vue/compiler-sfc';
import * as pug from "pug";
import * as sass from "sass";

import { loadRules, replaceRules } from "./paths";
import { fileExists, getFullPath, getUrlParams } from "./utils"
import { Options } from "./options";
import { generateIndexHTML } from "./html";

const vuePlugin = (opts: Options = {}) => <esbuild.Plugin>{
    name: "vue",
    async setup({ initialOptions: buildOpts, ...build }) {
        buildOpts.define = {
            ...buildOpts.define,
            "__VUE_OPTIONS_API__": opts.enableOptionsApi ? "true" : "false",
            "__VUE_PROD_DEVTOOLS__": opts.enableDevTools ? "true" : "false"
        }

        await loadRules();

        if (!opts.disableResolving) {
            build.onResolve({ filter: /.*/ }, async args => {
                const aliased = replaceRules(args.path);
                const fullPath = path.isAbsolute(aliased) ? aliased : path.join(process.cwd(), aliased);

                if (!await fileExists(fullPath)) {
                    const possible = [
                        ".ts",
                        "/index.ts",
                        ".js",
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
                } else {
                    return {
                        path: path.normalize(fullPath),
                        namespace: "file"
                    }
                }
            })
        }

        // Resolve main ".vue" import
        build.onResolve({ filter: /\.vue/ }, async (args) => {
            const params = getUrlParams(args.path);

            return {
                path: getFullPath(args),
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

            const id = "data-v-" + crypto.randomBytes(4).toString("hex");
            let code = "";

            if (descriptor.script || descriptor.scriptSetup) {
                code += `import script from "${encPath}?type=script";`
            } else {
                code += "const script = {};"
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

                if (buildOpts.sourcemap && script.map) {
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
                source = source.replace(/(\B#.*?|\bv-.*?)="\1"/g, "$1");
            }

            const template = sfc.compileTemplate({
                id,
                source,
                filename: args.path,
                scoped: descriptor.styles.some((o: any) => o.scoped)
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
            let includedFiles: string[] = [];

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
                        url => ({ file: replaceRules(url) })
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

        build.onEnd(result => {
            if (opts?.generateHTML && result.errors.length == 0) {
                if (typeof opts.generateHTML === "string") {
                    opts.generateHTML = {
                        originalFile: opts.generateHTML
                    }
                }

                const outDir = buildOpts.outdir
                    ? buildOpts.outdir
                    : buildOpts.outfile
                    ? path.dirname(buildOpts.outfile)
                    : undefined;
                
                opts.generateHTML.trimPath ??= outDir;
                opts.generateHTML.pathPrefix ??= "/";
                opts.generateHTML.outFile ??= outDir && path.join(outDir, "index.html");

                generateIndexHTML(result, opts.generateHTML, buildOpts.minify ?? false);
            }
        })
    }
};

export = vuePlugin