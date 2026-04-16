// https://github.com/mafintosh/random-bytes-seed/blob/6eb86c4746907d4430ac46d64fe5f17ef10502ba/index.js

import { randomBytes as _randomBytes, createHash } from 'crypto'
const randomBytesClassic = _randomBytes

export default function(seed: string | Buffer = randomBytesClassic(32)) {
    randomBytes.seed = seed;
    randomBytes.currentSeed = seed;

    return randomBytes;

    function randomBytes (n: number) {
        const result = Buffer.allocUnsafe(n);
        let used = 0;

        while (used < result.length) {
            randomBytes.currentSeed = seed = next(seed);
            seed.copy(result, used);
            used += seed.length;
        }

        return result;
    }
}

function next (seed: string | Buffer) {
  return createHash('sha256').update(seed).digest();
}
