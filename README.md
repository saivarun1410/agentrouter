# agentfit

Derive a repository's subagent roster from evidence — and say out loud which candidates should be skills or rules instead.

```bash
npx agentfit scan     # analyse, propose, explain. writes nothing.
npx agentfit init     # pick from the proposals and write them
```

No API key. No model call. Offline, deterministic, and testable against fixtures.

## Why this exists

Most "generate agents for my repo" tools read your directories and emit `backend-agent`, `frontend-agent`, `database-agent`. Those are *locations*, not tasks — and the coding agent could already read those directories. You end up with ten agents nobody invokes and delete all of them within a week.

agentfit starts from a harder claim: **a subagent only earns its existence by changing the outcome**, and there are exactly five mechanisms by which it can.

| Mechanism | The agent pays for itself because… |
|---|---|
| `context-isolation` | the task emits high-volume output that would otherwise pollute the main thread |
| `tool-scoping` | it needs a narrower or unusual tool set — most often read-only |
| `effort-tier` | it is mechanical enough for a cheaper model, or hard enough to deserve a better one |
| `durable-rubric` | its definition of done is stable across invocations and checkable |
| `parallelism` | it runs over N independent targets at once |

A candidate that satisfies none of these is not an agent. It is a **skill** (a procedure, same context) or a **rule** (a constraint that applies always, not on invocation). agentfit refuses to generate it and tells you which one it should be:

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
.agentfit/roster.json     ← specs, evidence, provenance, your corrections
.claude/agents/*.md       ← build output. regenerable.
AGENTS.md                 ← managed block; everything outside it is yours
```

Tuning writes to the **spec**, never to rendered markdown:

```bash
npx agentfit tune test-triage --constraint "never re-run the full suite to check one class"
```

Corrections are appended as *standing corrections* that render last and win on conflict. They are never folded into the generated prose — a correction rewritten into the body is a correction that silently disappears on the next regeneration, which is the failure that makes hand-tuned generated agents drift back to their original behaviour after a few edits.

Hand-written notes below the `<!-- agentfit:user -->` marker in any agent file are preserved verbatim across renders.

## Lifecycle

```bash
npx agentfit scan --evidence         # full evidence trail behind every proposal
npx agentfit init                    # select → diff preview → confirm → write
npx agentfit tune <id> --constraint "..."
npx agentfit refresh                 # dry run: what has changed since?
npx agentfit refresh --apply --prune # reconcile, retiring what lost its evidence
npx agentfit render --check          # CI: fail if rendered files have drifted
```

Because each spec records the evidence that justified it, `refresh` can tell the difference between an agent that has drifted and one whose *reason for existing* has gone away:

```
  + docs-contract-keeper — newly justified
  ~ test-triage — evidence or generated body changed
    - ci-workflows:long-running-job@.github/workflows/ci.yml:8
    1 standing correction(s) will be preserved.
  - ci-failure-analyst — no longer justified by any evidence
```

`render` is idempotent and safe in CI: commit `.agentfit/roster.json`, gitignore the rendered files, regenerate on checkout.

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

## Honest limits

- **Emitter reach.** Neutrality is real at the *spec* level, but "agent" as a file format barely exists outside Claude Code today. `claude-code` is the rich emitter; `agents-md` writes a document of record. More will be added when the targets are worth writing for.
- **The catalog is finite.** Nine archetypes. A genuinely novel agent for an unusual repo will not be invented — the gate can only judge candidates it knows. An optional `--llm` pass that proposes additions (still subject to the same mechanism gate) is the planned extension.
- **CI parsing is targeted, not a full YAML parse.** The conventional two-space GitHub Actions layout is recognised; exotic formatting is skipped rather than guessed at.
- **No usage telemetry.** Retirement is driven by disappearing *evidence*, not by whether you actually invoked the agent.

## Development

```bash
npm install
npm run build
npm test        # 24 tests over real on-disk git fixtures
```

Fixtures are real directories with real git history, because the probes read both and mocking either would stop testing the part most likely to break.

### It runs on itself

CI does more than run the tests: it runs agentfit against this repository and fails if the committed agents no longer match their roster (`render --check`), or if the repository has drifted far enough to justify a different roster (`refresh`).

Dogfooding earned its keep immediately. The first self-scan proposed `package-fanout` for this single-package repo, justified by a Node **version** matrix in CI — the same work across two runtimes, which is not N independent fan-out targets. Fixing it surfaced a second bug (one CI job counted under two evidence kinds satisfied a two-job threshold) and a design rule now enforced across the catalog:

> The gate admits on **any** satisfied claim, so an archetype's loosest claim is its real admission bar. Every claim must independently justify the agent's existence.

## Licence

MIT
