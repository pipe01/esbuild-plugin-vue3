import { fileExists } from "./utils";
import fs from 'fs';

type Rule = { regex: RegExp, replacement: string }

const rules: Rule[] = [];

export async function loadRules() {
    if (!await fileExists("tsconfig.json")) {
        return;
    }

    const tsconfig = JSON.parse((await fs.promises.readFile("tsconfig.json")).toString());

    if (!tsconfig?.compilerOptions?.paths) {
        return;
    }

    function replaceWildcard(str: string, repl: string) {
        return str.replace(/\*/g, repl);
    }

    for (const path in tsconfig.compilerOptions.paths) {
        const dests: string[] = tsconfig.compilerOptions.paths[path];

        if (dests.length == 0) {
            continue;
        }

        const from = replaceWildcard(path, "(.*)");
        const to = replaceWildcard(dests[0], "$1");

        rules.push({
            regex: new RegExp(from),
            replacement: to
        })
    }
}
