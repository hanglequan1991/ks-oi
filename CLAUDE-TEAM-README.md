# Claude multi-agent team

A small team of subagents that turns a request into stories, tasks, test cases, code and automation tests. The main Claude Code session is the **coordinator**; all state lives in `.team/`.

## Roles

| Agent | Model | Owns |
|---|---|---|
| product | sonnet | `.team/stories/STORY-<n>.md`; answers business questions |
| lead | sonnet | `.team/tasks/TASK-<n>.md`; reviews dev work; answers technical questions |
| pm | sonnet | `.team/board.md`, `.team/decision.md`; the only one that starts dev and qa |
| qalead | sonnet | `.team/testcases/TC-<n>.md`; reviews qa work |
| dev | haiku | code + unit tests, only in its task's file list (up to 4 in parallel) |
| qa | haiku | automation test code for one TC (one at a time) |

The workflow and rules are in `.claude/rules/team-coordinator.md`; each agent's prompt is in `.claude/agents/`.

## Install

1. Copy `.claude/`, `.team/` and this file into the repo root (they are already there if you are reading this in the repo).
2. Fill in `.team/config.md`: build, unit test and e2e commands, and where tests live. Agents stop when they hit a `TODO`.
3. Restart Claude Code (or run `/agents`) so the agents load. Check they appear.
4. Commit the files when you are happy with them.

## Use

Start Claude Code in the repo and paste a kickoff prompt:

```text
You are the coordinator of the team defined in .claude/rules/team-coordinator.md.
Read that file and .team/config.md and .team/board.md first.
Feature request: <describe the feature>.
Run the workflow: product writes the story, lead splits it into tasks, qalead writes test cases,
pm builds the board, then run dispatch rounds, reviews and QA until everything is done.
Stop and ask me on any blocked task, unanswered question or placeholder in config.
```

To continue later (agents have no memory), say: "Read `.team/board.md` and continue the workflow."

## Things to know

- Questions: an agent writes it under `## Questions` in its own file, sets `blocked: question` and stops. The coordinator routes business questions to product and technical ones to lead; the answer goes in the same file; pm logs significant answers in `decision.md`.
- A second rework on the same task or TC sets it to `blocked` and the coordinator escalates to you.
- Nothing is committed automatically; review `.team/` changes and code like any other diff.
- **Nested agents:** pm starts dev agents, but Claude Code subagents may not be able to spawn other subagents. If pm cannot dispatch devs, run pm as the main-thread agent instead (`claude --agent pm`) or have the coordinator start the devs pm selects. Verify this on a small story first.
- `autoCompactWindow: 100000` in dev and qa frontmatter was set as requested; confirm your Claude Code version honours it.
