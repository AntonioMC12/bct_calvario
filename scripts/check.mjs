import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

for (const folder of ['src', 'server', 'scripts', 'test', '.']) {
  for (const file of readdirSync(folder, { withFileTypes: true })) {
    if (file.isFile() && /\.(m?js)$/.test(file.name)) {
      const result = spawnSync(process.execPath, ['--check', join(folder,file.name)], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status ?? 1);
    }
  }
}
