import * as fs from 'fs';
import { OnResolveArgs } from "esbuild";
import * as path from "path";

export function getUrlParams(search: string): Record<string, string> {
    let hashes = search.slice(search.indexOf('?') + 1).split('&')
    return hashes.reduce((params, hash) => {
        let [key, val] = hash.split('=')
        return Object.assign(params, {[key]: decodeURIComponent(val)})
    }, {})
}

export async function fileExists(path: fs.PathLike) {
    try {
        const stat = await fs.promises.stat(path);
        return stat.isFile();
    } catch (err) {
        return false;
    }
}

export function getFullPath(args: OnResolveArgs) {
    return path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path);
}
