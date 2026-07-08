# tallo_app

Next.js (App Router) frontend for the tallo monthly money tracker. Client-rendered SPA that
talks to the Go API in `../tallo_service`. Visual spec: `../docs/frontend-design.md`.

> **Note:** this repo pins a modified Next.js — read `AGENTS.md` and the bundled guides in
> `node_modules/next/dist/docs/` before changing framework-level code.

## Layout

```
app/
  layout.tsx        IBM Plex Sans Thai (next/font), metadata
  globals.css       palette tokens (cream/night, ink+fill tiers), radius, base type
  page.tsx          the single screen: state + mutation runner
components/          Dashboard, Expenses/Income panels, PeoplePanel, Split/Clone modals, MonthBar
lib/
  api.ts            typed client + types (mirror the Go DTOs)
  format.ts         satang⇄baht format/parse (money only touched at the edge)
```

## Config

One env var — the API base (baked into the client bundle at build time):

```
NEXT_PUBLIC_API_BASE=http://localhost:8080/api      # dev
NEXT_PUBLIC_API_BASE=https://<your-api>.run.app/api # prod
```

Defaults to `http://localhost:8080/api` when unset.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (also typechecks)
npm run start    # serve the production build
```

## Deploy (Vercel)

Import the repo, set root directory to `tallo_app`, and set `NEXT_PUBLIC_API_BASE` to your
deployed API. The Go API's `CORS_ORIGIN` must be set to the Vercel URL.
