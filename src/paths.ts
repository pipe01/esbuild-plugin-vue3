import * as path from 'path';
import * as fs from 'fs';
import ts from 'typescript';
import { fileExists } from './utils';
import { Options } from './options';

type Rule = { regex: RegExp; replacement: string };

function replaceWildcard(str: string, repl: string) {
    return str.replace(/\*/g, repl);
}

export class PathResolver {
    private rules: Rule[] = [];
    private _compilerOptions: ts.CompilerOptions = {};

    get compilerOptions(): ts.CompilerOptions {
        return this._compilerOptions;
    }

    /**
     * Initialize path alias rules. Returns true if any rules were loaded.
     */
    async init(opts: Options, tsconfigPath: string): Promise<boolean> {
        if (opts.pathAliases === false) {
            return false;
        }

        const resolvedTsconfigPath = path.resolve(tsconfigPath);

        // Parse tsconfig using TypeScript's own APIs so that baseUrl, paths,
        // and extends are resolved correctly.
        if (await fileExists(resolvedTsconfigPath)) {
            const configFile = ts.readConfigFile(resolvedTsconfigPath, ts.sys.readFile);
            if (!configFile.error) {
                const parsed = ts.parseJsonConfigFileContent(
                    configFile.config,
                    ts.sys,
                    path.dirname(resolvedTsconfigPath)
                );
                this._compilerOptions = parsed.options;
            }
        }

        if (opts.pathAliases) {
            // Explicit alias map from plugin options
            for (const pattern in opts.pathAliases) {
                if (Object.prototype.hasOwnProperty.call(opts.pathAliases, pattern)) {
                    const from = '^' + replaceWildcard(pattern, '(.*)') + '$';
                    const to = replaceWildcard(opts.pathAliases[pattern], '$1');
                    this.rules.push({ regex: new RegExp(from), replacement: to });
                }
            }
        } else {
            // Derive rules from the parsed compiler options
            this.loadFromCompilerOptions();
        }

        return this.rules.length > 0;
    }

    private loadFromCompilerOptions() {
        const paths = this._compilerOptions.paths;
        if (!paths) return;

        // baseUrl is already absolute after parseJsonConfigFileContent
        const baseUrl = this._compilerOptions.baseUrl || process.cwd();

        for (const pattern in paths) {
            const dests: string[] = paths[pattern];
            if (dests.length === 0) continue;

            const from = '^' + replaceWildcard(pattern, '(.*)') + '$';
            const dest = dests[0];

            // Resolve destination relative to baseUrl so rules produce absolute paths
            const resolvedDest = path.resolve(baseUrl, dest);
            const to = replaceWildcard(resolvedDest, '$1');

            this.rules.push({ regex: new RegExp(from), replacement: to });
        }
    }

    replaceRules(importPath: string): string {
        for (const rule of this.rules) {
            importPath = importPath.replace(rule.regex, rule.replacement);
        }
        return importPath;
    }
}
