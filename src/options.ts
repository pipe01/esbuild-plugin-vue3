import { IndexOptions } from "./html";

export type Options = {
    /**
     * Vue's options API is disabled by default in order to save space, however you can re-enable it if you need it.
     */
    enableOptionsApi?: boolean;

    /**
     * Enable Vue dev tools on production, disabled by default.
     */
    enableDevTools?: boolean;

    /**
     * If enabled, Vue will emit code for rendering SSR pages.
     */
    renderSSR?: boolean;
    
    /**
     * By default, the plugin will resolve paths matching any of the entries in the tsconfig.json "paths" setting.
     */
    disableResolving?: boolean;

    /**
     * If set, an HTML file will be generated and injected with the build output.
     */
    generateHTML?: IndexOptions | string;

    /**
     * Seed to use when generating random scope IDs.
     */
    randomIdSeed?: string;

    /**
     * Disable the caching of rendered SFC parts.
     */
    disableCache?: boolean;

    /**
     * Custom directives will be transformed according to the value in this object.
     * 
     * If the value is a string, a property with that name will be added to the element with the same value as the directive.
     * If the value is false, no property will be added.
     */
    directiveTransforms?: Record<string, string | false>;
}
