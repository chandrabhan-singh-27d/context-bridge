const $ = (id) => document.getElementById(id);
const toolBtn = $('tool-btn');
const toolList = $('tool-list');
const repoUrl = $('repo-url');
const args = $('args');
const result = $('result');
const status = $('status');
const runBtn = $('run');
const health = $('health');

let tools = [];
let selectedTool = null;
let defaultRepo = null;

const TOOL_META = {
  ping:                 { title: 'Ping',                  summary: 'Health check. Returns a timestamped pong.' },
  get_repo_info:        { title: 'Repository Info',       summary: 'Fetch metadata for a GitHub repository.' },
  search_issues:        { title: 'Search Issues',         summary: 'Search issues by keyword, state, and count.' },
  get_pull_request:     { title: 'Pull Request Details',  summary: 'Fetch PR metadata: title, state, branches, stats.' },
  get_pr_diff:          { title: 'PR Diff',               summary: 'Fetch the unified diff of a pull request.' },
  list_review_comments: { title: 'Review Comments',       summary: 'List inline review comments on a PR.' },
  get_ci_status:        { title: 'CI Status',             summary: 'List recent GitHub Actions workflow runs.' },
  get_commit_history:   { title: 'Commit History',        summary: 'List commits with optional filters.' },
  search_code:          { title: 'Search Code',           summary: 'Search code by keyword (30 req/min limit).' },
  comment_on_issue:     { title: 'Comment on Issue',      summary: 'Post a comment on a GitHub issue.' },
  comment_on_pr:        { title: 'Comment on PR',         summary: 'Post a top-level comment on a pull request.' },
  label_issue:          { title: 'Label Issue',           summary: 'Add labels to an issue or pull request.' },
  create_branch:        { title: 'Create Branch',         summary: 'Create a new branch from an existing ref.' },
  commit_files:         { title: 'Commit Files',          summary: 'Atomically commit files to a non-default branch.' },
  open_pr:              { title: 'Open Pull Request',     summary: 'Open a PR. Supports draft mode and Closes markers.' },
  summarize_issue:      { title: 'Summarize Issue',       summary: 'LLM-generated summary with labels and next steps.' },
  triage_pr:            { title: 'Review PR',             summary: 'LLM risk assessment with labels and recommendations.' },
  propose_fix:          { title: 'Propose Fix',           summary: 'End-to-end: issue -> LLM patch -> branch -> draft PR.' },
};

function setStatus(msg, kind = '') {
  status.textContent = msg;
  status.className = `status ${kind}`;
}

const sub = document.querySelector('.sub');

function parseRepoUrl(val) {
  val = val.trim();
  if (!val) return null;
  const github = 'https://github.com/';
  if (val.startsWith(github)) {
    const rest = val.slice(github.length).replace(/\/$/, '');
    const parts = rest.split('/');
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
  }
  const parts = val.split('/');
  if (parts.length === 2) return { owner: parts[0], repo: parts[1] };
  return null;
}

function repoToUrl(owner, repo) {
  return `https://github.com/${owner}/${repo}`;
}

function buildArgs() {
  const t = tools.find((x) => x.name === selectedTool);
  if (!t) return {};
  const schema = t.inputSchema;
  if (!schema || typeof schema !== 'object' || !schema.properties) return {};

  const parsed = parseRepoUrl(repoUrl.value);
  const example = {};
  for (const [k, v] of Object.entries(schema.properties)) {
    const required = Array.isArray(schema.required) && schema.required.includes(k);
    if (required) {
      if (k === 'owner' && parsed) { example.owner = parsed.owner; continue; }
      if (k === 'repo' && parsed) { example.repo = parsed.repo; continue; }
      example[k] = hint(v);
    }
  }
  return example;
}

function renderArgs() {
  args.value = JSON.stringify(buildArgs(), null, 2);
}

async function loadHealth() {
  try {
    const r = await fetch('/api/health');
    const j = await r.json();
    health.textContent = `mcp ${j.mcp ? 'alive' : 'dead'} \u00b7 ip-buckets ${j.bucketSize}`;
    if (j.defaultRepo && !defaultRepo) {
      defaultRepo = j.defaultRepo;
      if (!repoUrl.value) repoUrl.value = repoToUrl(defaultRepo.split('/')[0], defaultRepo.split('/')[1]);
    }
  } catch (_e) {
    health.textContent = 'health: unreachable';
  }
}

function closeDropdown() {
  toolList.classList.remove('open');
}

function selectTool(name) {
  selectedTool = name;
  const meta = TOOL_META[name] ?? {};
  toolBtn.textContent = meta.title || name;
  closeDropdown();
  renderArgs();
}

repoUrl.addEventListener('input', renderArgs);

async function loadTools() {
  setStatus('loading tools\u2026');
  try {
    const r = await fetch('/api/tools');
    if (!r.ok) {
      setStatus(`tools/list ${r.status}`, 'error');
      return;
    }
    const j = await r.json();
    tools = Array.isArray(j.tools) ? j.tools : [];
    const writeTools = ['comment_on_issue', 'comment_on_pr', 'label_issue', 'create_branch', 'commit_files', 'open_pr'];
    const hasWrites = writeTools.some((name) => tools.some((t) => t.name === name));
    sub.textContent = hasWrites
      ? 'read-write GitHub access via MCP. Pick a tool, fill args, run.'
      : 'read-only GitHub access via MCP. Pick a tool, fill args, run.';

    toolList.innerHTML = '';
    for (const t of tools) {
      const meta = TOOL_META[t.name] ?? {};
      const item = document.createElement('button');
      item.className = 'dropdown-item';
      item.type = 'button';
      item.innerHTML = `<span class="dd-title">${meta.title || t.name}</span><span class="dd-summary">${meta.summary || t.description || ''}</span>`;
      item.addEventListener('click', () => selectTool(t.name));
      toolList.appendChild(item);
    }
    setStatus(`${tools.length} tools loaded`, 'ok');
  } catch (e) {
    setStatus(String(e), 'error');
  }
}

toolBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toolList.classList.toggle('open');
});

document.addEventListener('click', closeDropdown);

function hint(v) {
  if (!v || typeof v !== 'object') return '';
  if (v.type === 'string') return '';
  if (v.type === 'number' || v.type === 'integer') return 0;
  if (v.type === 'boolean') return false;
  if (v.type === 'array') return [];
  return null;
}

async function run() {
  if (!selectedTool) {
    setStatus('select a tool first', 'error');
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(args.value || '{}');
  } catch (e) {
    setStatus(`invalid JSON: ${e.message}`, 'error');
    return;
  }
  runBtn.disabled = true;
  setStatus('running\u2026');
  const t0 = performance.now();
  try {
    const r = await fetch('/api/call', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: selectedTool, arguments: parsed }),
    });
    const j = await r.json();
    const ms = Math.round(performance.now() - t0);
    result.textContent = JSON.stringify(j, null, 2);
    if (r.ok) setStatus(`ok \u00b7 ${ms}ms`, 'ok');
    else setStatus(`http ${r.status} \u00b7 ${ms}ms`, 'error');
  } catch (e) {
    setStatus(String(e), 'error');
  } finally {
    runBtn.disabled = false;
  }
}

runBtn.addEventListener('click', run);
loadHealth();
loadTools();
setInterval(loadHealth, 10_000);
