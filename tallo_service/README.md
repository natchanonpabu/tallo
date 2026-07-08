# tallo_service

Go REST API for the tallo monthly money tracker. See `../docs/design.md` (#6) for the
layout and `../docs/business.md` for the domain rules. Money is `int64` satang everywhere.

## Layout

```
cmd/api/            entrypoint (config, pool, router, serve)
internal/
  config/           env: DATABASE_URL, PORT, CORS_ORIGIN
  money/            SplitEven() rounding — the only place satang is divided
  store/            sqlc-generated typed queries (DO NOT EDIT by hand)
  service/          business logic + transactions (summary, split, clone, CRUD)
  http/             chi router, handlers, uniform error envelope
migrations/         goose SQL migrations (0001_init.sql)
sql/queries/        sqlc input .sql (regenerate store after editing)
sqlc.yaml
```

## Prerequisites

```bash
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
go install github.com/pressly/goose/v3/cmd/goose@latest
```

## Local dev

```bash
# 1. Postgres
docker run --rm -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16
export DATABASE_URL="postgres://postgres:dev@localhost:5432/postgres?sslmode=disable"

# 2. Migrate
goose -dir migrations postgres "$DATABASE_URL" up

# 3. Run
go run ./cmd/api        # listens on :8080

# regenerate typed queries after editing sql/queries/*.sql
sqlc generate

# checks
gofmt -w . && go vet ./... && go test ./...
```

`go test ./...` runs the pure unit tests always; the `store` and `http` integration tests
only run when `DATABASE_URL` is set (they need a migrated Postgres).

## Dependencies

Stack per `docs/design.md`: `chi`, `pgx/v5`, `sqlc`, `goose`. One addition beyond that list:
`github.com/google/uuid` — for clean UUID⇄string/JSON handling (verified to scan/encode
through pgx/v5). Flagged here per the "call out new deps" rule in `CLAUDE.md`.

## Deploy (Cloud Run)

```bash
# migrations run once against the prod DB (Neon pooled URL)
goose -dir migrations postgres "$DATABASE_URL" up

# build & deploy the container
gcloud run deploy tallo-api \
  --source . \
  --set-env-vars "DATABASE_URL=<neon-pooled-url>,CORS_ORIGIN=https://<your-app>.vercel.app" \
  --min-instances 0 --allow-unauthenticated
```

The `Dockerfile` produces a static distroless image. Keep `pgxpool` max small (~4) for
serverless Postgres; min-instances 0 accepts a cold start on the first monthly visit.
