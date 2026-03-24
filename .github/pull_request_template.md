This pull request template is part of the technical assessment. It is used to evaluate both the quality of the solution and how you approached the work.

Do not reveal your identity in this PR. Candidates must use an anonymous GitHub account for the exercise.

## Acceptance Criteria Coverage
Describe which issue acceptance criteria you believe are:

- completed
- partially completed
- not completed

Example:

    Completed: authenticated graph reads and default graph bootstrap behavior.
    Partially completed: MCP transport is wired end to end, but only core tools were validated manually.
    Not completed: no additional observability dashboards were added.

## Validation
List the checks you performed before opening this PR.

Example:

```bash
PYTHONPATH=src python -m unittest discover -s src/move37/tests -t src
cd src/move37/sdk/node && npm test
cd src/move37/web && npm run build
docker compose up -d --build db api web
curl -s http://localhost:18080/health
```

Include any relevant output snippets, screenshots, or example requests/responses.

Example:

    Python tests: 8 passed
    SDK tests: 2 passed
    Web build: vite build completed successfully
    Manual check: GET /v1/auth/me returns the configured subject for a valid bearer token

## Prompt History
List the key prompts and exploratory questions you used with your coding assistant, in chronological order.

Example:

    Prompt 0: Explain the relationship between the REST API, MCP routes, and the activity graph services.
    Prompt 1: Identify the minimum schema and repository changes needed for graph-scoped activity nodes.
    Prompt 2: Propose tests for graph bootstrap, bearer auth, and service-level graph mutations.
    Prompt 3: Review the compose stack and suggest the smallest safe change to validate the web container.

Include prompts that helped you understand the problem space, shape the implementation, or validate the result. This can include exploratory questions such as terminology, architecture, or workflow clarification.

Prefer the prompts that materially changed your understanding, plan, implementation, or validation strategy.

Do not include assistant responses in this section. If an assistant response was wrong in an important way, describe it in `AI Mistakes And Corrections` instead.

Do not include secrets, tokens, or irrelevant prompts that had no bearing on your final work.

## AI Mistakes And Corrections
Describe any assistant suggestions that were wrong, incomplete, or misleading, and explain how you corrected them.

Examples:

    Issue: The assistant proposed bypassing the repository layer and mutating SQLAlchemy models directly in the router.
    Correction: I kept the change in the service and repository layers so REST and MCP behavior stayed aligned.

    Issue: The assistant suggested validating only the container startup path.
    Correction: I added direct Python and SDK test coverage so core behavior is checked without depending on Docker.

## Change Of Direction
[optional] If you started from one issue and ended up solving another problem,
explain:

- the issue you started from
- what you discovered
- why you changed direction
- why the final scope was the better use of time

Example:

    I started from a UI issue but found that the graph API schema was missing the fields required to render the new state reliably. I chose to fix the API contract first because it unblocked both the web client and the SDK and produced a cleaner validation path.

## Limitations And Deferred Work
Document any important limitations, edge cases, tradeoffs, follow-up ideas, or improvements you noticed but did not address.

Example:

    The happy path is covered by tests, but I did not add concurrency coverage for overlapping sync operations.
    The UI now supports manual reconnect, but error copy and recovery states could still be improved.

## Candidate Checklist
- [ ] I explained which issue acceptance criteria were completed, partially completed, or not completed.
- [ ] I validated the change with tests and/or manual checks.
- [ ] I included the key prompts and exploratory questions that materially influenced the work.
- [ ] I documented any important assistant mistakes and how I corrected them.
- [ ] If I changed direction, I explained why.
- [ ] I documented any limitations, deferred work, edge cases, or improvements I noticed but did not address.
- [ ] I did not reveal my identity in this PR.
