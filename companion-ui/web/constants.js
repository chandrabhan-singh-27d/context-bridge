export const AI_TOOLS = new Set(['auto_triage', 'scan_repo', 'propose_fix', 'triage_pr', 'summarize_issue']);

export const FIELD_HINT = {
  number:       'PR or issue number (e.g. 27)',
  ref:          'Branch name or commit SHA',
  path:         'File path to filter by',
  relevantPaths:'Array of file paths to include for LLM context',
  baseBranch:   'Base branch for the fix PR (defaults to repo default)',
  maxFixes:     'Max issues to auto-fix (default 3)',
  createIssues: 'Create GitHub issues for each finding (true/false)',
};

export const FIELD_EXAMPLE = {
  maxFixes:      3,
  relevantPaths: '["src/auth.ts", "src/utils.ts"]',
  baseBranch:    '"main"',
  draft:         true,
};

export const TOOL_META = {
  scan_repo:     { title: 'Scan Repository',      summary: 'AI scans open issues, PRs, CI runs & recent commits to find bugs, security risks and maintenance items.' },
  auto_triage:   { title: 'Auto-Scan & Fix',      summary: 'Full auto-pipeline: scan repo, file issues, generate patches, create draft PRs, add self-review. One click.' },
  summarize_issue:{title: 'Summarize Issue',      summary: 'AI reads an issue and produces a summary, suggested labels, and recommended next steps.' },
  triage_pr:     { title: 'Review Pull Request',  summary: 'AI reviews a PR diff and metadata: risk assessment, labels, and reviewer notes.' },
  propose_fix:   { title: 'Propose Fix for Issue',summary: 'AI reads an issue, generates a patch, then creates a branch + draft PR that closes the issue.' },
};
