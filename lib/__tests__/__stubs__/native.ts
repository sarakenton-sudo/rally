// Stand-in for React Native / Expo / Supabase modules in Node unit tests.
const noop = () => undefined;
const chain: any = new Proxy(noop, { get: () => chain, apply: () => chain });
export const supabase = chain;
export const isSupabaseConfigured = false;
export const Platform = { OS: 'web', select: (o: any) => o.web ?? o.default };
export const Linking = { openURL: noop };
export const openBrowserAsync = noop;
export const openAuthSessionAsync = noop;
export default chain;
