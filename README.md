# Move37

## Technical Assessment

This repository is used as an AI-augmented technical assessment for software engineers.

The goal is not to measure who can hand-code the fastest. The goal is to understand how a candidate approaches a real engineering problem in a realistic environment: how they break down the task, how they use coding agents, how they evaluate AI output, how they validate the result, and how they communicate tradeoffs and decisions.

Candidates are expected to work on a bounded GitHub issue, use AI assistance as part of their workflow, and submit a pull request that shows both the outcome and the thinking behind it. We are looking for strong systems thinking, sound engineering judgment, and the ability to partner effectively with modern tools.

This assessment is intentionally run in a public GitHub repository because it better reflects day-to-day software engineering than a puzzle or whiteboard exercise. It lets candidates work in a native environment with real issues, real constraints, and real review artifacts.

If you are completing this exercise, start by reading the section called `The Exercise` below. If you want to understand the product and the technical landscape first, the rest of this README introduces Move37 and its current state.

**Move37 is a personal planning system built around self-knowledge.**

We are not always the best at estimating how long things take to be completed — this is not only due to unforeseen circumstances, but also because we do not know our own behaviour well enough: what drains us, what motivates us, what our real pace is versus our optimistic one.

Move37 brings together personal notes and reflections, calendar commitments, a history of calendar behaviour, and financial behaviour to help us understand our own patterns. Over time, it learns what "I'll finish this by Friday" actually means for each of us individually — and helps us plan accordingly. Used in a team, it turns that self-knowledge into better coordination and productivity.

The system is AI-native: every piece of information becomes something an agent can reason over to assist with informed decisions.

<img width="2068" height="1103" alt="image" src="https://github.com/user-attachments/assets/714165fb-52fc-4964-909d-8d310a62a468" />

<img width="2068" height="1188" alt="image" src="https://github.com/user-attachments/assets/9c116541-e598-4e36-a52c-03ca7a38feb3" />


<img width="2068" height="1103" alt="image" src="https://github.com/user-attachments/assets/983dced0-f8ab-47ed-b7c0-d89e9ee52ec0" />



## Current State

Move37 already has a meaningful system shape. The repository contains a React web app, a FastAPI backend, a JavaScript SDK, an internal AI service for semantic search and grounded chat, a notes worker, and deployment scaffolding. If you want the technical overview, see the [architecture guide](./contributing-docs/docs/architecture.md).

Several important capabilities are present in early form and are still being hardened end to end:

- **Apple Calendar sync**: account management, sync, and reconciliation flows exist, but the full user journey still needs validation, polish, and stronger end to end coverage
- **Scheduling engine**: there is a deterministic dependency-aware planning baseline today, but the richer scheduling logic is still to come
- **OpenBanking**: financial behaviour data is not yet ingested or connected
- **Notes, embeddings, and semantic retrieval**: notes CRUD, import, search, and grounded chat are wired, but the ingestion and retrieval path is still maturing operationally

Many features can be explored with the core web and API stack alone, but some paths, especially note retrieval and grounded chat, depend on the internal AI service, the notes worker, and supporting infrastructure being available locally.

These are the areas where the product has the most ground to cover, and where many of the most interesting contributions live.

---

## The Exercise

This exercise is designed to reflect how software engineering is increasingly practiced in an AI-augmented environment.

You are not being assessed on whether you hand-write every line of code yourself. You are being assessed on how you approach a bounded engineering problem in a real repository: how you understand the system, how you choose scope, how you work with coding agents, how you validate what they produce, and how you communicate the quality and limitations of the final result.

In practical terms, the exercise is simple:

1. Choose an open GitHub issue that interests you
2. Work it through end to end in your own fork
3. Use coding agents as part of your workflow where helpful
4. Submit a pull request that shows both the outcome and the reasoning behind it

We are particularly interested in signals such as:

- how well you understand the architectural intent of an existing system
- how effectively you break work into safe, testable steps
- how thoughtfully you prompt, review, and correct AI-generated output
- how well you validate behavior rather than assuming it is correct
- how clearly you explain tradeoffs, limitations, and next steps

This is why the exercise runs in a public GitHub repository rather than as a puzzle or whiteboard task. It gives you a native environment with realistic constraints, existing code, issue threads, and review artifacts. That setting gives us a better signal of engineering judgment than a synthetic interview problem.

Anonymity is a hard requirement. Please use an anonymous GitHub account for your fork and pull request. Revealing your identity to reviewers will automatically disqualify the submission.

The submission guide in `.github/pull_request_template.md` is part of the exercise. It asks you to document validation steps, prompt history, and important AI mistakes and corrections. Those are not extras. They are part of how we evaluate the work.

---

## Contributing

See [`contributing-docs/`](./contributing-docs/) for setup details, environment variables, and service configuration. Start with `docs/intro.md`.
