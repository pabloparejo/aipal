const path = require('path');
const os = require('os');
const fs = require('fs/promises');

const XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const CONFIG_PATH = path.join(XDG_CONFIG_HOME, 'aipal', 'config.json');
const CONFIG_DIR = path.dirname(CONFIG_PATH);
const MEMORY_PATH = path.join(CONFIG_DIR, 'memory.md');
const SOUL_PATH = path.join(CONFIG_DIR, 'soul.md');

async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === 'ENOENT') return {};
    console.warn('Failed to load config JSON:', err);
    return {};
  }
}

async function writeConfig(config) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  const tmpPath = `${CONFIG_PATH}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2));
  await fs.rename(tmpPath, CONFIG_PATH);
}

async function readMemory() {
  try {
    const raw = await fs.readFile(MEMORY_PATH, 'utf8');
    return { path: MEMORY_PATH, content: raw.trim(), exists: true };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { path: MEMORY_PATH, content: '', exists: false };
    }
    console.warn('Failed to load memory.md:', err);
    return { path: MEMORY_PATH, content: '', exists: false };
  }
}

async function readSoul() {
  try {
    const raw = await fs.readFile(SOUL_PATH, 'utf8');
    return { path: SOUL_PATH, content: raw.trim(), exists: true };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { path: SOUL_PATH, content: '', exists: false };
    }
    console.warn('Failed to load soul.md:', err);
    return { path: SOUL_PATH, content: '', exists: false };
  }
}

async function updateConfig(patch) {
  const current = await readConfig();
  const next = { ...current, ...patch };
  await writeConfig(next);
  return next;
}

module.exports = {
  CONFIG_DIR,
  CONFIG_PATH,
  MEMORY_PATH,
  SOUL_PATH,
  readConfig,
  readMemory,
  readSoul,
  updateConfig,
};
