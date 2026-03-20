# Move37

Move37 is a prototype AI-native planning product.

The simplest way to understand it today is this:

Move37 is trying to become the place where a person manages their calendar by creating activities inside Move37 itself, then letting Move37 structure the calendar for them.

The product goal at the moment is not just to store tasks. It is to:

- turn activities into a structured plan
- sync that plan to connected Apple or Google calendars
- continuously reason about dependencies, timing, and sequencing
- help estimate whether a project or set of tasks is on track to complete

From a product perspective, Move37 is currently centered on calendar management.

A user creates activities in Move37, and Move37 is intended to push those activities into the connected Apple or Google calendar layer while also reorganizing the calendar with AI. The point is that the calendar is not treated as a flat list of events. It is treated as a structured, evolving network of work, so that completion of a project can be estimated continuously as tasks change, start, finish, split, or move.

The calendar can then be explored through different visualizations rather than only through a standard agenda:

- graph views for dependencies and structure
- alternative spatial views of the same activity network
- task-list views for a simpler operational perspective
- calendar-oriented views for what is actually scheduled in time

In this repo, that product currently takes the form of:

- a FastAPI backend for auth, graph, notes, calendar, chat, and MCP workflows
- a React web app for exploring and editing the activity network
- a small Node SDK for client access to the API
- MCP endpoints for agent-facing interactions, including note-grounded chat

## Features

The current codebase includes:

- bearer-authenticated REST endpoints under `/v1/*`
- an activity graph with dependency and schedule derivation rules
- note creation, update, text import, and semantic note search
- Apple Calendar integration endpoints plus calendar-provider abstractions in the codebase
- a browser-based graph UI
- a Node SDK with API client and React hooks
- note-grounded chat through MCP clients such as ChatGPT
- local Docker Compose infrastructure for the app stack

## What A Candidate Should Picture

If you know nothing about the project, picture Move37 as a planning system where:

- every activity is a node in a graph
- edges express how work depends on other work
- schedule relationships are derived from dates rather than treated as arbitrary links
- that graph is used to shape calendar behavior, not just to visualize work after the fact

The product is trying to answer questions like:

- What has to happen before this task can start?
- If this slips, what else moves?
- Which parts of the calendar are structurally critical?
- Are we still on track to complete the larger project?

## What You Can Do In The Graph Network

The graph is not read-only. It is an editable planning surface.

At the moment, the product supports these core graph operations:

- view the current activity graph
- create a new activity
- create a new activity with parent dependencies
- insert a new activity between an existing parent and child
- update an activity's title, notes, dates, and effort or time fields
- start work on an activity
- stop work on an activity
- fork an existing activity
- delete an activity
- delete an activity subtree
- replace the dependency parents of an activity
- delete a dependency edge

There are also a few important rules:

- schedule edges are derived from `startDate`, so they are not edited manually in the same way dependency edges are
- note-backed nodes exist in the graph, but they are managed through the notes APIs rather than the activity mutation APIs
- graph changes are meant to affect downstream planning behavior, not just the picture on screen

## Calendar Direction

The current product direction is that creating and updating activities in Move37 should keep the connected calendar in sync while preserving Move37's richer planning model.

That means the external calendar is treated as an execution surface, while Move37 remains the place where structure lives:

- dependencies
- project shape
- AI-assisted reorganization
- estimated completion reasoning
- multiple ways of seeing the same plan

In other words, the calendar is one output of Move37, not the whole model.

## Hiring Exercise

This repository is used as a hiring exercise for Roche gRED software engineers.

Candidates are expected to:

- pick up a scoped GitHub issue
- use coding agents as part of their workflow
- fork this repository anonymously
- complete the issue end to end
- open a PR against this repository
- follow the submission expectations in [.github/pull_request_template.md](/Users/pereid22/source/move37/.github/pull_request_template.md)

Each issue should take about 1-2 hours to solve. Candidates can use the issue threads to discuss the work with the hiring team.

## Repo Structure

The most important parts of the repository are:

- `src/move37/api` for the FastAPI backend
- `src/move37/services` for the main application logic
- `src/move37/web` for the React web client
- `src/move37/sdk/node` for the JavaScript SDK
- `src/move37/rag` for semantic note search and grounded chat
- `src/move37/worker` for background note embedding
- `compose.yml` for the local multi-service stack

## Documentation

There are two docs tracks in the repo:

- `contributing-docs/` for contributor-facing documentation and onboarding
- `fern/` for public API, SDK, and CLI documentation
