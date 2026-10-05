#!/usr/bin/env node
// React Native Web's Alert.alert() does nothing, so a confirm dialog with
// buttons (Remove, Cancel lesson, Sign out…) silently fails on the website.
// Lists every Alert.alert call that passes buttons in a file with no web
// fallback (window.confirm / a confirm helper). Exit 1 if any are found.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
});
const hits = [];
for (const file of [...walk('app'), ...walk('components')]) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (!line.includes('Alert.alert(')) return;
    const call = lines.slice(i, i + 8).join(' ');
    if (!/Alert\.alert\([^;]*\[\s*\{/.test(call)) return;               // no buttons → just a message
    const before = lines.slice(Math.max(0, i - 6), i).join(' ');
    if (/Platform\.OS\s*===\s*'web'|window\.confirm|confirmAsync/.test(before)) return; // guarded
    hits.push(`${file}:${i + 1}`);
  });
}
if (!hits.length) { console.log('✓ No button alerts without a web fallback'); process.exit(0); }
console.log(`✗ ${hits.length} button alert(s) do nothing on the website:\n  ${hits.join('\n  ')}`);
process.exit(1);
