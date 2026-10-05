/** Unit tests for pure logic (no React Native). Run: npm test */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/lib'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { esModuleInterop: true, strict: true } }] },
};
