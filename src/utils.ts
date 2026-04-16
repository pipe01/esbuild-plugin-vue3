import * as fs from 'fs';
import { OnResolveArgs } from "esbuild";
import * as path from "path";

export function getUrlParams(search: string): Record<string, string> {
    const idx = search.indexOf('?');
    if (idx === -1) return {};

    const hashes = search.slice(idx + 1).split('&');
    return hashes.reduce((params: Record<string, string>, hash) => {
        const [key, val] = hash.split('=');
        return Object.assign(params, {[key]: decodeURIComponent(val)});
    }, {});
}

export async function fileExists(filePath: fs.PathLike) {
    try {
        const stat = await fs.promises.stat(filePath);
        return stat.isFile();
    } catch (err) {
        return false;
    }
}

export function getFullPath(args: OnResolveArgs) {
    return path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path);
}

export async function tryAsync<T>(fn: () => Promise<T>, module: string, requiredFor: string) {
    try {
        return await fn();
    } catch (err) {
        throw new Error(`Package "${module}" is required for ${requiredFor}. Please run "npm i -D ${module}" and try again.`);
    }
}

export class AsyncCache {
    private store: Map<string, any> = new Map();

    constructor(public enabled: boolean = true) {}

    public get<T>(key: string, fn: () => Promise<T>): Promise<T> {
        if (!this.enabled) {
            return fn();
        }

        const val = this.store.get(key);
        if (!val) {
            return fn().then(o => (this.store.set(key, o), o));
        }

        return val;
    }
}
