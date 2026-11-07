import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
for (const dir of ['server', 'extension', 'scripts', 'test']) {
  for (const file of readdirSync(dir).filter(f => /\.(m?js)$/.test(f))) {
    execFileSync(process.execPath, ['--check', `${dir}/${file}`], { stdio: 'inherit' });
  }
}
const manifest = JSON.parse(readFileSync('extension/manifest.json'));
const pkg = JSON.parse(readFileSync('package.json'));
if (manifest.version !== pkg.version || manifest.name !== 'YouTube In Sync') throw Error('Release metadata mismatch');
console.log('Syntax and manifest OK');
