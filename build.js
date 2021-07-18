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

        let css = "";

        // Resolve main ".vue" import
        build.onResolve({ filter: /\.vue$/ }, async (args) => {
            return {
                path: path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path),
                namespace: "vue-sfc"
            }
        });

        // Resolve script import from stub
        build.onResolve({ filter: /\.vue.js$/ }, async (args) => {
            return {
                path: args.importer,
                namespace: "sfc-script",
            }
        });

        // Load stub when .vue is requested
        build.onLoad({ filter: /\.vue$/, namespace: "vue-sfc" }, async args => {
            console.log("load script", args.path);
            const encPath = args.path.replace(/\\/g, "\\\\");
            
            return {
                contents: `import script from "${encPath}.js";`,
                resolveDir: path.dirname(args.path),
            }
        })

        build.onLoad({ filter: /.*/, namespace: "sfc-script" }, async (args) => {
            console.log("load vue", args.path);

            const source = await fs.promises.readFile(args.path, 'utf8')
            const filename = path.relative(process.cwd(), args.path)

            const { descriptor } = sfc.parse(source, {
                filename
            });

            let all = "";

            if (descriptor.template.lang === "pug") {
                const result = pug.render(descriptor.template.content);

                descriptor.template.content = result.replace(/(#.*?|v-else)="\1"/g, "$1");
            }

            const id = "data-v-asdasd";

            const template = sfc.compileTemplate({
                id,
                source: descriptor.template.content,
                filename: args.path
            });

            if (template.errors && template.errors.length > 0) {
                return {
                    errors: template.errors.map(o => typeof o === "string" ? { text: o } : {
                        text: o.message,
                        location: o.loc && {
                            lineText: o.loc.source
                        }
                    })
                }
            }

            all += template.code;

            if (descriptor.script || descriptor.scriptSetup) {
                const script = sfc.compileScript(descriptor, { id });
                let code = script.content;

                code = sfc.rewriteDefault(code, "__def");

                if (script.lang === "ts") {
                    const result = await esbuild.transform(code, {
                        loader: "ts"
                    });

                    code = result.code;
                }

                all += code + `__def.render = render;__def.__file = ${JSON.stringify(filename)};__def.__scopeId = "${id}";export default __def;`;
            } else {
                all += "export default {}";
            }

            // for (const style of descriptor.styles) {
            //     const result = await sfc.compileStyleAsync({
            //         id,
            //         source: style.content,
            //         scoped: style.scoped,
            //     });

            //     css += result.code;

            //     // console.log(a.toString());
            //     // all += compiled.code;
            // }

            return {
                contents: all,
                loader: "js",
                resolveDir: path.dirname(args.path),
            }
        })
    }
};

esbuild.build({
    entryPoints: ['src/app.ts'],
    bundle: true,
    outfile: 'dist/out.js',
    plugins: [vuePlugin],
    target: "es2015",
    // define: {
    //     "process.env.NODE_ENV": JSON.stringify("development"),
    // },
}).catch(() => process.exit(1));