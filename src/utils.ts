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

export async function tryAsync<T>(fn: () => Promise<T>, module: string, requiredFor: string) {
    try {
        return await fn();
    } catch (err) {
        throw new Error(`Package "${module}" is required for ${requiredFor}. Please run "npm i -D ${module}" and try again.`);
    }
}

export class AsyncCache<TKey = any> {
    private store: Map<TKey, any> = new Map<TKey, any>();

    constructor(public enabled: boolean = true) {}

    public get<T>(key: TKey, fn: () => Promise<T>): Promise<T> {
        if (!this.enabled) {
            return fn();
        }

        let val = this.store.get(key);
        if (!val) {
            return fn().then(o => (this.store.set(key, o), o));
        }

        return val;
    }
}