# Move37

**Move37 is a personal planning system built around self-knowledge.**

We are not always the best at estimating how long things take to be completed — this is not only due to unforeseen circumstances, but also because we do not know our own behaviour well enough: what drains us, what motivates us, what our real pace is versus our optimistic one.

Move37 brings together personal notes and reflections, calendar commitments, a history of calendar behaviour, and financial behaviour to help us understand our own patterns. Over time, it learns what "I'll finish this by Friday" actually means for each of us individually — and helps us plan accordingly. Used in a team, it turns that self-knowledge into better coordination and productivity.

The system is AI-native: every piece of information becomes something an agent can reason over to assist with informed decisions.

<img width="2068" height="1103" alt="image" src="https://github.com/user-attachments/assets/714165fb-52fc-4964-909d-8d310a62a468" />

<img width="2068" height="1103" alt="image" src="https://github.com/user-attachments/assets/983dced0-f8ab-47ed-b7c0-d89e9ee52ec0" />



## Current State

The web UI is in good shape. The backend is partially wired. Several core capabilities are still under active development:

- **Apple Calendar sync** — the integration exists but is not yet fully connected end to end
- **Scheduling engine** — the logic for reasoning about dependencies, timing, and estimated completion is not yet implemented
- **OpenBanking** — financial behaviour data is not yet ingested or connected
- **Note embeddings** — personal reflections are not yet embedded for semantic search

These are the areas where the product has the most ground to cover, and where the most interesting contributions live.

---

## The Exercise

This repository is used as a hiring exercise for Roche gRED software engineers.

Browse the [open issues](https://github.com/Genentech/Move37/issues) and pick one that interests you. There is no obligation to pick the smallest one — a more ambitious issue will make for a more interesting conversation.

**Steps:**

1. Fork this repository **anonymously** (disclosing your identity to the reviewers will automatically disqualify you)
2. Pick a GitHub issue or several and work on them end to end
3. Use coding agents as part of your workflow — this is expected and encouraged
4. Open a pull request against this repository
5. Follow the submission guide in `.github/pull_request_template.md`

Each issue is designed to be completable in roughly 1–2 hours. You can use the issue thread to ask questions or discuss your approach with the hiring team.

---

## Contributing

See `contributing-docs/` for setup details, environment variables, and service configuration.
