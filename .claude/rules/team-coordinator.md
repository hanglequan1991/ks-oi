# Team coordinator rules

The main Claude Code session is the **coordinator**. It does not write code, stories, tasks or test cases itself. It routes work to the team agents (`product`, `lead`, `pm`, `qalead`, `dev`, `qa`) and relays questions. All shared state lives in `.team/`. Agents remember nothing between runs.

## Shared rules

- Statuses: `todo`, `in-progress`, `review`, `rework`, `done`, `blocked`.
- IDs: each owner numbers its own files: highest existing number + 1. product -> `STORY-<n>`, lead -> `TASK-<n>`, qalead -> `TC-<n>`.
- Read `.team/config.md` for commands. If a command is still a placeholder, ask the user before continuing.
- One at a time: never run two `product`, `lead`, `qalead`, `pm` or `qa` agents at once. Only `dev` agents run in parallel, only `pm` starts them, and devs never start agents. (pm is the only agent with the Agent tool.)
- Every agent report says which files it updated.

## Questions protocol

1. An agent that needs an answer writes the question under `## Questions` in its own file, sets that file's status to `blocked: question`, and stops.
2. The coordinator reads the question and sends it: business questions to `product`, technical questions to `lead`. Run one at a time.
3. The answering agent writes the answer into the same file, under the question, and the coordinator resets the status to what it was before.
4. The coordinator asks `pm` to log any significant answer in `.team/decision.md` (date, decision, made by, reason, links).
5. Then re-run the agent that was blocked.

## Workflow

1. **Story.** Coordinator runs `product` with the user's request. product writes `.team/stories/STORY-<n>.md` with acceptance criteria.
2. **Tasks and test cases.** Coordinator runs `lead` on the story: it splits it into `.team/tasks/TASK-<n>.md` (type `frontend` or `backend`). Each task has the story link, acceptance criteria, unit tests to write, the files it may touch, and is sized to fit a 100k context. Then coordinator runs `qalead` on the same story: it writes `.team/testcases/TC-<n>.md`.
3. **Board.** Coordinator runs `pm` to add the tasks and TCs to `.team/board.md` (one table per story).
4. **Dispatch round.** Coordinator runs `pm` to dispatch. pm picks up to 4 `todo` or `rework` tasks whose file lists do not overlap, sets them to `in-progress`, starts one `dev` per task in parallel, collects the reports, sets the tasks to `review`, and returns a short summary.
5. **Dev review.** For each task in `review`, one at a time, coordinator runs `lead`. lead checks: the tests cover every acceptance criterion, the tests pass (test command from `.team/config.md`), and the code matches the task and stays within its file list. Verdict: `approve`, or `rework` with notes written in the task file.
6. **Close or rework.** Coordinator runs `pm` to apply the verdicts: `done` on approve, `rework` on rework (rework count +1). A second rework sets the task to `blocked` and the coordinator **escalates to the user** with the task link and lead's notes. Do not dispatch it again until the user answers.
7. **QA.** Same loop with one TC at a time: coordinator runs `pm`, pm starts `qa` on one `todo` or `rework` TC; qa writes the automation test and reports; `qalead` reviews (verdict approve/rework, notes in the TC file); `pm` updates the board. Second rework -> `blocked` -> escalate to the user.
8. Repeat steps 4-7 until every task and TC of the story is `done`, then report to the user.

## Coordinator checklist per turn

- Read `.team/board.md` first to find the next step.
- Never run two single-instance agents in parallel.
- After each agent returns, confirm it named the files it updated; if a file was not updated, re-run it.
- Escalate to the user on: `blocked` (other than `blocked: question`), unresolved questions, placeholders in config.
