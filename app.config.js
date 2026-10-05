// Wraps app.json. Local simulator test builds (scripts/qa/ios.sh sets
// QA_SIMULATOR=1) drop the Sign in with Apple entitlement, which needs a
// signing certificate even on the simulator. EAS/TestFlight builds are unchanged.
module.exports = ({ config }) => {
  if (process.env.QA_SIMULATOR !== '1') return config;
  return {
    ...config,
    ios: { ...config.ios, usesAppleSignIn: false },
    plugins: (config.plugins ?? []).filter((p) => (Array.isArray(p) ? p[0] : p) !== 'expo-apple-authentication'),
  };
};
