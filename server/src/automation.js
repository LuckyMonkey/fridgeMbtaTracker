const { exec } = require('child_process');
const { promisify } = require('util');

const { fetchStopPredictions } = require('./mbta');

const execAsync = promisify(exec);

const DEFAULTS = {
  enabled: true,
  pollMs: 10_000,
  stopId: 'place-orhte',
  stopName: 'Orient Heights',
  routeType: 1,
  routeId: 'Blue',
  leadMinutes: 1.15,
  passSeconds: 90,
  limit: 14,
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toIso = (ms) => new Date(ms).toISOString();

const toEventMs = (value) => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const summarizeWindow = (window) => {
  if (!window) return null;
  return {
    id: window.id,
    mode: window.mode,
    direction: window.direction,
    summary: window.summary,
    startAt: toIso(window.startMs),
    endAt: toIso(window.endMs),
    eventAt: toIso(window.eventMs),
  };
};

class VolumeAutomation {
  constructor(options) {
    this.enabled = parseBoolean(options.enabled, DEFAULTS.enabled);
    this.pollMs = Math.max(3_000, parseNumber(options.pollMs, DEFAULTS.pollMs));
    this.stopId = options.stopId || DEFAULTS.stopId;
    this.stopName = options.stopName || DEFAULTS.stopName;
    this.routeType = parseNumber(options.routeType, DEFAULTS.routeType);
    this.routeId = options.routeId || DEFAULTS.routeId;
    this.leadMinutes = Math.max(0, parseNumber(options.leadMinutes, DEFAULTS.leadMinutes));
    this.passSeconds = Math.max(10, parseNumber(options.passSeconds, DEFAULTS.passSeconds));
    this.limit = Math.max(6, parseNumber(options.limit, DEFAULTS.limit));
    this.apiKey = options.apiKey || '';
    this.fetchPredictions = typeof options.fetchPredictions === 'function'
      ? options.fetchPredictions
      : fetchStopPredictions;

    this.webhookUrl = options.webhookUrl || '';
    this.webhookToken = options.webhookToken || '';
    this.raiseCommand = options.raiseCommand || '';
    this.restoreCommand = options.restoreCommand || '';

    this.timer = null;
    this.inFlight = false;
    this.state = {
      active: false,
      lastError: null,
      lastEvaluatedAt: null,
      lastChangedAt: null,
      lastAction: null,
      lastActionAt: null,
      lastActionError: null,
      currentWindow: null,
      nextWindow: null,
    };
  }

  start() {
    if (!this.enabled || this.timer) return;
    this.tick().catch(() => {});
    this.timer = setInterval(() => {
      this.tick().catch(() => {});
    }, this.pollMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      active: this.state.active,
      config: {
        stopId: this.stopId,
        stopName: this.stopName,
        routeId: this.routeId,
        leadMinutes: this.leadMinutes,
        passSeconds: this.passSeconds,
        pollMs: this.pollMs,
        hasWebhook: Boolean(this.webhookUrl),
        hasRaiseCommand: Boolean(this.raiseCommand),
        hasRestoreCommand: Boolean(this.restoreCommand),
      },
      lastError: this.state.lastError,
      lastEvaluatedAt: this.state.lastEvaluatedAt,
      lastChangedAt: this.state.lastChangedAt,
      lastAction: this.state.lastAction,
      lastActionAt: this.state.lastActionAt,
      lastActionError: this.state.lastActionError,
      currentWindow: this.state.currentWindow,
      nextWindow: this.state.nextWindow,
    };
  }

  async triggerManual(action = 'raise') {
    const normalized = String(action || '').trim().toLowerCase();
    if (!['raise', 'restore'].includes(normalized)) {
      throw new Error('action must be "raise" or "restore"');
    }
    await this.runAction({
      action: normalized,
      reason: 'manual-test',
      window: null,
      manual: true,
    });
    return this.getStatus();
  }

  buildWindows(predictions = []) {
    const leadMs = Math.round(this.leadMinutes * 60_000);
    const passMs = Math.round(this.passSeconds * 1000);

    const windows = [];
    for (const p of predictions) {
      if (!p || p.routeId !== this.routeId) continue;
      const label = p.headsign || p.routeName || p.routeId || 'Train';

      if (p.directionId === 0) {
        const arrivalMs = toEventMs(p.arrivalTime);
        if (arrivalMs) {
          windows.push({
            id: `${p.id}:outbound-arrival`,
            mode: 'outbound_arrival',
            direction: 'Outbound',
            summary: `Wonderland train arriving ${this.stopName} (${label})`,
            eventMs: arrivalMs,
            startMs: arrivalMs - leadMs,
            endMs: arrivalMs + passMs,
          });
        }
      }

      if (p.directionId === 1) {
        const departureMs = toEventMs(p.departureTime);
        if (departureMs) {
          windows.push({
            id: `${p.id}:inbound-departure`,
            mode: 'inbound_departure',
            direction: 'Inbound',
            summary: `Bowdoin train departed ${this.stopName} (${label})`,
            eventMs: departureMs,
            startMs: departureMs + leadMs,
            endMs: departureMs + leadMs + passMs,
          });
        }
      }
    }

    return windows.sort((a, b) => a.startMs - b.startMs);
  }

  async tick() {
    if (!this.enabled || this.inFlight) return;
    this.inFlight = true;
    const now = Date.now();

    try {
      const payload = await this.fetchPredictions({
        stopId: this.stopId,
        routeType: this.routeType,
        routeId: this.routeId,
        limit: this.limit,
        apiKey: this.apiKey,
      });

      const windows = this.buildWindows(payload.predictions);
      const currentWindow = windows.find((w) => w.startMs <= now && now <= w.endMs) || null;
      const nextWindow = windows.find((w) => w.startMs > now) || null;

      this.state.lastError = null;
      this.state.lastEvaluatedAt = new Date().toISOString();
      this.state.currentWindow = summarizeWindow(currentWindow);
      this.state.nextWindow = summarizeWindow(nextWindow);

      if (currentWindow && !this.state.active) {
        this.state.active = true;
        this.state.lastChangedAt = new Date().toISOString();
        await this.runAction({
          action: 'raise',
          reason: currentWindow.summary,
          window: summarizeWindow(currentWindow),
        });
      }

      if (!currentWindow && this.state.active) {
        this.state.active = false;
        this.state.lastChangedAt = new Date().toISOString();
        await this.runAction({
          action: 'restore',
          reason: 'Train window elapsed',
          window: null,
        });
      }
    } catch (err) {
      this.state.lastError = err?.message || String(err);
    } finally {
      this.inFlight = false;
    }
  }

  async runAction({ action, reason, window, manual = false }) {
    const command = action === 'raise' ? this.raiseCommand : this.restoreCommand;
    const payload = {
      action,
      reason,
      manual,
      active: this.state.active,
      stopId: this.stopId,
      stopName: this.stopName,
      routeId: this.routeId,
      triggeredAt: new Date().toISOString(),
      window,
    };

    this.state.lastAction = action;
    this.state.lastActionAt = payload.triggeredAt;
    this.state.lastActionError = null;

    try {
      if (this.webhookUrl) {
        const headers = { 'content-type': 'application/json' };
        if (this.webhookToken) headers.authorization = `Bearer ${this.webhookToken}`;
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(`webhook failed (${response.status}) ${text}`.trim());
        }
      }

      if (command) {
        await execAsync(command, {
          timeout: 8_000,
          maxBuffer: 1024 * 1024,
          env: {
            ...process.env,
            MBTA_AUTOMATION_ACTION: action,
            MBTA_AUTOMATION_REASON: reason,
            MBTA_AUTOMATION_STOP_ID: this.stopId,
            MBTA_AUTOMATION_STOP_NAME: this.stopName,
            MBTA_AUTOMATION_ROUTE_ID: this.routeId,
          },
        });
      }
    } catch (err) {
      this.state.lastActionError = err?.message || String(err);
      this.state.lastError = this.state.lastActionError;
      throw err;
    }
  }
}

const createVolumeAutomation = (overrides = {}) => {
  return new VolumeAutomation(overrides);
};

module.exports = {
  createVolumeAutomation,
};
