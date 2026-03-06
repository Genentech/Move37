## Validation
List the checks you performed before opening this PR.

Example:

```bash
pytest
python tests/mcp/fastmcp_client.py --sse-url http://localhost:8080/v1/mcp/sse
```

Include any relevant output snippets, screenshots, or example requests/responses.

Example:
- `pytest`: 18 passed
- Manual check: completed session returns no next exercise and cannot accept a new submission

## Prompt History
List the key prompts and exploratory questions you used with your coding assistant, in chronological order.

Example:

    Prompt 0: What is MCP, and how is it used in this repository?
    Prompt 1: Review the practice session flow in `practice_service.py` and identify where invalid
    and terminal states are not handled explicitly.
    Prompt 2: Propose a minimal refactor that keeps REST and MCP behavior aligned and avoids changing
    unrelated services.
    Prompt 3: Suggest tests for unknown session, completed session, and invalid exercise submission.

Include prompts that helped you understand the problem space, shape the implementation, or validate the result. This can include exploratory questions such as terminology, architecture, or workflow clarification.

Do not include assistant responses in this section. If an assistant response was wrong in an important way, describe it in `AI Mistakes And Corrections` instead.

Do not include secrets, tokens, or irrelevant prompts that had no bearing on your final work.

## AI Mistakes And Corrections
Describe any assistant suggestions that were wrong, incomplete, or misleading, and explain how you corrected them.

Examples:

    Issue: The assistant treated an unknown session the same as a completed session.
    Correction: I introduced a distinct not-found path so invalid session IDs do not look like
    successful terminal states.

    Issue: The assistant suggested tests only for the happy path.
    Correction: I added tests for repeated submission, completed sessions, and invalid
    session/exercise combinations.

## Candidate Checklist
- [ ] The implementation satisfies the issue(s) acceptance criteria.
- [ ] I validated the change with tests and/or manual checks.
- [ ] I included the key prompts and exploratory questions that materially influenced the work.
- [ ] I documented any important assistant mistakes and how I corrected them.
