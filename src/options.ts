import { CompilerOptions, DirectiveNode, ElementNode, TransformContext } from "@vue/compiler-core";
import { IndexOptions } from "./html";

interface RawSourceMap {
    file?: string
    sourceRoot?: string
    version: string
    sources: string[]
    names: string[]
    sourcesContent?: string[]
    mappings: string
}

type PreprocessLang = 'less' | 'sass' | 'scss' | 'styl' | 'stylus'

export type Options = {
    /**
     * Disable Options API support. Disabling this will result in smaller bundles,
     * but may affect compatibility with 3rd party libraries if they rely on Options API.
     */
    disableOptionsApi?: boolean;

    /**
     * Enable devtools support in production builds.
     * This will result in more code included in the bundle, so it is recommended to only enable this for debugging purposes.
     */
    enableDevTools?: boolean;

    /**
     * Enable devtools support in production builds.
     * This will result in more code included in the bundle, so it is recommended to only enable this for debugging purposes.
     */
    enableHydrationMismatchDetails?: boolean;

    /**
     * If enabled, Vue will emit code for rendering SSR pages.
     */
    renderSSR?: boolean;
    
    /**
     * @deprecated Use pathAliases instead.
     */
    disableResolving?: boolean;

    /**
     * By default, the plugin will resolve paths matching any of the entries in the tsconfig.json "paths" setting.
     * If this option is set to false, this behaviour will be disabled. If it is set to an object,
     * it will use those entries instead of those found in the tsconfig.json file.
     */
    pathAliases?: false | Record<string, string>;

    /**
     * If set, an HTML file will be generated and injected with the build output.
     */
    generateHTML?: IndexOptions | string;

    /**
     * Strategy to use when generating IDs for components.
     * 
     * If set to "hash", the ID will be derived from the .vue file path.
     * If set to an object with a "random" property, a random ID will be generated.
     * If "random" is set to a string, the random generator will be seeded with said string.
     */
    scopeId?: "hash" | { random: true | string };

    /**
     * Disable the caching of rendered SFC parts.
     */
    disableCache?: boolean;

    /**
     * Custom directives will be transformed according to the value in this object.
     * 
     * If the value is a string, a property with that name will be added to the element with the same value as the directive.
     * If the value is a function and it returns a string, the same behaviour as the former case will be performed.
     * If the value is false, no property will be added.
     */
    directiveTransforms?: Record<string, string | false | ((dir: DirectiveNode, node: ElementNode, context: TransformContext) => string | undefined)>;

    /**
     * Options and plugins to pass to the PostCSS postprocessor.
     */
    postcss?: {
        options?: any;
        plugins?: any[];
    }

    /**
     * If enabled, Single File Components' CSS will be combined into the output JS files and added to <head> at runtime.
     * If generateHTML is also enabled, the CSS <style> blocks will instead be added to the generated HTML file.
     * 
     * By default, separate CSS files will be generated.
     */
    cssInline?: boolean;

    /**
     * Option to add custom compiler options for vue sfc
     */
    compilerOptions?: CompilerOptions;

    /**
     * Option to pass to CSS preprocessor options in the Vue SFC compiler
     * 
     * Less: https://lesscss.org/usage/#less-options
     * 
     * SCSS: https://sass-lang.com/documentation/js-api/interfaces/Options
     * 
     * With version 0.4.3,you can now pass preprocessCustomRequire,
     * this option is needed when this plugin is used on browser and
     * you use a supported lang attribute on style tag.
     * Check the links down below in order to understand what you need to pass
     * https://github.com/vuejs/vue/blob/main/packages/compiler-sfc/src/compileStyle.ts 
     * https://github.com/vuejs/vue/blob/main/packages/compiler-sfc/src/stylePreprocessors.ts
     */
    preprocessorOptions?: {
        source: string
        filename: string
        id: string
        scoped?: boolean
        trim?: boolean
        isProd?: boolean
        inMap?: RawSourceMap
        preprocessLang?: PreprocessLang
        preprocessOptions?: any
        preprocessCustomRequire?: (id: string) => any
        postcssOptions?: any
        postcssPlugins?: any[]
        /**
         * @deprecated use `inMap` instead.
         */
        map?: RawSourceMap
    } // types are taken from https://github.com/vuejs/core/tree/main/packages
}
