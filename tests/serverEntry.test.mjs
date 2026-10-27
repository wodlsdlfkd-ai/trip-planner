import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('deployed entry can start without require(ESM) support and fails closed before configuration', () => {
  const script = `
    const {default: handler} = await import(${JSON.stringify(new URL('../api/trips.js', import.meta.url).href)});
    let status;
    const response = { setHeader(){}, status(value){ status=value; return this; }, json(data){ if(status!==503 || data.code!=='editing-unavailable') process.exitCode=1; } };
    await handler({ method:'POST', headers:{authorization:'Bearer fixture'}, body:{action:'capabilities'} }, response);
    if(status!==503) process.exitCode=1;
  `;
  const env = { ...process.env };
  delete env.FIREBASE_SERVICE_ACCOUNT_JSON; delete env.TRIP_SHARE_CODE_SHA256;
  const result = spawnSync(process.execPath, ['--no-experimental-require-module', '--input-type=module', '-e', script], { env, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
