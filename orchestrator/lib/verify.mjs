// รัน verify gates (typecheck / test / lint) ใน REPO_ROOT ก่อน commit/merge
import { spawn } from 'node:child_process';
import { config, REPO_ROOT } from '../config.mjs';

function run(cmd) {
  return new Promise((resolvePromise) => {
    let out = '';
    const child = spawn(cmd, { cwd: REPO_ROOT, shell: true });
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => resolvePromise({ code: 1, out: `spawn error: ${e.message}` }));
    child.on('close', (code) => resolvePromise({ code, out }));
  });
}

// คืน { ok, results:[{name, ok, code, tail}] }
export async function runVerify(gates = config.verify) {
  const results = [];
  for (const g of gates) {
    const { code, out } = await run(g.cmd);
    results.push({
      name: g.name,
      cmd: g.cmd,
      ok: code === 0,
      code,
      tail: out.split('\n').slice(-40).join('\n'),
    });
  }
  return { ok: results.every((r) => r.ok), results };
}

export function verifyFailureSummary(verify) {
  return verify.results
    .filter((r) => !r.ok)
    .map((r) => `## ${r.name} (exit ${r.code})\n${r.tail}`)
    .join('\n\n');
}
