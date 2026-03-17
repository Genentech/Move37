# Move37

Move37 is a prototype human operating system for the AI age: a system designed to help a person stay organized, protect focus, and make steady progress toward their goals. In this repo, it currently takes the form of:

- a FastAPI backend for auth, activity-graph, notes, and chat workflows
- a React web app for exploring and editing the graph
- a small Node SDK for client access to the API
- MCP endpoints for agent-facing interactions

## Features

The current codebase includes:

- bearer-authenticated REST endpoints under `/v1/*`
- an activity graph with dependency and schedule derivation rules
- note creation, update, text import, and semantic note search
- chat sessions backed by the AI service
- a browser-based graph UI
- a Node SDK with API client and React hooks
- local Docker Compose infrastructure for the app stack

## Hiring Exercise

This repository is used as a hiring exercise for Roche gRED software engineers.

Candidates are expected to:

- pick up a scoped GitHub issue
- use coding agents as part of their workflow
- fork this repository anonymously
- complete the issue end to end
- open a PR against this repository
- follow the submission expectations in [.github/pull_request_template.md](/Users/pereid22/source/penrose-lamarck/.github/pull_request_template.md)

Each issue should take about 1-2 hours to solve. Candidates can use the issue threads to discuss the work with the hiring team.

## Documentation

There are two docs tracks in the repo:

- `contributing-docs/` for contributor-facing documentation
- `fern/` for public API, SDK, and CLI documentation
