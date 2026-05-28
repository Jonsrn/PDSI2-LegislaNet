# LegislaNet (PDSI2)

![Project Type](https://img.shields.io/badge/project-academic-blue)
![Status](https://img.shields.io/badge/status-active%20development-green)
![Web Scope](https://img.shields.io/badge/web-full%20stack%20integrated-0A66C2)
![Backend Scope](https://img.shields.io/badge/backend-MVC%20%2B%20Supabase-orange)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![Flutter](https://img.shields.io/badge/flutter-tablet_app%20present-02569B?logo=flutter&logoColor=white)

LegislaNet is an academic digital legislative management platform for city councils, developed as the PDSI2 capstone project. This repository contains the fully integrated web application deliverables, representing a complete transition to a functional Node.js MVC backend connected to a real Supabase (PostgreSQL) database, delivering comprehensive data persistence, role-based access control (RBAC), and robust REST API communication.

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Architecture & Key Modules](#architecture--key-modules)
- [Getting Started (Development)](#getting-started-development)
- [Development Workflows](#development-workflows)
- [Testing](#testing)
- [Deployment Notes](#deployment-notes)
- [Contribution & Code Standards](#contribution--code-standards)
- [Project Contacts & Maintainers](#project-contacts--maintainers)

---

## Overview

LegislaNet aims to provide a lightweight, modular platform for managing city council sessions, proposals (pautas), voting, and public broadcasting (TV/portal). The project is split into three major areas:

- `web/` — The static web frontend (Admin, App, Portal, TV) implemented with HTML/CSS and vanilla JavaScript. UI components actively consume the real REST API dynamically, fully deprecating the legacy offline mock behaviors for core functionality.
- `src/` & `server.js` — A robust Node.js Express runtime structured in a modern MVC pattern. It implements business logic, endpoints, scheduled cron jobs, and database interactions through Supabase, maintaining strict security standards.
- `tablet_app/` — Flutter codebase targeting tablet devices for council members (kept in the repo but platform-generated files are ignored).

## Features

- **Authentication & Security:** Real JWT-based login flows using Supabase Auth. Endpoints are guarded by custom middlewares validating specific access roles (`super_admin`, `admin_camara`, and `vereador`), ensuring isolated multi-tenant data access.
- **Super Admin Module:** Comprehensive chamber (Câmaras) and political party (Partidos) management, complete with image uploads and global statistical dashboard monitoring.
- **App Module (Chamber Management):** Administrative panels for managing council members (Vereadores), legislative sessions (Sessões), and real-time dashboard analytics specific to the authenticated user's chamber.
- **Legislative Operations:** Full lifecycle management for proposals (Pautas), tracking of live speakers (Oradores), and secure, auditable voting records (Votos).
- **Public Portal:** Open APIs allowing citizens to seamlessly view active chambers, upcoming sessions, and recently finalized legislative voting results.
- **Background Jobs:** Node-cron schedulers implemented for automatic session status transitions and caching of complex statistical data, ensuring high performance.

## Architecture & Key Modules

The backend follows a strict, scalable layered architecture:
- **`src/config/`** — Instantiates dual Supabase clients (`anon` for public operations, `service_role` for privileged admin bypass).
- **`src/controllers/`** — Handles HTTP request parsing, input extraction, and response formatting for all business entities.
- **`src/middleware/`** — Handles JWT validation, role-checking pipelines, file uploads via `multer`, and security headers configuration (Helmet, CORS).
- **`src/routes/`** — Express routers meticulously mapping HTTP verbs to their respective controllers.
- **`src/services/`** — Abstracts complex, multi-step business rules away from the controllers (e.g., Session and Admin services).
- **`src/utils/`** — Centralized utilities such as Winston-based audit logging, memory caching, and background schedulers.
- **`web/js/`** — Frontend integration layer featuring `global.js` (auth guards), dynamic loaders, and UI state managers connecting HTML views to the JSON API.

## Getting Started (Development)

Prerequisites:

- Node.js 18+ and npm
- A running Supabase project instance
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

3. Create a `.env` file in the repository root containing your actual Supabase credentials. **Do not use placeholder or mock values if you intend to fetch real data:**

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
PORT=3000
```

4. Start the development runtime (API Server + Static Host):

```bash
npm run dev
```

5. Open the UI in your browser:

- `http://localhost:3000/app/login.html` — Application entry point
- `http://localhost:3000/portal/selecionar_camara.html` — Public portal
- `http://localhost:3000/api/health` — Runtime health check API

## Development Workflows

- Sync a feature branch with `main` using merge or rebase. For most contributors, prefer merge for safety:

```bash
git fetch origin
git checkout your-branch
git merge origin/main
git push origin your-branch
```

- If you want a linear history use rebase and `--force-with-lease` when pushing.
- Always verify that backend API changes are correctly documented or reflected in the corresponding `web/js` fetch calls.
- Use the available architecture documentation and runbooks to guide manual integration and validation of UI changes.

## Testing

- Unit tests for auth endpoints and core middleware exist under `tests/` and can be run with Node test runners configured in `package.json` (see `npm test`).
- Manual UI verification: Log in as a `super_admin` to validate chamber creation, then log in as an `admin_camara` to manage sessions and proposals. Validate that data modifications persist correctly in the Supabase backend.

## Deployment Notes

- The frontend is currently served statically by the Node.js Express server to facilitate local development. In a production environment, it is highly recommended to decouple the `web/` folder to a CDN (e.g., Vercel, Netlify) and host the Node API on a dedicated backend service (e.g., Render, Heroku, AWS).
- Ensure that the `.env` variables are securely injected into your deployment pipeline. **Never commit `.env` or `SUPABASE_SERVICE_KEY` to version control.**

## Contribution & Code Standards

- Follow consistent formatting (Prettier/ESLint for JS). Keep changes small and atomic.
- Strictly adhere to the MVC architecture when adding new features; do not place business logic directly in route definitions.
- Maintain the modularity of the frontend by updating reusable HTML components (e.g., headers, sidebars) located in `web/components/`.
- Ensure new endpoints are appropriately secured using the `authMiddleware` and parameter validators.

## Project Contacts & Maintainers

- **Henrique dos Santos** — Lead
- **Joao Batista**
- **Jonathan dos Santos**
- **Pedro Tercio**
- **Simao Morais**
