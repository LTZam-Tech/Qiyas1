#!/usr/bin/env node
// CI-5: fail the build on high or critical advisories in production dependencies,
// except those listed (with a reason and an expiry date) in .github/audit-exceptions.json.
//
// Usage (from the package directory):  npm audit --omit=dev --json > audit.json || true
//                                      node <repo>/.github/scripts/audit-check.mjs audit.json <label>
// An exception is { "id": "GHSA-xxxx-xxxx-xxxx", "package": "name", "scope": "root|backend|*",
// "reason": "why it is not exploitable here", "expires": "YYYY-MM-DD", "owner": "who reviewed it" }.
// Expired exceptions no longer apply, so every exception is reviewed again.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , reportPath, scope = '*'] = process.argv;
if (!reportPath) {
  console.error('usage: audit-check.mjs <npm-audit.json> [scope]');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const exceptionsPath = join(here, '..', 'audit-exceptions.json');

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (err) {
  console.error(`Cannot read npm audit report ${reportPath}: ${err.message}`);
  process.exit(2);
}
if (report.error) {
  console.error(`npm audit failed: ${JSON.stringify(report.error)}`);
  process.exit(2);
}

const exceptions = JSON.parse(readFileSync(exceptionsPath, 'utf8')).exceptions ?? [];
const today = new Date().toISOString().slice(0, 10);
const active = new Map();
for (const e of exceptions) {
  if (!e.id || !e.reason || !e.expires) {
    console.error(`Invalid exception (id, reason and expires are required): ${JSON.stringify(e)}`);
    process.exit(2);
  }
  if (e.scope && e.scope !== '*' && e.scope !== scope) continue;
  if (e.expires < today) {
    console.log(`Exception ${e.id} expired on ${e.expires}; it no longer applies.`);
    continue;
  }
  active.set(e.id, e);
}

const BLOCKING = new Set(['high', 'critical']);
const findings = new Map();
for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
    const id = (via.url ?? '').split('/').pop() || String(via.source);
    if (!findings.has(id)) findings.set(id, { id, pkg, severity: via.severity, title: via.title, url: via.url });
  }
}

let blocking = 0;
for (const f of findings.values()) {
  const exc = active.get(f.id);
  if (exc) {
    console.log(`ALLOWED  ${f.severity.padEnd(8)} ${f.id} ${f.pkg}: ${f.title} (exception until ${exc.expires}: ${exc.reason})`);
  } else {
    blocking += 1;
    console.log(`BLOCKING ${f.severity.padEnd(8)} ${f.id} ${f.pkg}: ${f.title} ${f.url ?? ''}`);
  }
}

console.log(`[${scope}] ${findings.size} high/critical advisories, ${blocking} not covered by an exception.`);
process.exit(blocking > 0 ? 1 : 0);
