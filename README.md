# agentrouter

Derive a repository's subagent roster from evidence — and say out loud which candidates should be skills or rules instead.

```bash
npx agentrouter scan     # analyse, propose, explain. writes nothing.
npx agentrouter init     # pick from the proposals and write them
```

No API key. No model call. Offline, deterministic, and testable against fixtures. An optional `--llm` pass can widen the candidate field without loosening the bar — see below.

## Why this exists

Most "generate agents for my repo" tools read your directories and emit `backend-agent`, `frontend-agent`, `database-agent`. Those are *locations*, not tasks — and the coding agent could already read those directories. You end up with ten agents nobody invokes and delete all of them within a week.

agentrouter starts from a harder claim: **a subagent only earns its existence by changing the outcome**, and there are exactly five mechanisms by which it can.

| Mechanism | The agent pays for itself because… |
|---|---|
| `context-isolation` | the task emits high-volume output that would otherwise pollute the main thread |
| `tool-scoping` | it needs a narrower or unusual tool set — most often read-only |
| `effort-tier` | it is mechanical enough for a cheaper model, or hard enough to deserve a better one |
| `durable-rubric` | its definition of done is stable across invocations and checkable |
| `parallelism` | it runs over N independent targets at once |

A candidate that satisfies none of these is not an agent. It is a **skill** (a procedure, same context) or a **rule** (a constraint that applies always, not on invocation). agentrouter refuses to generate it and tells you which one it should be:

```
  ✕ api-docs-writer — This is a skill, not an agent.
    with no machine-readable interface definition there is no rubric to check the
    prose against, and documentation written without the surrounding context of
    the main thread is usually worse, not better
    unsatisfied: durable-rubric (…); context-isolation (…)
```

## What it reads

Language detection is the weakest possible signal and the one most tools stop at. What actually predicts a useful agent:

| Probe | What it reveals |
|---|---|
| `ci-workflows` | Jobs someone already decided were worth naming, gating, and repeating |
| `build-commands` | The verification loop — every generated agent gets a real command, not a guess |
| `git-history` | Commit taxonomy and churn: *what work actually repeats here* |
| `enforcement` | Rules already mechanised — agents call these rather than restating them |
| `repo-rules` | What `CLAUDE.md`/`AGENTS.md` already say, so agents reference instead of duplicating |
| `topology` | Size, test suites, migrations, workspace packages, API surface |

`git-history` is the differentiator. Static analysis says what a repo *is*; history says what work recurs in it, which is what decides whether an agent is ever invoked twice.

## The spec is the source of truth

```
.agentrouter/roster.json     ← specs, evidence, provenance, your corrections
.claude/agents/*.md       ← build output. regenerable.
AGENTS.md                 ← managed block; everything outside it is yours
```

Tuning writes to the **spec**, never to rendered markdown:

```bash
npx agentrouter tune test-triage --constraint "never re-run the full suite to check one class"
```

Corrections are appended as *standing corrections* that render last and win on conflict. They are never folded into the generated prose — a correction rewritten into the body is a correction that silently disappears on the next regeneration, which is the failure that makes hand-tuned generated agents drift back to their original behaviour after a few edits.

Hand-written notes below the `<!-- agentrouter:user -->` marker in any agent file are preserved verbatim across renders.

## Lifecycle

```bash
npx agentrouter scan --evidence         # full evidence trail behind every proposal
npx agentrouter init                    # select → diff preview → confirm → write
npx agentrouter tune <id> --constraint "..."
npx agentrouter refresh                 # dry run: what has changed since?
npx agentrouter refresh --apply --prune # reconcile, retiring what lost its evidence
npx agentrouter render --check          # CI: fail if rendered files have drifted
```

Because each spec records the evidence that justified it, `refresh` can tell the difference between an agent that has drifted and one whose *reason for existing* has gone away:

```
  + docs-contract-keeper — newly justified
  ~ test-triage — evidence or generated body changed
    - ci-workflows:long-running-job@.github/workflows/ci.yml:8
    1 standing correction(s) will be preserved.
  - ci-failure-analyst — no longer justified by any evidence
```

`render` is idempotent and safe in CI: commit `.agentrouter/roster.json`, gitignore the rendered files, regenerate on checkout.

## Optional: letting a model widen the field

The catalog can only judge candidates it already knows. `--llm` adds a pass where a model proposes archetypes the catalog would miss — **without loosening the bar**:

```bash
npm install @anthropic-ai/sdk        # optional peer; the default path never needs it
npx agentrouter scan --llm
```

The safety property is the point. The model is sent **only the evidence records** — never your source — and every claim it makes must cite evidence refs verbatim. Those citations are then resolved against the real records, and the proposals go through the *same* mechanism gate as the catalog:

- Cite a ref that doesn't exist → that claim is supported by nothing and cannot admit the agent.
- Fabricate every citation → the proposal is discarded before the gate sees it.
- Claim a mechanism that isn't one of the five → rejected.
- Collide with a catalog id, or ask for no tools → discarded.

So the model widens the field of candidates; it never widens the bar. Six tests pin this, including the mixed case where one real claim and one fabricated claim appear on the same proposal — only the evidenced mechanism is credited.

Everything else stays offline: `--llm` is the *only* command that makes a network call, and the SDK is an optional peer dependency, so a plain `npx agentrouter` still installs nothing.

## Options

| Flag | Effect |
|---|---|
| `-C, --root <dir>` | Repository root (default: cwd) |
| `--budget <n>` | Max agents proposed (default: 5). Over-budget candidates are *reported*, never silently dropped |
| `--emitters <list>` | `claude-code`, `agents-md` (default: both) |
| `--evidence` | `scan`: every supporting record, not just the first two |
| `--json` | `scan`: machine-readable output |
| `-y, --yes` | `init`: accept all proposals, no prompts |
| `--check` | `render`: report drift, exit non-zero, write nothing |
| `--apply` / `--prune` | `refresh`: write the reconciliation / remove retired agents |
| `--llm` | `scan`: let a model propose extra archetypes, still subject to the gate |
| `--llm-model` / `--llm-effort` | `scan`: override the model (default `claude-opus-5`) or effort (default `high`) |

## Honest limits

- **Emitter reach.** Neutrality is real at the *spec* level, but "agent" as a file format barely exists outside Claude Code today. `claude-code` is the rich emitter; `agents-md` writes a document of record. More will be added when the targets are worth writing for.
- **The catalog is finite** — nine archetypes. Without `--llm`, a genuinely novel agent for an unusual repo will not be invented; with it, the model can propose one but still has to clear the same gate.
- **CI parsing is targeted, not a full YAML parse.** The conventional two-space GitHub Actions layout is recognised; exotic formatting is skipped rather than guessed at.
- **No usage telemetry.** Retirement is driven by disappearing *evidence*, not by whether you actually invoked the agent.

## Development

```bash
npm install
npm run build
npm test        # 30 tests over real on-disk git fixtures
```

Fixtures are real directories with real git history, because the probes read both and mocking either would stop testing the part most likely to break.

### It runs on itself

CI does more than run the tests: it runs agentrouter against this repository and fails if the committed agents no longer match their roster (`render --check`), or if the repository has drifted far enough to justify a different roster (`refresh`).

Dogfooding earned its keep immediately. The first self-scan proposed `package-fanout` for this single-package repo, justified by a Node **version** matrix in CI — the same work across two runtimes, which is not N independent fan-out targets. Fixing it surfaced a second bug (one CI job counted under two evidence kinds satisfied a two-job threshold) and a design rule now enforced across the catalog:

> The gate admits on **any** satisfied claim, so an archetype's loosest claim is its real admission bar. Every claim must independently justify the agent's existence.

## Licence

MIT
