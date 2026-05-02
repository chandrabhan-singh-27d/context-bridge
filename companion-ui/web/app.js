const $ = (id) => document.getElementById(id);
const toolSel = $('tool');
const desc = $('tool-desc');
const args = $('args');
const result = $('result');
const status = $('status');
const runBtn = $('run');
const health = $('health');

let tools = [];

function setStatus(msg, kind = '') {
  status.textContent = msg;
  status.className = `status ${kind}`;
}

async function loadHealth() {
  try {
    const r = await fetch('/api/health');
    const j = await r.json();
    health.textContent = `mcp ${j.mcp ? 'alive' : 'dead'} · ip-buckets ${j.bucketSize}`;
  } catch (_e) {
    health.textContent = 'health: unreachable';
  }
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

async function loadTools() {
  setStatus('loading tools…');
  try {
    const r = await fetch('/api/tools');
    if (!r.ok) {
      setStatus(`tools/list ${r.status}`, 'error');
      return;
    }
    const j = await r.json();
    tools = Array.isArray(j.tools) ? j.tools : [];
    clearChildren(toolSel);
    for (const t of tools) {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = t.name;
      toolSel.appendChild(opt);
    }
    onToolChange();
    setStatus(`${tools.length} tools loaded`, 'ok');
  } catch (e) {
    setStatus(String(e), 'error');
  }
}

function onToolChange() {
  const t = tools.find((x) => x.name === toolSel.value);
  desc.textContent = t?.description ?? '';
  const schema = t?.inputSchema;
  if (schema && typeof schema === 'object' && schema.properties) {
    const example = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      const required = Array.isArray(schema.required) && schema.required.includes(k);
      if (required) example[k] = hint(v);
    }
    args.value = JSON.stringify(example, null, 2);
  } else {
    args.value = '{}';
  }
}

function hint(v) {
  if (!v || typeof v !== 'object') return '';
  if (v.type === 'string') return '';
  if (v.type === 'number' || v.type === 'integer') return 0;
  if (v.type === 'boolean') return false;
  if (v.type === 'array') return [];
  return null;
}

async function run() {
  let parsed;
  try {
    parsed = JSON.parse(args.value || '{}');
  } catch (e) {
    setStatus(`invalid JSON: ${e.message}`, 'error');
    return;
  }
  runBtn.disabled = true;
  setStatus('running…');
  const t0 = performance.now();
  try {
    const r = await fetch('/api/call', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: toolSel.value, arguments: parsed }),
    });
    const j = await r.json();
    const ms = Math.round(performance.now() - t0);
    result.textContent = JSON.stringify(j, null, 2);
    if (r.ok) setStatus(`ok · ${ms}ms`, 'ok');
    else setStatus(`http ${r.status} · ${ms}ms`, 'error');
  } catch (e) {
    setStatus(String(e), 'error');
  } finally {
    runBtn.disabled = false;
  }
}

toolSel.addEventListener('change', onToolChange);
runBtn.addEventListener('click', run);
loadHealth();
loadTools();
setInterval(loadHealth, 10_000);
