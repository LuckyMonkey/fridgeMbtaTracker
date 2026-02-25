# 🚆 MBTA Tracker (MERN)

Live Suffolk Downs timing wrapped in a focused inbound first UI that treats Bowdoin trains as your only immediate destination, with a smooth outbound flip view hiding Wonderland schedules behind the icon button.

## ✦ Why this build

- **Inbound-first, Bowdoin-only** – the primary panel only highlights Bowdoin departures so you never chase the wrong train; all Wonderland / outbound runs live behind the flip control.
- **10-foot friendly layout** – black-on-white, Helvetica-inspired, high-contrast borders, squared edges, drop shadows, and mobile-friendly scaling keep the UI legible whether on a hallway screen or phone.
- **Smart timing guidance** – leave-time message includes seconds, compares arrivals to the configured walk buffer, and marks trains arriving faster than you can reach the stop as “missed.” The next catchable train is highlighted and stays in sync via a 30 second polling cadence.
- **Volume boost automation** – the dedicated bottom panel keeps household automation in view without crowding the timetable.
- **Flip-to-outbound control** – a lightweight emoji icon in the top-right of the timetable panel toggles the outbound (Wonderland) list via a smooth accordion-style transition so only one card shows at a time.

## 🧭 UI behavior highlights

- **Primary (main) view**: Always renders the Bowdoin arrivals because that is your inbound destination from Suffolk Downs. Trains with less than 3 minutes until departure fade to light gray and carry a “missed” tag, while the first viable train is specially highlighted and numbered in plain language (“Next train you can make”).
- **Flip control**: Tap the directional emoji in the top-right corner of the timetable panel to slide in the secondary Wonderland/outbound card. It never defaults to the secondary view, and the animation keeps the page from overflowing.
- **Walk buffer**: `WALK_TIME_MINUTES` (default `4`) plus seconds determine whether “Leave now” is realistic—if the next train arrives before you can reach the stop, the UI automatically promotes the next feasible train to the lead position.
- **Volume panel**: Anchored at the bottom with clean lines, this section reports the next trigger window for the automation hooks and lets you see that the status is active without distracting from the timetable.
- **Mobile alarm clock view**: On phones the hero clock takes over the entire viewport (header/status now hidden) and shows the leave timer with a train emoji; the upcoming timetable sits on its own flashcard below and you cycle inbound/outbound/volume cards via the left/right arrows at the bottom so nothing scrolls, keeping the screen friendly rather than intense.
- **Screen stay-awake**: The client requests the Wake Lock API on supported browsers, keeping the display from dimming while the tracker page is open for uninterrupted timing.
- **Multilingual text**: Spanish is the default language, with an inline toggle to switch to English; choosing English stores `mbta-lang=en` in a cookie so the next visit honors your preference, and returning to Spanish clears that cookie.

## ⚙️ Quickstart

1. *(Optional but recommended)* copy the example env file:

```sh
cp .env.example .env
```

2. Start the stack (rebuilds after code changes):

```sh
docker compose up -d --build
```

3. Access:

- Web UI: `http://fridge.local:5174/`
- API health: `http://fridge.local:4001/api/health`
- Suffolk Downs predictions: `http://fridge.local:4001/api/suffolk-downs`

## ⚙️ Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `MBTA_API_KEY` | *(none)* | Optional key for higher rate limits |
| `DEFAULT_STOP_ID` | `place-sdmnl` | Suffolk Downs stop ID |
| `DEFAULT_STOP_NAME` | `Suffolk Downs` | Desk label |
| `WALK_TIME_MINUTES` | `4` | Walk buffer still used for “Leave in…” logic |
| `UI_REFRESH_MS` | `60000` | Client polling reminder interval exposed via `/api/config` |
| `PREDICTIONS_POLL_MS` | `30000` | How often the API polls MBTA for pinned stops |
| `PREDICTIONS_TTL_MS` | `60000` | How long cached results remain “fresh” before stale mode |
| `PREDICTIONS_FRESH_MS` | `60000` | *(legacy; kept in sync with `PREDICTIONS_TTL_MS` for compatibility)* |
| `PREDICTIONS_STALE_MS` | `300000` | How long stale data can be served if the API lags |
| `PREDICTIONS_TIMEOUT_MS` | `8000` | MBTA request timeout |
| `PREDICTIONS_LIMIT` | `16` | Number of predictions requested |

### Automation variables

- `AUTOMATION_ENABLED` (default `true`): whether the raise/restore logic is active.
- `AUTOMATION_POLL_MS` (default `30000`)
- `AUTOMATION_STOP_ID` / `AUTOMATION_STOP_NAME` (defaults `place-orhte` / `Orient Heights`)
- `AUTOMATION_ROUTE_ID` (default `Blue`)
- `AUTOMATION_LEAD_MINUTES` (default `1.15`)
- `AUTOMATION_PASS_SECONDS` (default `90`)
- `AUTOMATION_WEBHOOK_URL` + optional `AUTOMATION_WEBHOOK_TOKEN`
- `AUTOMATION_RAISE_COMMAND`, `AUTOMATION_RESTORE_COMMAND` (optional shell hooks)

Automation behaviours:

- Outbound (Wonderland) triggers are based on arrival time minus `AUTOMATION_LEAD_MINUTES`.
- Inbound (Bowdoin) triggers are based on departure time plus `AUTOMATION_LEAD_MINUTES`.
- Restore runs once a passage window closes after `AUTOMATION_PASS_SECONDS`.

## 🔄 Device control options

1. **Webhook receiver (`AUTOMATION_WEBHOOK_URL`)** – receive `raise` / `restore` events in Home Assistant, Node-RED, etc.
2. **Local commands** – run `AUTOMATION_RAISE_COMMAND` / `AUTOMATION_RESTORE_COMMAND` inside the API container for Bluetooth or local automation.

Manual trigger test:

```sh
curl -X POST http://fridge.local:4001/api/automation/test \
  -H 'content-type: application/json' \
  -d '{"action":"raise"}'
```

## 🧰 Shortcut

Add this to `docker/node-home/links.json` if you want `http://fridge.local:5174/` to appear as “MBTA” in the front panel:

```json
{ "name": "MBTA", "shortcut": "mbta", "destination": "http://fridge.local:5174/" }
```
```
