## EZP Parking (Next.js frontend)

This folder contains a Next.js frontend that connects to the existing Express API in the repo root.

### Requirements

- Install **Node.js 18+** (includes `node` + `npm`).

### Setup

Copy env example:

- Create `frontend-next/.env.local`
- Add:

```text
# Use proxy mode (recommended)
NEXT_PUBLIC_API_BASE_URL=/api

# Where Next.js should proxy /api/* to (your Express server)
API_PROXY_TARGET=http://localhost:3000
```

### Run (dev)

1. Start the Express backend (repo root):

```bash
npm install
npm start
```

2. Start the Next.js frontend (this folder):

```bash
npm install
npm run dev
```

Open `http://localhost:3001`.

### What’s migrated

- `/` and `/floor` are **native Next.js pages** (React).
- `/auth`, `/alerts`, `/settings` currently **redirect to** `public/legacy/*.html` to keep the original behavior working while still being served by Next.js.

