// Simple leveled logger — controllable via LOG_LEVEL env var (debug|info|warn|error).
// Defaults to 'info' in production, 'debug' otherwise.

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

const envLevel = (process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug')) as Level;
const currentLevel: Level = (envLevel in LEVELS ? envLevel : 'info') as Level;

function ts(): string {
  return new Date().toISOString();
}

function emit(level: Level, ...args: unknown[]): void {
  if (LEVELS[level] < LEVELS[currentLevel]) return;
  const prefix = `[${ts()}] [${level.toUpperCase().padEnd(5)}]`;
  if (level === 'error') console.error(prefix, ...args);
  else if (level === 'warn') console.warn(prefix, ...args);
  else console.log(prefix, ...args);
}

const logger = {
  debug: (...args: unknown[]) => emit('debug', ...args),
  info: (...args: unknown[]) => emit('info', ...args),
  warn: (...args: unknown[]) => emit('warn', ...args),
  error: (...args: unknown[]) => emit('error', ...args),
};

export default logger;
