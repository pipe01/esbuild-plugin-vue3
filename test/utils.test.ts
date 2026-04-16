import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { getUrlParams, fileExists, getFullPath, tryAsync, AsyncCache } from '../src/utils';

describe('getUrlParams', () => {
    it('parses query parameters from a URL-like string', () => {
        const result = getUrlParams('/path/to/file.vue?type=script&index=0');
        expect(result).toEqual({ type: 'script', index: '0' });
    });

    it('returns empty object when no query string present', () => {
        const result = getUrlParams('/path/to/file.vue');
        expect(result).toEqual({});
    });

    it('decodes URI-encoded values', () => {
        const result = getUrlParams('file.vue?name=hello%20world');
        expect(result).toEqual({ name: 'hello world' });
    });

    it('handles a single parameter', () => {
        const result = getUrlParams('file.vue?type=style');
        expect(result).toEqual({ type: 'style' });
    });
});

describe('fileExists', () => {
    it('returns true for an existing file', async () => {
        const thisFile = path.resolve(__dirname, 'utils.test.ts');
        expect(await fileExists(thisFile)).toBe(true);
    });

    it('returns false for a non-existent path', async () => {
        expect(await fileExists('/definitely/not/a/real/file.txt')).toBe(false);
    });

    it('returns false for a directory', async () => {
        expect(await fileExists(__dirname)).toBe(false);
    });
});

describe('getFullPath', () => {
    it('returns absolute path unchanged', () => {
        const absPath = path.resolve('/some/absolute/path.vue');
        const args = { path: absPath, resolveDir: '/other/dir' } as any;
        expect(getFullPath(args)).toBe(absPath);
    });

    it('joins relative path with resolveDir', () => {
        const args = { path: 'components/App.vue', resolveDir: '/project/src' } as any;
        expect(getFullPath(args)).toBe(path.join('/project/src', 'components/App.vue'));
    });
});

describe('tryAsync', () => {
    it('returns the result of a successful async function', async () => {
        const result = await tryAsync(() => Promise.resolve(42), 'test-mod', 'testing');
        expect(result).toBe(42);
    });

    it('throws a descriptive error when the function rejects', async () => {
        await expect(
            tryAsync(() => Promise.reject(new Error('fail')), 'missing-pkg', 'feature X')
        ).rejects.toThrow('Package "missing-pkg" is required for feature X');
    });
});

describe('AsyncCache', () => {
    it('caches the result of an async factory', async () => {
        const cache = new AsyncCache(true);
        let callCount = 0;
        const factory = () => { callCount++; return Promise.resolve('value'); };

        const first = await cache.get('key1', factory);
        const second = await cache.get('key1', factory);

        expect(first).toBe('value');
        expect(second).toBe('value');
        expect(callCount).toBe(1);
    });

    it('uses distinct entries for different keys', async () => {
        const cache = new AsyncCache(true);
        await cache.get('a', () => Promise.resolve(1));
        await cache.get('b', () => Promise.resolve(2));

        expect(await cache.get('a', () => Promise.resolve(99))).toBe(1);
        expect(await cache.get('b', () => Promise.resolve(99))).toBe(2);
    });

    it('bypasses cache when disabled', async () => {
        const cache = new AsyncCache(false);
        let callCount = 0;
        const factory = () => { callCount++; return Promise.resolve('val'); };

        await cache.get('key', factory);
        await cache.get('key', factory);

        expect(callCount).toBe(2);
    });
});
