# Prizeotel Receipt OCR Dashboard

Full-stack receipt OCR system for uploading card receipts, extracting structured payment fields, and managing data in a role-based dashboard.

## Features

- Admin/user authentication (no public self-registration)
- Receipt upload, OCR, and parser-based field extraction
- Receipt list with search/filter/sort, thumbnails, and detail page
- Raw OCR text storage with expandable view in receipt detail
- Analytics endpoint + dashboard KPIs/charts
- Excel export (`.xlsx`) with embedded receipt image previews, grouped by month
- Admin-only user and receipt deletion

## Tech Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: SQLite (`better-sqlite3`)
- OCR: Google Cloud Vision API
- Image processing: `sharp`
- Auth: JWT in httpOnly cookies

## Repository Structure

```text
.
├── backend
│   ├── src
│   ├── data/            # sqlite db (ignored)
│   ├── uploads/         # stored images (ignored)
│   └── .env.example
├── frontend
│   └── src
├── package.json         # npm workspaces root
└── README.md
```

## Prerequisites

- Node.js 20+ (recommended LTS)
- npm 10+
- Google Cloud project with Vision API enabled
- Google Cloud CLI (`gcloud`) for ADC login

## Environment Setup

1. Copy `backend/.env.example` to `backend/.env`.
2. Set values in `backend/.env`:
   - `PORT=4000`
   - `CLIENT_URL=http://localhost:5173`
   - `JWT_SECRET=<strong-random-secret>`
   - `GOOGLE_CLOUD_PROJECT=<your-project-id>`
   - `ADMIN_USERNAME=<initial-admin-username>`
   - `ADMIN_PASSWORD=<initial-admin-password>`
3. Authenticate with Application Default Credentials (ADC):

```bash
gcloud config set project <your-project-id>
gcloud auth application-default login
gcloud auth application-default set-quota-project <your-project-id>
```

Do not set `GOOGLE_APPLICATION_CREDENTIALS` unless you intentionally use a service account JSON key.

## Local Development

Install dependencies from repository root:

```bash
npm install
```

Run backend:

```bash
npm run dev:backend
```

Run frontend (new terminal):

```bash
npm run dev:frontend
```

App URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000`

## Production Build

From repository root:

```bash
npm run build
```

This builds:

- `backend/dist`
- `frontend/dist`

## PM2 Deployment (Same Server as Other Projects)

You can run this project on a server that already has other PM2 apps, as long as each app uses unique ports.

Example PM2 start commands:

```bash
# backend (api)
pm2 start "npm run start --workspace backend" --name receipt-backend

# optional static frontend preview (prefer nginx static hosting in production)
pm2 start "npm run preview --workspace frontend -- --host 0.0.0.0 --port 4173" --name receipt-frontend
```

Recommended setup:

- Reverse proxy with Nginx
- Route `/api` to backend port (e.g., `4000`)
- Serve `frontend/dist` as static site
- Enable HTTPS (Let's Encrypt)

## Security Notes Before GitHub Upload

- Never commit `backend/.env` (contains secrets)
- Rotate credentials if they were exposed previously
- Keep `backend/data` and `backend/uploads` out of Git
- Avoid committing `node_modules`, `dist`, and local build artifacts
