// ─── Structured Logger with Configurable Levels ─────────
//
// Log level is controlled by the LOG_LEVEL environment variable.
// Levels (in order of verbosity):
//   debug  – Detailed diagnostic info (search scores, API payloads, matching details)
//   info   – High-level flow events (starting enrichment, item matched, etc.)
//   warn   – Recoverable issues (fallback used, low confidence match, missing optional data)
//   error  – Failures (API errors, unhandled exceptions)
//   silent – No output
//
// Default: 'silent' (no logging unless explicitly enabled)
//
// Usage:
//   import { log } from '@/lib/logger';
//   log.info('metadata', 'Enriching item', { title: 'Breaking Bad', type: 'tv' });
//   log.debug('metadata', 'TMDB search results', { query: 'Breaking Bad', resultCount: 5 });

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function getConfiguredLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVEL_PRIORITY) {
    return envLevel as LogLevel;
  }
  return 'silent';
}

function shouldLog(messageLevel: LogLevel): boolean {
  const configuredLevel = getConfiguredLevel();
  return LOG_LEVEL_PRIORITY[messageLevel] >= LOG_LEVEL_PRIORITY[configuredLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, module: string, message: string, data?: Record<string, unknown>): string {
  const timestamp = formatTimestamp();
  const prefix = `[${timestamp}] [${level.toUpperCase().padEnd(5)}] [${module}]`;
  if (data && Object.keys(data).length > 0) {
    return `${prefix} ${message} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${message}`;
}

function logAtLevel(level: LogLevel, module: string, message: string, data?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const formatted = formatMessage(level, module, message, data);

  switch (level) {
    case 'debug':
      console.debug(formatted);
      break;
    case 'info':
      console.info(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
  }
}

export const log = {
  debug: (module: string, message: string, data?: Record<string, unknown>) =>
    logAtLevel('debug', module, message, data),

  info: (module: string, message: string, data?: Record<string, unknown>) =>
    logAtLevel('info', module, message, data),

  warn: (module: string, message: string, data?: Record<string, unknown>) =>
    logAtLevel('warn', module, message, data),

  error: (module: string, message: string, data?: Record<string, unknown>) =>
    logAtLevel('error', module, message, data),
};
