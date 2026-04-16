import { describe, it, expect } from 'vitest';
import randomBytes from '../src/random';

describe('randomBytes', () => {
    it('produces a buffer of the requested length', () => {
        const rng = randomBytes('test-seed');
        const buf = rng(16);
        expect(Buffer.isBuffer(buf)).toBe(true);
        expect(buf.length).toBe(16);
    });

    it('produces deterministic output for the same seed', () => {
        const rng1 = randomBytes('same-seed');
        const rng2 = randomBytes('same-seed');

        expect(rng1(8).toString('hex')).toBe(rng2(8).toString('hex'));
    });

    it('produces different output for different seeds', () => {
        const rng1 = randomBytes('seed-a');
        const rng2 = randomBytes('seed-b');

        expect(rng1(8).toString('hex')).not.toBe(rng2(8).toString('hex'));
    });

    it('produces different bytes on successive calls', () => {
        const rng = randomBytes('sequential');
        const first = rng(8).toString('hex');
        const second = rng(8).toString('hex');

        expect(first).not.toBe(second);
    });

    it('handles requests larger than the hash digest size', () => {
        const rng = randomBytes('large');
        // SHA-256 digest is 32 bytes; requesting 64 should still work
        const buf = rng(64);
        expect(buf.length).toBe(64);
    });
});
