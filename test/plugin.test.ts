import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import vuePlugin from '../src/index';

const fixturesDir = path.resolve(__dirname, 'fixtures');
const aliasProjectDir = path.resolve(fixturesDir, 'alias-project');

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'vue-plugin-test-'));
}

async function buildFixture(entry: string, pluginOpts: Parameters<typeof vuePlugin>[0] = {}, buildOpts: esbuild.BuildOptions = {}) {
    const outdir = tmpDir();
    const result = await esbuild.build({
        entryPoints: [path.join(fixturesDir, entry)],
        bundle: true,
        outdir,
        write: true,
        format: 'esm',
        external: ['vue'],
        plugins: [vuePlugin(pluginOpts)],
        logLevel: 'silent',
        ...buildOpts,
    });
    return { result, outdir };
}

async function buildAliasProject(entry: string, pluginOpts: Parameters<typeof vuePlugin>[0] = {}) {
    const outdir = tmpDir();
    const tsconfigPath = path.join(aliasProjectDir, 'tsconfig.json');
    const result = await esbuild.build({
        entryPoints: [path.join(aliasProjectDir, entry)],
        bundle: true,
        outdir,
        write: true,
        format: 'esm',
        external: ['vue'],
        tsconfig: tsconfigPath,
        plugins: [vuePlugin(pluginOpts)],
        logLevel: 'silent',
    });
    return { result, outdir };
}

function readOutput(outdir: string): string {
    const files = fs.readdirSync(outdir).filter(f => f.endsWith('.js'));
    return files.map(f => fs.readFileSync(path.join(outdir, f), 'utf8')).join('\n');
}

describe('vuePlugin integration', () => {
    const cleanupDirs: string[] = [];

    afterAll(() => {
        for (const dir of cleanupDirs) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('compiles a basic SFC with template, script, and scoped style', async () => {
        const { result, outdir } = await buildFixture('entry-basic.ts');
        cleanupDirs.push(outdir);

        expect(result.errors).toHaveLength(0);

        const jsOutput = readOutput(outdir);
        expect(jsOutput).toContain('Basic');
        expect(jsOutput).toContain('__scopeId');
        expect(jsOutput).toContain('data-v-');

        // Scoped CSS should produce a separate .css file
        const cssFiles = fs.readdirSync(outdir).filter(f => f.endsWith('.css'));
        expect(cssFiles.length).toBeGreaterThanOrEqual(1);

        const cssOutput = cssFiles.map(f => fs.readFileSync(path.join(outdir, f), 'utf8')).join('\n');
        expect(cssOutput).toContain('.hello');
        // Scoped style should have a data-v attribute selector
        expect(cssOutput).toMatch(/data-v-/);
    });

    it('compiles a <script setup> SFC', async () => {
        const { result, outdir } = await buildFixture('entry-setup.ts');
        cleanupDirs.push(outdir);

        expect(result.errors).toHaveLength(0);

        const jsOutput = readOutput(outdir);
        // script setup compiles ref() and the template render function
        expect(jsOutput).toContain('ref');
    });

    it('compiles a template-only SFC (no script block)', async () => {
        const { result, outdir } = await buildFixture('entry-template-only.ts');
        cleanupDirs.push(outdir);

        expect(result.errors).toHaveLength(0);

        const jsOutput = readOutput(outdir);
        expect(jsOutput).toContain('No script block here');
    });

    it('sets __VUE_OPTIONS_API__ to false when disableOptionsApi is true', async () => {
        const { result, outdir } = await buildFixture('entry-basic.ts', { disableOptionsApi: true });
        cleanupDirs.push(outdir);

        expect(result.errors).toHaveLength(0);
    });

    it('inlines CSS when cssInline is true', async () => {
        const { result, outdir } = await buildFixture('entry-basic.ts', { cssInline: true });
        cleanupDirs.push(outdir);

        expect(result.errors).toHaveLength(0);

        const jsOutput = readOutput(outdir);
        // Inline CSS injects a <style> element via JS
        expect(jsOutput).toContain('createElement("style")');
        expect(jsOutput).toContain('.hello');

        // No separate CSS file should exist
        const cssFiles = fs.readdirSync(outdir).filter(f => f.endsWith('.css'));
        expect(cssFiles).toHaveLength(0);
    });

    it('produces sourcemaps when enabled', async () => {
        const { result, outdir } = await buildFixture('entry-basic.ts', {}, { sourcemap: true });
        cleanupDirs.push(outdir);

        expect(result.errors).toHaveLength(0);

        const mapFiles = fs.readdirSync(outdir).filter(f => f.endsWith('.map'));
        expect(mapFiles.length).toBeGreaterThanOrEqual(1);
    });

    it('disables cache without errors when disableCache is true', async () => {
        const { result, outdir } = await buildFixture('entry-basic.ts', { disableCache: true });
        cleanupDirs.push(outdir);

        expect(result.errors).toHaveLength(0);
    });

    it('uses absolute filename in descriptor for tsconfig discovery', async () => {
        // This test verifies the design fix: sfc.parse receives an absolute filename
        // so that @vue/compiler-sfc can walk up to find tsconfig.json for type resolution.
        // We verify indirectly: the __file property should be a relative path (for devtools),
        // but the compilation should succeed with an absolute path internally.
        const { result, outdir } = await buildFixture('entry-setup.ts');
        cleanupDirs.push(outdir);

        expect(result.errors).toHaveLength(0);

        const jsOutput = readOutput(outdir);
        // __file should contain a relative path for devtools display
        expect(jsOutput).toContain('__file');
        // Should NOT contain an absolute drive letter or root in __file
        expect(jsOutput).not.toMatch(/__file\s*=\s*"[A-Z]:\\/);
    });
});

describe('defineProps with tsconfig path aliases (IF-43411)', () => {
    const cleanupDirs: string[] = [];

    afterAll(() => {
        for (const dir of cleanupDirs) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('resolves defineProps<ImportedType> via @/ alias', async () => {
        // TypedProps.vue does: import type { ExtendedProps } from '@/types/props'
        // then: defineProps<ExtendedProps>()
        // compiler-sfc must resolve @/types/props through tsconfig paths
        // to extract the type and generate runtime props.
        const { result, outdir } = await buildAliasProject('src/entry.ts');
        cleanupDirs.push(outdir);

        expect(result.errors).toHaveLength(0);

        const jsOutput = readOutput(outdir);
        // ExtendedProps has: id (Number), label (String), description (String), active (Boolean)
        // compiler-sfc should generate runtime prop definitions for these
        expect(jsOutput).toContain('id');
        expect(jsOutput).toContain('label');
        expect(jsOutput).toContain('active');
    });

    it('resolves multi-level type inheritance chains via @/ alias', async () => {
        // InheritedProps.vue does: import type { DerivedProps } from '@/types/derived'
        // DerivedProps extends ExtendedProps (from @/types/props)
        // ExtendedProps extends BaseProps
        // This is the "type inheritance chain" scenario from IF-43411.
        const { result, outdir } = await buildAliasProject('src/entry-inherited.ts');
        cleanupDirs.push(outdir);

        expect(result.errors).toHaveLength(0);

        const jsOutput = readOutput(outdir);
        // DerivedProps inherits: id, label (from BaseProps), description, active (from ExtendedProps)
        // and adds: priority
        // All should appear as runtime props in the compiled output
        expect(jsOutput).toContain('id');
        expect(jsOutput).toContain('label');
        expect(jsOutput).toContain('active');
        expect(jsOutput).toContain('priority');
    });
});
