/** Unit tests for pure logic (no React Native). Run: npm test */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/lib'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { esModuleInterop: true, strict: true }, diagnostics: false }] },
  // Helpers like lib/seasons.ts import the Supabase client and Expo modules;
  // the pure functions under test never touch them, so load a stub instead.
  moduleNameMapper: {
    '^@/lib/supabase$': '<rootDir>/lib/__tests__/__stubs__/native.ts',
    '^(react-native|react-native-url-polyfill/auto|expo-.*)$': '<rootDir>/lib/__tests__/__stubs__/native.ts',
    '^@/(.*)$': '<rootDir>/$1',
  },
};
