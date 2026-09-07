import { readFileSync } from 'node:fs';
import { parseBabyCage } from '../src/physics/baby-cage.ts';

export function loadModel(name = 'jelly-baby') {
  const bytes = readFileSync(`src/assets/model/${name}.bin`);
  return parseBabyCage(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    JSON.parse(readFileSync(`src/assets/model/${name}.json`, 'utf8')),
  );
}
