# LegislaNet (PDSI2)

![Project Type](https://img.shields.io/badge/project-academic-blue)
![Status](https://img.shields.io/badge/status-active%20development-yellow)
![Web Scope](https://img.shields.io/badge/web-sprint%201-2%20implemented-0A66C2)
![Backend Scope](https://img.shields.io/badge/backend-auth--only%20runtime-orange)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![Flutter](https://img.shields.io/badge/flutter-tablet_app%20present-02569B?logo=flutter&logoColor=white)

LegislaNet is an academic digital legislative management platform for city councils, developed as the PDSI2 capstone project. This repository contains the project deliverables for Sprint 1 and Sprint 2 (web), and provides a developer-oriented runtime to exercise authentication flows and UI workflows using a mock API layer.

## Table of contents

- Overview
- Features
- Architecture & modules
- Getting started (dev)
- Development workflows
- Testing
- Deployment notes
- Contribution & code standards
- Project contacts

---

## Overview

LegislaNet aims to provide a lightweight, modular platform for managing city council sessions, proposals (pautas), voting, and public broadcasting (TV/portal). The project is split into three major areas:

- `web/` — static web frontend (admin, app, portal, tv) implemented with HTML/CSS/vanilla JavaScript. Many components are designed for progressive enhancement and low-dependency hosting.
- `server.js` — minimal Node.js Express runtime that implements authentication endpoints used during local development and static file hosting.
- `tablet_app/` — Flutter codebase targeting tablet devices for council members (kept in the repo but platform-generated files are ignored).

Business APIs used by the UI are mocked via `web/js/mockMode.js` to allow full frontend demonstrations without a complete backend. The mock layer deliberately forwards `/api/auth/*` requests to the auth runtime so login flows are exercised against the real auth logic.

## Features (implemented)

- Admin screens: chamber & party management
- App screens: login, dashboard, session creation, proposal lifecycle (create/edit/order), control panel, voting panel, reporting
- Public portal: livestream integration, recent votes, public-facing pages (terms, privacy)
- TV views: simplified display for live voting and speech monitoring
- Dev-time mock API that covers the app's `/api/*` usage patterns for offline demos

## Architecture & key modules

- `web/js/global.js` — global initialization, auth guard and navigation helpers
- `web/js/mockMode.js` — fetch interceptor that returns mock responses for business endpoints and persists state in localStorage
- `web/js/auth.js` — client-side auth helpers (login, token refresh) that integrate with the auth runtime
- `server.js` — Node.js Express server exposing auth endpoints and static hosting
- `tablet_app/` — Flutter UI + platform glue (Android/iOS/Windows/Mac/Linux placeholders)

## Getting started (development)

Prerequisites:

- Node.js 18+ and npm
- (Optional) Flutter SDK for tablet app work

Steps:

1. Clone the repository and change to the project root.

```bash
git clone <repo-url>
cd PDSI2-LegislaNet
```

2. Install Node dependencies:

```bash
npm install
```

3. Create a `.env` file in the repository root with the following keys (example values should be set from your dev supabase instance or left blank for mock-only flows):

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
PORT=3000
```

4. Start the development runtime (auth + static host):

```bash
npm run dev
```

5. Open the UI in your browser:

- `http://localhost:3000/app/login.html` — application entry
- `http://localhost:3000/api/health` — runtime health check

Note: The frontend will use `mockMode.js` for business endpoints; only auth requests will hit the local runtime unless you explicitly disable mocks in the pages.

## Development workflows

- Sync a feature branch with `main` using merge or rebase. For most contributors prefer merge for safety:

```bash
git fetch origin
git checkout your-branch
git merge origin/main
git push origin your-branch
```

- If you want a linear history use rebase and `--force-with-lease` when pushing.

- Use the available sprint documentation and runbooks to guide manual integration and validation of UI changes.

## Testing

- Unit tests for auth endpoints and middleware exist under `tests/` and can be run with Node test runners configured in `package.json` (see `npm test`).
- Manual UI verification: load `web/app/painel_controle.html`, `web/portal/portal_publico.html`, and `web/tv/votacao_tv.html` with the dev runtime running to validate mock-driven flows and auth integration.

## Deployment notes

- This repository is not currently configured for production. The runtime is intentionally minimal and lacks production-grade security and scaling features.
- For demos, host `web/` statically (Netlify, Vercel, static S3) and deploy the auth runtime behind a secured environment if required.

## Contribution & code standards

- Follow consistent formatting (Prettier/ESLint for JS if adopted). Keep changes small and atomic.
- Do not commit `.env` or any credentials. Use environment-specific config management for secrets.
- Document non-trivial UI flows or mock behaviors when adding pages that rely on `mockMode.js`.

## Project contacts & maintainers

- Henrique dos Santos — lead
- Joao Batista
- Jonathan dos Santos
- Pedro Tercio
- Simao Morais

---

If you want, I can also add a short `CONTRIBUTING.md` and a `docs/` index to centralize runbooks, test instructions and the sprint reports.
