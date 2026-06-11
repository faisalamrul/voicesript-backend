# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start with hot-reload (ts-node-dev)
npm run build        # compile TypeScript → dist/
npm run start        # run compiled output
npm run type-check   # tsc --noEmit, no output files

npm run docker:dev   # docker compose up (API + PostgreSQL)
npm run docker:down  # stop containers
```

No test runner is configured yet.

## Architecture

The app uses a strict **4-layer architecture**. Never skip layers — controllers must not query the database directly.

```
routes → controllers → services → repositories
```

- **routes** — wire HTTP method + path to a controller function; register in `src/routes/index.ts` under `/api/v1`
- **controllers** — parse request, call service, return response via `sendSuccess`/`sendError`/`sendCreated` helpers (`src/utils/response.ts`)
- **services** — business logic only; no `req`/`res` objects here
- **repositories** — all SQL via `pool` from `src/config/database.ts`; return plain objects

## Key Conventions

**Error handling** — throw `AppError` (`src/utils/AppError.ts`) anywhere in the stack; the global `errorHandler` middleware in `src/middlewares/errorHandler.ts` catches it and formats the JSON response. Use the static helpers: `AppError.notFound()`, `AppError.unauthorized()`, `AppError.conflict()`.

**Response shape** — all responses follow `ApiResponse<T>` (`src/types/index.ts`): `{ success, data?, message?, errors? }`. Always use the util helpers instead of calling `res.json()` directly.

**Environment** — all env vars are centralized and typed in `src/config/env.ts`. Add new vars there, not inline with `process.env`.

**TypeScript** — strict mode. Use `AuthenticatedRequest` (extends `Request`) when a route requires an authenticated user.

## Database

Raw SQL via `node-postgres` pool — no ORM. The pool is initialized in `src/config/database.ts` and verified on startup in `src/server.ts`. Migrations are not yet set up; create a `src/migrations/` directory and a migration runner script when needed.

## Docker

`docker-compose.yml` runs two services: `api` (development target with volume mount for hot-reload) and `db` (postgres:16-alpine). The `api` service waits for the `db` healthcheck before starting. Override defaults via `.env` (copy from `.env.example`).
