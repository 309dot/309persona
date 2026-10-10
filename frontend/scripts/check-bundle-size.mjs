// Fails when the JS/CSS that index.html loads up front (entry + modulepreload) outgrows the budget.
// Lazily loaded chunks (markdown renderer, admin dashboard) and font subsets are not counted.
// Run after `npm run build`: npm run size
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = { js: 110, css: 25 }; // gzip; 2026-10 baseline is about 90 KB JS / 20 KB CSS

const dist = path.resolve(import.meta.dirname, '../dist');
const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
const files = [...new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]))];

const totals = { js: 0, css: 0 };
for (const file of files) {
  const kind = file.endsWith('.css') ? 'css' : 'js';
  const size = gzipSync(readFileSync(path.join(dist, file))).length / 1024;
  totals[kind] += size;
  console.log(`${file.padEnd(48)} ${size.toFixed(1).padStart(7)} KB gzip`);
}

let failed = false;
for (const kind of ['js', 'css']) {
  const over = totals[kind] > BUDGET_KB[kind];
  failed ||= over;
  console.log(`${over ? 'OVER' : 'ok  '} initial ${kind}: ${totals[kind].toFixed(1)} KB / budget ${BUDGET_KB[kind]} KB`);
}
process.exit(failed ? 1 : 0);
