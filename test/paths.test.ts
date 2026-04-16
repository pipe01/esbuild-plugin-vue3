import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { PathResolver } from '../src/paths';

const fixturesDir = path.resolve(__dirname, 'fixtures');

describe('PathResolver', () => {
    describe('init', () => {
        it('returns false when pathAliases is explicitly false', async () => {
            const resolver = new PathResolver();
            const result = await resolver.init(
                { pathAliases: false },
                path.join(fixturesDir, 'tsconfig.paths.json')
            );
            expect(result).toBe(false);
        });

        it('loads rules from tsconfig paths and returns true', async () => {
            const resolver = new PathResolver();
            const result = await resolver.init(
                {},
                path.join(fixturesDir, 'tsconfig.paths.json')
            );
            expect(result).toBe(true);
        });

        it('returns false when tsconfig has no paths', async () => {
            const resolver = new PathResolver();
            const result = await resolver.init(
                {},
                path.join(fixturesDir, 'tsconfig.empty.json')
            );
            expect(result).toBe(false);
        });

        it('returns false when tsconfig does not exist', async () => {
            const resolver = new PathResolver();
            const result = await resolver.init(
                {},
                path.join(fixturesDir, 'nonexistent.json')
            );
            expect(result).toBe(false);
        });

        it('loads rules from explicit pathAliases option', async () => {
            const resolver = new PathResolver();
            const result = await resolver.init(
                { pathAliases: { '@/*': './custom/*' } },
                path.join(fixturesDir, 'tsconfig.paths.json')
            );
            expect(result).toBe(true);
        });
    });

    describe('replaceRules', () => {
        it('replaces aliased imports using tsconfig paths', async () => {
            const resolver = new PathResolver();
            await resolver.init({}, path.join(fixturesDir, 'tsconfig.paths.json'));

            const replaced = path.normalize(resolver.replaceRules('@/components/Button'));
            // Should resolve to an absolute path rooted in the fixtures dir
            expect(replaced).toContain(path.join('src', 'components', 'Button'));
            expect(path.isAbsolute(replaced)).toBe(true);
        });

        it('replaces multiple alias patterns', async () => {
            const resolver = new PathResolver();
            await resolver.init({}, path.join(fixturesDir, 'tsconfig.paths.json'));

            const replaced = path.normalize(resolver.replaceRules('~utils/helpers'));
            expect(replaced).toContain(path.join('lib', 'utils', 'helpers'));
            expect(path.isAbsolute(replaced)).toBe(true);
        });

        it('leaves non-matching paths unchanged', async () => {
            const resolver = new PathResolver();
            await resolver.init({}, path.join(fixturesDir, 'tsconfig.paths.json'));

            expect(resolver.replaceRules('vue')).toBe('vue');
            expect(resolver.replaceRules('./local/file')).toBe('./local/file');
        });

        it('uses explicit pathAliases over tsconfig', async () => {
            const resolver = new PathResolver();
            await resolver.init(
                { pathAliases: { 'my-alias/*': './replaced/*' } },
                path.join(fixturesDir, 'tsconfig.paths.json')
            );

            // Explicit alias should work
            expect(resolver.replaceRules('my-alias/foo')).toBe('./replaced/foo');
            // tsconfig alias should NOT work (explicit takes precedence)
            expect(resolver.replaceRules('@/bar')).toBe('@/bar');
        });
    });

    describe('instance isolation', () => {
        it('two instances do not share rules', async () => {
            const resolver1 = new PathResolver();
            await resolver1.init(
                { pathAliases: { 'alias1/*': './path1/*' } },
                path.join(fixturesDir, 'tsconfig.empty.json')
            );

            const resolver2 = new PathResolver();
            await resolver2.init(
                { pathAliases: { 'alias2/*': './path2/*' } },
                path.join(fixturesDir, 'tsconfig.empty.json')
            );

            // resolver1 should only know about alias1
            expect(resolver1.replaceRules('alias1/foo')).toBe('./path1/foo');
            expect(resolver1.replaceRules('alias2/foo')).toBe('alias2/foo');

            // resolver2 should only know about alias2
            expect(resolver2.replaceRules('alias2/foo')).toBe('./path2/foo');
            expect(resolver2.replaceRules('alias1/foo')).toBe('alias1/foo');
        });
    });

    describe('compilerOptions', () => {
        it('exposes parsed compiler options from tsconfig', async () => {
            const resolver = new PathResolver();
            await resolver.init({}, path.join(fixturesDir, 'tsconfig.paths.json'));

            expect(resolver.compilerOptions).toBeDefined();
            expect(resolver.compilerOptions.paths).toBeDefined();
            expect(resolver.compilerOptions.baseUrl).toBeDefined();
        });

        it('returns empty compiler options when tsconfig not found', async () => {
            const resolver = new PathResolver();
            await resolver.init({}, path.join(fixturesDir, 'nonexistent.json'));

            expect(resolver.compilerOptions).toEqual({});
        });
    });
});
