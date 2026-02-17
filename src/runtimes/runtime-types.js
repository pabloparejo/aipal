const CODEX_RUNTIME_CLI = 'cli';
const CODEX_RUNTIME_SDK = 'sdk';
const CODEX_RUNTIME_AUTO = 'auto';

function parseBooleanEnv(value, fallback) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseRuntimeMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === CODEX_RUNTIME_CLI) return CODEX_RUNTIME_CLI;
  if (normalized === CODEX_RUNTIME_SDK) return CODEX_RUNTIME_SDK;
  return CODEX_RUNTIME_AUTO;
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

module.exports = {
  CODEX_RUNTIME_CLI,
  CODEX_RUNTIME_SDK,
  CODEX_RUNTIME_AUTO,
  parseBooleanEnv,
  parseRuntimeMode,
  parsePositiveNumber,
};
