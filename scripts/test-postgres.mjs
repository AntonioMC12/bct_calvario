import { spawnSync } from 'node:child_process';

const tests = ['test/core.test.mjs','test/integrations.test.mjs','test/postgres.test.mjs'];
const result = spawnSync(process.execPath,['--test', ...tests],{
  stdio:'inherit',env:{ ...process.env,CALVARIO_TEST_ENGINE:'postgres' },
});
process.exitCode = result.status ?? 1;
