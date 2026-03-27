const baseConfig = {
  preset: 'ts-jest',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.test.json' }],
  },
};

module.exports = {
  projects: [
    {
      ...baseConfig,
      displayName: 'lib',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/lib/**/*.test.ts'],
    },
    {
      ...baseConfig,
      displayName: 'store',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/store/**/*.test.ts'],
      setupFilesAfterEnv: ['@testing-library/jest-dom'],
    },
  ],
};
