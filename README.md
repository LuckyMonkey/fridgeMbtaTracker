# MBTA Tracker (MERN)

Dockerized MERN app that shows live arrival/departure predictions from the MBTA API.

Default station: **Suffolk Downs** (`place-sdmnl`).

## Features

- Mobile-friendly web UI (React + Vite)
- Node/Express API proxy w/ 10s cache
- MongoDB persistence for pinned stops
- MBTA line-color styling (Blue/Red/Orange/Green)

## Quickstart

From `docker/mbta-tracker`:

1) (Optional) create a local env file:

```sh
cp .env.example .env
```

2) Start the stack:

```sh
docker compose up -d --build
```

3) Open:

- Web UI: `http://fridge.local:5173/` (or `http://<server-ip>:5173/`)
- API health: `http://fridge.local:4000/api/health`
- Suffolk Downs predictions: `http://fridge.local:4000/api/suffolk-downs`

## Config

Environment variables (set in `.env` or your shell):

- `MBTA_API_KEY` (optional): recommended for higher rate limits.
- `DEFAULT_STOP_ID` (default `place-sdmnl`)
- `DEFAULT_STOP_NAME` (default `Suffolk Downs`)

## API Endpoints

- `GET /api/stops` -> pinned stops stored in MongoDB
- `POST /api/stops` -> add/update pinned stop (`{ "stopId": "...", "name": "..." }`)
- `DELETE /api/stops/:stopId`
- `GET /api/stops/:stopId/predictions` -> MBTA predictions (cached for 10s)

## Adding a fridge.local shortcut

If you want a friendly redirect (no port typing), add a shortcut in `docker/node-home/links.json`:

```json
{ "name": "MBTA", "shortcut": "mbta", "destination": "http://fridge.local:5173/" }
```

## Git repo (optional)

If you want this project tracked separately:

```sh
cd docker/mbta-tracker
git init
git add .
git status
```
