import fs from 'fs';
import path from 'path';
import defaults from './defaults';
import { ConfigKey, ConfigMap } from '../types';
import logger from '../lib/logger';

/**
 * Directory where JSON config files are stored.
 * Override with the CONFIG_DIR environment variable (e.g. for Docker volume mounts).
 * Default: <cwd>/config
 */
export const CONFIG_DIR = process.env.CONFIG_DIR
  ? path.resolve(process.env.CONFIG_DIR)
  : path.resolve(process.cwd(), 'config');

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function getConfigPath(name: string): string {
  return path.join(CONFIG_DIR, `${name}.json`);
}

export function getConfig<K extends ConfigKey>(name: K): ConfigMap[K] {
  ensureConfigDir();
  const filePath = getConfigPath(name);

  if (!fs.existsSync(filePath)) {
    const defaultValue = defaults[name];
    if (defaultValue !== undefined) {
      saveConfig(name, defaultValue);
      return JSON.parse(JSON.stringify(defaultValue)) as ConfigMap[K];
    }
    throw new Error(`No default config for: ${name}`);
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as ConfigMap[K];
  } catch (err) {
    logger.error(`[config] Failed to read ${name}.json:`, (err as Error).message);
    const defaultValue = defaults[name];
    if (defaultValue) return JSON.parse(JSON.stringify(defaultValue)) as ConfigMap[K];
    throw new Error(`Config read failed for: ${name}`);
  }
}

export function saveConfig<K extends ConfigKey>(name: K, data: ConfigMap[K]): void {
  ensureConfigDir();
  const filePath = getConfigPath(name);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    logger.error(`[config] Failed to write ${name}.json:`, (err as Error).message);
    throw err;
  }
}

export function initializeConfigs(): void {
  ensureConfigDir();
  const names = Object.keys(defaults) as ConfigKey[];
  for (const name of names) {
    const filePath = getConfigPath(name);
    if (!fs.existsSync(filePath)) {
      logger.info(`[config] Initializing default config: ${name}.json`);
      saveConfig(name, defaults[name]);
    }
  }
}
