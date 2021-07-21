import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from 'fs';
import * as crypto from "crypto";

import * as sfc from '@vue/compiler-sfc';

import { loadRules, replaceRules } from "./paths";
import { fileExists, getFullPath, getUrlParams, tryAsync } from "./utils"
import { Options } from "./options";
import { generateIndexHTML } from "./html";
import randomBytes from "./random";

const vuePlugin = (opts: Options = {}) => <esbuild.Plugin>{
    name: "vue",
    async setup({ initialOptions: buildOpts, ...build }) {
        buildOpts.define = {
            ...buildOpts.define,
            "__VUE_OPTIONS_API__": opts.enableOptionsApi ? "true" : "false",
            "__VUE_PROD_DEVTOOLS__": opts.enableDevTools ? "true" : "false"
        }

        if (opts.generateHTML && !buildOpts.metafile) {
            buildOpts.metafile = true;
        }

        await loadRules();

        if (typeof opts.randomIdSeed !== "string") {
            throw new Error("The randomIdSeed option's value must be string");
        }

        const random = randomBytes(opts.randomIdSeed);

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

            const id = "data-v-" + random(4).toString("hex");
            let code = "";

            if (descriptor.script || descriptor.scriptSetup) {
                code += `import script from "${encPath}?type=script";`
            } else {
                code += "const script = {};"
            }

            for (const style in descriptor.styles) {
                code += `import "${encPath}?type=style&index=${style}";`
            }

            const renderFuncName = opts.renderSSR ? "ssrRender" : "render";

            code += `import { ${renderFuncName} } from "${encPath}?type=template"; script.${renderFuncName} = ${renderFuncName};`

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
            const { descriptor, id } = args.pluginData as { descriptor: sfc.SFCDescriptor, id: string };

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
            const { descriptor, id } = args.pluginData as { descriptor: sfc.SFCDescriptor, id: string };
            if (!descriptor.template) {
                throw new Error("Missing template");
            }
            
            let source = descriptor.template.content;

            if (descriptor.template.lang === "pug") {
                const pug = await tryAsync(() => import("pug"), "pug", "Pug template rendering")
                source = pug.render(descriptor.template.content);

                // Fix #default="#default" and v-else="v-else"
                source = source.replace(/(\B#.*?|\bv-.*?)="\1"/g, "$1");
            }

            const result = sfc.compileTemplate({
                id,
                source,
                filename: args.path,
                scoped: descriptor.styles.some(o => o.scoped),
                slotted: descriptor.slotted,
                ssr: opts.renderSSR,
                ssrCssVars: [],
                isProd: (process.env.NODE_ENV === "production") || buildOpts.minify,
                compilerOptions: {
                    comments: false,
                    whitespace: "condense"
                }
            });

            if (result.errors.length > 0) {
                return {
                    errors: result.errors.map<esbuild.PartialMessage>(o => typeof o === "string" ? { text: o } : {
                        text: o.message,
                        location: o.loc && {
                            column: o.loc.start.column,
                            file: descriptor.filename,
                            line: o.loc.start.line + descriptor.template!.loc.start.line + 1,
                            lineText: o.loc.source
                        }
                    })
                }
            }

            return {
                contents: result.code,
                warnings: result.tips.map(o => ({ text: o })),
                loader: "js",
                resolveDir: path.dirname(args.path),
            }
        })

        build.onLoad({ filter: /.*/, namespace: "sfc-style" }, async (args) => {
            const { descriptor, index, id } = args.pluginData as { descriptor: sfc.SFCDescriptor, index: number, id: string };

            const style: import("@vue/compiler-sfc").SFCStyleBlock = descriptor.styles[index];
            let includedFiles: string[] = [];

            const result = await sfc.compileStyleAsync({
                filename: args.path,
                id,
                source: style.content,
                preprocessLang: style.lang as any,
                preprocessOptions: {
                    includePaths: [
                        path.dirname(args.path)
                    ],
                    importer: [
                        (url: string) => {
                            const modulePath = path.join(process.cwd(), "node_modules", url);

                            if (fs.existsSync(modulePath)) {
                                return { file: modulePath }
                            }

                            return null
                        },
                        (url: string) => ({ file: replaceRules(url) })
                    ]
                },
                scoped: style.scoped,
            });

            if (result.errors.length > 0) {
                const errors = result.errors as (Error & { column: number; line: number; file: string })[];

                return {
                    errors: errors.map(o => ({
                        text: o.message,
                        location: {
                            column: o.column,
                            line: o.file === args.path ? style.loc.start.line + o.line - 1 : o.line,
                            file: o.file.replace(/\?.*?$/, ""),
                            namespace: "file"
                        }
                    }))
                }
            }

            return {
                contents: result.code,
                loader: "css",
                resolveDir: path.dirname(args.path),
                watchFiles: includedFiles
            }
        })

        build.onEnd(async result => {
            if (opts?.generateHTML && result.errors.length == 0) {
                if (typeof opts.generateHTML === "string") {
                    opts.generateHTML = {
                        sourceFile: opts.generateHTML
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

                await generateIndexHTML(result, opts.generateHTML, buildOpts.minify ?? false);
            }
        })
    }
};

export = vuePlugin