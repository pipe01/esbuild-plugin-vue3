import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from 'fs';
import * as crypto from "crypto";

import ts from "typescript";

import * as sfc from '@vue/compiler-sfc';
import * as core from '@vue/compiler-core';

import { loadRules, replaceRules } from "./paths";
import { AsyncCache, fileExists, getFullPath, getUrlParams, tryAsync } from "./utils"
import { Options } from "./options";
import { generateIndexHTML } from "./html";
import randomBytes from "./random";

type PluginData = {
    descriptor: sfc.SFCDescriptor;
    id: string;
    script?: sfc.SFCScriptBlock;
}

const vuePlugin = (opts: Options = {}) => <esbuild.Plugin>{
    name: "vue",
    async setup({ initialOptions: buildOpts, ...build }) {
        buildOpts.define = {
            ...buildOpts.define,
            "__VUE_OPTIONS_API__": opts.disableOptionsApi ? "false" : "true",
            "__VUE_PROD_DEVTOOLS__": opts.enableDevTools ? "true" : "false",
            "__VUE_PROD_HYDRATION_MISMATCH_DETAILS__": opts.enableHydrationMismatchDetails ? "true" : "false",
        }

        if (opts.generateHTML && !buildOpts.metafile) {
            buildOpts.metafile = true;
        }

        if (opts.disableResolving) {
            opts.pathAliases = false;
            build.onStart(() => ({warnings: [{text: "The disableResolving option is deprecated, use pathAliases instead"}]}));
        }

        const generatedCSS: string[] = [];

        const mustReplace = await loadRules(opts, buildOpts.tsconfig ?? "tsconfig.json");

        const random = randomBytes(typeof opts.scopeId === "object" && typeof opts.scopeId.random === "string" ? opts.scopeId.random : undefined);

        const cache = new AsyncCache(!opts.disableCache);

        const transforms: Record<string, core.DirectiveTransform> = {};
        if (opts.directiveTransforms) {
            for (const name in opts.directiveTransforms) {
                if (Object.prototype.hasOwnProperty.call(opts.directiveTransforms, name)) {
                    const propName = opts.directiveTransforms[name];

                    const transformation = (dir: core.DirectiveNode, name: string) => <core.Property>{
                        key: core.createSimpleExpression(JSON.stringify(name), false),
                        value: dir.exp ?? core.createSimpleExpression("void 0", false),
                        loc: dir.loc,
                        type: 16
                    }

                    if (typeof propName === "function") {
                        transforms[name] = (...args) => {
                            const ret = propName(args[0], args[1], args[2]);

                            return {
                                props: ret === undefined ? [] : [transformation(args[0], ret)]
                            }
                        }
                    } else {
                        transforms[name] = dir => ({
                            props: propName === false ? [] : [transformation(dir, propName)]
                        })
                    }
                }
            }
        }

        if (mustReplace) {
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
        build.onLoad({ filter: /\.vue$/ }, (args) => cache.get([args.path, args.namespace], async () => {
            const encPath = args.path.replace(/\\/g, "\\\\");

            const source = await fs.promises.readFile(args.path, 'utf8');
            const filename = path.relative(process.cwd(), args.path);
            
            const id = !opts.scopeId || opts.scopeId === "hash"
                ? crypto.createHash("md5").update(filename).digest().toString("hex").substring(0, 8)
                : random(4).toString("hex");

            const { descriptor } = sfc.parse(source, {
                filename
            });
            const script = (descriptor.script || descriptor.scriptSetup) ? sfc.compileScript(descriptor, { id, fs: ts.sys }) : undefined;

            const dataId = "data-v-" + id;
            let code = "";

            if (descriptor.script || descriptor.scriptSetup) {
                const src = (descriptor.script && !descriptor.scriptSetup && descriptor.script.src) || encPath;
                code += `import script from "${src}?type=script";`;
            } else {
                code += "const script = {};";
            }

            for (const style in descriptor.styles) {
                code += `import "${encPath}?type=style&index=${style}";`;
            }

            const renderFuncName = opts.renderSSR ? "ssrRender" : "render";


            descriptor.template && (code += `import { ${renderFuncName} } from "${encPath}?type=template"; script.${renderFuncName} = ${renderFuncName};`)

            code += `script.__file = ${JSON.stringify(filename)};`;
            if (descriptor.styles.some(o => o.scoped)) {
                code += `script.__scopeId = ${JSON.stringify(dataId)};`;
            }
            if (opts.renderSSR) {
                code += "script.__ssrInlineRender = true;";
            }
            
            code += "export default script;";

            return {
                contents: code,
                resolveDir: path.dirname(args.path),
                pluginData: { descriptor, id: dataId, script } as PluginData,
                watchFiles: [ args.path ]
            }
        }));

        build.onLoad({ filter: /.*/, namespace: "sfc-script" }, (args) => cache.get([args.path, args.namespace], async () => {
            const { script } = args.pluginData as PluginData;

            if (script) {
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
        }));

        build.onLoad({ filter: /.*/, namespace: "sfc-template" }, (args) => cache.get([args.path, args.namespace], async () => {
            const { descriptor, id, script } = args.pluginData as PluginData;
            if (!descriptor.template) {
                return {
                    loader: 'js',
                    contents: ''
                }
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
                    inSSR: opts.renderSSR,
                    directiveTransforms: transforms,
                    bindingMetadata: script?.bindings,
                    ...opts.compilerOptions
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
                loader: "ts",
                resolveDir: path.dirname(args.path),
            }
        }));

        build.onLoad({ filter: /.*/, namespace: "sfc-style" }, (args) => cache.get([args.path, args.namespace], async () => {
            const { descriptor, index, id } = args.pluginData as PluginData & { index: number };

            const style: import("@vue/compiler-sfc").SFCStyleBlock = descriptor.styles[index];
            let includedFiles: string[] = [];

            const result = await sfc.compileStyleAsync({
                filename: args.path,
                id,
                source: style.content,
                postcssOptions: opts.postcss?.options,
                postcssPlugins: opts.postcss?.plugins,
                preprocessLang: style.lang as any,
                preprocessOptions: Object.assign({
                    includePaths: [
                        path.dirname(args.path)
                    ],
                    importer: [
                        (url: string) => {
                            const projectRoot = process.env.npm_config_local_prefix || process.cwd()
                            const modulePath = path.join(projectRoot, "node_modules", url);

                            if (fs.existsSync(modulePath)) {
                                return { file: modulePath }
                            }

                            return null
                        },
                        (url: string) => ({ file: replaceRules(url) })
                    ]
                }, opts.preprocessorOptions),
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

            if (opts.cssInline) {
                if (opts.generateHTML) {
                    generatedCSS.push(result.code);

                    // If we are generating HTML all styles will be added to it when building ends,
                    // so return an empty file here.
                    return {
                        contents: "",
                        loader: "js"
                    }
                }
                
                const cssText =  result.code;
                const contents = `
                {
                    const el = document.createElement("style");
                    el.textContent = ${JSON.stringify(cssText)};
                    document.head.append(el);
                }`;
                return {
                    contents,
                    loader: "js",
                    resolveDir: path.dirname(args.path),
                    watchFiles: includedFiles
                };
            }

            return {
                contents: result.code,
                loader: "css",
                resolveDir: path.dirname(args.path),
                watchFiles: includedFiles
            }
        }));

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

                await generateIndexHTML(result, opts.generateHTML, buildOpts.minify ?? false, opts.cssInline ? generatedCSS : undefined);
            }
        });
    }
};

export = vuePlugin
