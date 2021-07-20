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
}