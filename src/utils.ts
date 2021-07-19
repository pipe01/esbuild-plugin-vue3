import fs from 'fs';

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
