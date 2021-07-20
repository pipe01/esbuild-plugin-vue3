import { BuildResult } from "esbuild";
import * as fs from "fs";
import * as path from "path";

export type IndexOptions = {
    /**
     * Path to the original HTML file that will be modified.
     */
    originalFile: string;
    
    /**
     * Path where the modified HTML file will be written to. By default this is an index.html file in the outdir or next to the outfile.
     */
    outFile?: string;
    /**
     * Prefix to prepend to all paths.
     */
    pathPrefix?: string;
    /**
     * String or regex to remove from all paths, for example to remove a base dir: /^dist\//
     * 
     * By default this is inferred from the build options' outfile or outdir.
     */
    trimPath?: string | RegExp;
    /**
     * Add <link rel="preload"> elements to the head.
     */
    preload?: {
        href: string;
        as: string;

        /**
         * Set link rel to prefetch instead of preload.
         */
        prefetch?: boolean;
    }[];

    /**
     * When minifying, these options will be passed to html-minifier.
     */
    minifyOptions?: import("html-minifier").Options;
}

export async function generateIndexHTML(result: BuildResult, opts: IndexOptions, min: boolean) {
    if (!result.metafile) {
        throw new Error("The \"metafile\" option must be set to true in the build options");
    }
    if (!opts.outFile) {
        throw new Error("No outFile was specified and it could not be inferred from the build options");
    }
    
    const cheerio = await import("cheerio");

    const $ = cheerio.load(await fs.promises.readFile(opts.originalFile));

    if (opts.preload) {
        for (const item of opts.preload) {
            const link = $("<link>")
            link.attr("rel", item.prefetch ? "prefetch" : "preload");
            link.attr("href", item.href);
            link.attr("as", item.as);
            link.insertAfter($("head :last-child"))
        }
    }

    for (let name in result.metafile.outputs) {
        if (opts.trimPath) {
            name = name.replace(opts.trimPath, "");
        }

        if (opts.pathPrefix && !name.startsWith(opts.pathPrefix)) {
            name = opts.pathPrefix + name;
        }

        const ext = path.extname(name);

        if (ext === ".js") {
            const script = $("<script>");
            script.attr("src", name);
            script.insertAfter($("body :last-child"));
        } else if (ext === ".css") {
            const link = $("<link rel='stylesheet'>")
            link.attr("href", name);
            link.insertAfter($("head :last-child"))
        }
    }

    let html = $.html();

    if (min) {
        const { minify } = await import("html-minifier")
        
        html = minify(html, {
            collapseWhitespace: true,
            minifyCSS: true,
            removeComments: true,

            ...opts.minifyOptions,
        });
    }

    await fs.promises.writeFile(opts.outFile, html);
}
