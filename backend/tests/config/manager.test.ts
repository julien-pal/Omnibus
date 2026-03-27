import fs from 'fs';
import path from 'path';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('fs');
const mockFs = jest.mocked(fs);

jest.mock('../../src/lib/logger', () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { getConfig, saveConfig, initializeConfigs, CONFIG_DIR } from '../../src/config/manager';

// ── Helpers ───────────────────────────────────────────────────────────────────

function configPath(name: string) {
  return path.join(CONFIG_DIR, `${name}.json`);
}

beforeEach(() => {
  jest.clearAllMocks();
  // By default the dir exists and no config file exists
  mockFs.existsSync = jest.fn().mockReturnValue(false);
  mockFs.mkdirSync = jest.fn();
  mockFs.readFileSync = jest.fn();
  mockFs.writeFileSync = jest.fn();
  mockFs.readdirSync = jest.fn();
});

// ── CONFIG_DIR ────────────────────────────────────────────────────────────────

describe('CONFIG_DIR', () => {
  it('is a non-empty string', () => {
    expect(typeof CONFIG_DIR).toBe('string');
    expect(CONFIG_DIR.length).toBeGreaterThan(0);
  });
});

// ── getConfig ─────────────────────────────────────────────────────────────────

describe('getConfig', () => {
  describe('when the config file does not exist', () => {
    beforeEach(() => {
      // dir exists, file does not
      mockFs.existsSync = jest.fn().mockImplementation((p: unknown) => {
        if (p === CONFIG_DIR) return true;
        return false;
      });
    });

    it('returns a clone of the default value for a known key', () => {
      const config = getConfig('follows');
      expect(config).toEqual({ authors: [], series: [] });
    });

    it('saves the default to disk when the file is missing', () => {
      getConfig('follows');
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        configPath('follows'),
        expect.stringContaining('"authors"'),
        'utf8',
      );
    });

    it('returns a deep clone (mutation does not affect next call)', () => {
      const a = getConfig('follows');
      (a.authors as unknown as unknown[]).push('test');
      // mock file still "not found" — second call returns fresh default
      const b = getConfig('follows');
      expect(b.authors).toHaveLength(0);
    });

    it('throws when there is no default for an unknown key', () => {
      mockFs.existsSync = jest.fn().mockReturnValue(false);
      // @ts-expect-error — testing invalid key at runtime
      expect(() => getConfig('__unknown__')).toThrow();
    });

    it('returns default libraries config', () => {
      const libs = getConfig('libraries');
      expect(libs).toEqual({ ebook: [], audiobook: [], mixed: [] });
    });

    it('returns default prowlarr config', () => {
      const prowlarr = getConfig('prowlarr');
      expect(prowlarr).toMatchObject({ url: '', apiKey: '', indexers: [] });
    });
  });

  describe('when the config file exists', () => {
    const storedFollows = { authors: [{ name: 'Brandon Sanderson', format: 'audiobook' }], series: [] };

    beforeEach(() => {
      mockFs.existsSync = jest.fn().mockReturnValue(true);
      (mockFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(storedFollows));
    });

    it('reads and parses the file', () => {
      const result = getConfig('follows');
      expect(result).toEqual(storedFollows);
    });

    it('calls readFileSync with the correct path and encoding', () => {
      getConfig('follows');
      expect(mockFs.readFileSync).toHaveBeenCalledWith(configPath('follows'), 'utf8');
    });
  });

  describe('when the config file is malformed JSON', () => {
    beforeEach(() => {
      mockFs.existsSync = jest.fn().mockReturnValue(true);
      (mockFs.readFileSync as jest.Mock).mockReturnValue('{ broken json !!');
    });

    it('falls back to the default value', () => {
      const result = getConfig('follows');
      expect(result).toEqual({ authors: [], series: [] });
    });

    it('falls back to the default for libraries on malformed file', () => {
      const result = getConfig('libraries');
      expect(result).toEqual({ ebook: [], audiobook: [], mixed: [] });
    });
  });
});

// ── saveConfig ────────────────────────────────────────────────────────────────

describe('saveConfig', () => {
  beforeEach(() => {
    mockFs.existsSync = jest.fn().mockReturnValue(true);
  });

  it('writes JSON with 2-space indent to the correct path', () => {
    const data = { authors: [], series: [] };
    saveConfig('follows', data);
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      configPath('follows'),
      JSON.stringify(data, null, 2),
      'utf8',
    );
  });

  it('ensures the config dir exists before writing', () => {
    mockFs.existsSync = jest.fn().mockReturnValue(false);
    saveConfig('follows', { authors: [], series: [] });
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true });
  });

  it('throws when writeFileSync throws', () => {
    (mockFs.writeFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() => saveConfig('follows', { authors: [], series: [] })).toThrow('disk full');
  });

  it('writes the clients config correctly', () => {
    const data = { active: 'qb1', clients: [] };
    saveConfig('clients', data);
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      configPath('clients'),
      JSON.stringify(data, null, 2),
      'utf8',
    );
  });
});

// ── initializeConfigs ─────────────────────────────────────────────────────────

describe('initializeConfigs', () => {
  it('creates config files for all known keys when none exist', () => {
    mockFs.existsSync = jest.fn().mockImplementation((p: unknown) => {
      if (p === CONFIG_DIR) return true;
      return false; // no config files exist
    });
    initializeConfigs();
    // Should write at least the known defaults: app, prowlarr, clients, libraries, follows
    const writeCalls = (mockFs.writeFileSync as jest.Mock).mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(writeCalls.some((p) => p.endsWith('app.json'))).toBe(true);
    expect(writeCalls.some((p) => p.endsWith('libraries.json'))).toBe(true);
    expect(writeCalls.some((p) => p.endsWith('follows.json'))).toBe(true);
  });

  it('skips files that already exist', () => {
    // All files already exist
    mockFs.existsSync = jest.fn().mockReturnValue(true);
    initializeConfigs();
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  it('only creates missing files when some exist', () => {
    mockFs.existsSync = jest.fn().mockImplementation((p: unknown) => {
      if (typeof p === 'string' && p.endsWith('follows.json')) return false;
      return true;
    });
    initializeConfigs();
    const writeCalls = (mockFs.writeFileSync as jest.Mock).mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(writeCalls.length).toBe(1);
    expect(writeCalls[0]).toMatch(/follows\.json$/);
  });

  it('ensures the config dir is created', () => {
    mockFs.existsSync = jest.fn().mockReturnValue(false);
    initializeConfigs();
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true });
  });
});
