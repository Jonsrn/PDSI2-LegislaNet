# LegislaNet (PDSI2)

![Project Type](https://img.shields.io/badge/project-academic-blue)
![Status](https://img.shields.io/badge/status-active%20development-yellow)
![Web Scope](https://img.shields.io/badge/web-sprint%201%20implemented-0A66C2)
![Backend Scope](https://img.shields.io/badge/backend-auth--only%20runtime-orange)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![Flutter](https://img.shields.io/badge/flutter-tablet_app%20present-02569B?logo=flutter&logoColor=white)

Digital legislative management platform for city councils, maintained as an academic project in Projeto e Desenvolvimento de Sistemas de Informacao II.

## Current repository state

This repository currently contains:

- Web module with static pages/components/assets under web/ (including admin, app, portal, and tv sections).
- Minimal Node.js auth runtime at repository root (server.js + package.json + package-lock.json).
- Flutter tablet application under tablet_app/.
- Local environment file .env is expected for auth runtime execution.

Current backend scope in this repository is intentionally limited to authentication endpoints and static file serving.

## Implemented runtime (root)

The root server exposes:

- POST /api/auth/login
- POST /api/auth/refresh
- POST /api/auth/logout
- GET /api/health
- Static hosting for web/

The server returns 404 for unknown API routes and for direct requests to non-existent static files.

## Tech stack present in repo

- Node.js + Express
- Supabase JS client
- Flutter + Dart (tablet app)
- HTML/CSS/JavaScript (web frontend)

## Quick start

### 1. Install dependencies (root)

```bash
npm install
```

### 2. Configure environment

Create/update .env in repository root with:

- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_KEY
- PORT (optional, default 3000)

### 3. Run the auth runtime + web host

```bash
npm run dev
```

or

```bash
npm start
```

### 4. Access

- App login page: /app/login.html
- Health endpoint: /api/health

## Current top-level structure

```text
PDSI2-LegislaNet/
|- tablet_app/
|- web/
|- server.js
|- package.json
|- package-lock.json
|- .gitignore
|- README.md
```

## Notes

- .env.example is not present at the moment.
- node_modules/ and local generated files are intentionally ignored by Git.

## Team

- Henrique dos Santos
- Joao Batista
- Jonathan dos Santos
- Pedro Tercio
- Simao Morais
