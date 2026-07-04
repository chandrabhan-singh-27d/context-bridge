#!/usr/bin/env bun
const ok: string[] = [];
const missing: string[] = [];

if (process.env['GITHUB_TOKEN']) {
  ok.push('GITHUB_TOKEN');
} else {
  missing.push('GITHUB_TOKEN');
}

if (process.env['LLM_API_KEY']) {
  ok.push('LLM_API_KEY');
} else {
  missing.push('LLM_API_KEY (AI tools will be unavailable)');
}

if (process.env['DEFAULT_REPO']) {
  ok.push('DEFAULT_REPO');
}

console.log('context-bridge — environment check\n');

for (const v of ok) console.log(`  ✅ ${v}`);

if (missing.length > 0) {
  console.log('');
  for (const v of missing) console.log(`  ❌ ${v}`);
  console.log('');
  console.log('  Add missing variables to ~/.bashrc:');
  console.log('    export GITHUB_TOKEN="github_pat_..."');
  console.log('    export LLM_API_KEY="..."');
  console.log('    export DEFAULT_REPO="owner/repo"  (optional)');
  console.log('');
  console.log('  Then: source ~/.bashrc && bun run ui:start');
  process.exit(1);
} else {
  console.log('');
  console.log('  All required variables are set.');
  console.log('  Run: bun run ui:start');
}
