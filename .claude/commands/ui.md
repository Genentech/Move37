---
allowed-tools: Agent, Bash, Read, Write, Edit, Glob, Grep, EnterWorktree, ExitWorktree
---

UI styling skill for Move37.

Work on visual-only changes to the web UI -- colours, shapes, spacing, typography, layout, transitions, and other purely cosmetic adjustments that do not alter application logic or touch backend components.

## Task

$ARGUMENTS

## Worktree lifecycle

Before starting any implementation work, call `EnterWorktree(name=<branch-name>)` to create an isolated worktree and switch the session into it. Inside the worktree, rename the branch and push:

```
git branch -m <branch-name>
git push -u origin HEAD
```

When the work is complete, call `ExitWorktree(action=remove)` to return to the main directory and remove the worktree, then `git pull` to sync the default branch.

## Guidance

This skill is scoped exclusively to the front-end presentation layer. Changes should never alter data flow, API contracts, SDK hooks, or backend services. If a request would require changes outside the UI layer, flag it and stop.

### Relevant files

1. **CSS custom properties and component styles** -- `src/move37/web/src/App.css`. This is the primary stylesheet. Design tokens (colours, backgrounds, borders) are defined as CSS custom properties on `.app-shell` (e.g. `--bg0`, `--accent`, `--text-main`, `--scheduled`, `--working`).
2. **Base/reset styles** -- `src/move37/web/src/index.css`. Root font size (`17px`), font family stack (`IBM Plex Sans`), and global resets.
3. **Application shell and inline styles** -- `src/move37/web/src/App.jsx`. Contains inline style computations (e.g. `getLevelShellStyle` for procedural colour generation) and the full JSX structure of the app.
4. **Surface components** -- `src/move37/web/src/surfaces.jsx`. Markup for task lists, calendar surfaces, and other panels.
5. **Graph layout helpers** -- `src/move37/web/src/graph.js`. Visual positioning logic (Fibonacci sphere, rotations, layout computation).

### Design system notes

- Dark theme with deep navy backgrounds (`#050814` base) and cyan/teal accents (`#8ee8ff`).
- Three font families: `Sora` (brand headings), `IBM Plex Mono` (labels/buttons), `IBM Plex Sans` (body text).
- Buttons use pill shapes (`border-radius: 999px`) with translucent borders and hover lift (`translateY(-1px)` + glow `box-shadow`).
- Transitions are typically 160-240ms with `ease` timing.
- The colour palette includes semantic tokens: `--scheduled` (green), `--working` (gold), `--accent` (cyan).

### Stack

- React 18 with Vite 5 (no CSS-in-JS, no Tailwind -- plain CSS files).
- No component library; all components are hand-rolled.
- No test runner configured for the web package itself.

Use the analyst, engineer, and tester agents under `.claude/agents/ui-*.md` for structured work on this skill.
