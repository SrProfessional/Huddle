// Huddle: the questions a release may add after the first install (docs/design.md §17). `huddle update` asks only the ones a repo has not answered.
// An entry is { id, since, key, ask, options?, default?, needed(config) }:
//   since: the release that introduced it («0.5.0»); key: the huddle.json key its answer is written to (it must exist in huddle.schema.json);
//   needed(config): true while this repo still has to answer it (normally: the key is not set).
// 0.8.0 asks for the staging branch (Issue #109, docs/design.md §21) and for how the cloud labels job runs (Issue #121, §23). Each later release that needs a new answer adds its entry here.
export const QUESTIONS = [
  {
    id: 'staging-branch',
    since: '0.8.0',
    key: 'staging_branch',
    ask: 'Does the project have a staging (or QA) branch where changes are tested before they go to the default branch? Give its name, or none.',
    default: '',
    needed: (c) => !('staging_branch' in c),
  },
  {
    id: 'labels-job',
    since: '0.8.0',
    key: 'labels_job',
    ask: 'How should the cloud labels job run? sessions (the sessions keep the labels right, no cloud job), hourly (a safety net once an hour, recommended), or events (on every Issue, PR and comment: it uses a lot of CI minutes).',
    options: ['sessions', 'hourly', 'events'],
    default: 'hourly',
    needed: (c) => !('labels_job' in c),
  },
];

const parts = (v) => String(v ?? '0.0.0').split('.').map((n) => Number.parseInt(n, 10) || 0);

/** -1, 0 or 1: `a` against `b`, as major.minor.patch numbers. */
export function compareVersions(a, b) {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) ? 1 : -1;
  return 0;
}

/** The questions this repo still has to answer: newer than its `setup_version` (absent = 0.0.0) and still needed. */
export function pendingQuestions(config, registry = QUESTIONS) {
  return registry.filter((q) => compareVersions(q.since, config.setup_version ?? '0.0.0') > 0 && q.needed(config));
}

/** What a question looks like to the skill: no functions, so it can be printed as JSON. */
export const describe = (q) => ({ id: q.id, key: q.key, ask: q.ask, options: q.options ?? null, default: q.default ?? null });
