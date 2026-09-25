/**
 * The published package version, read once from `package.json` when this
 * module first loads (not per request) so it can be used for the default
 * `User-Agent` request header. A plain `require()` call (rather than an
 * `import`) so the build's `rootDir: "src"` doesn't need `package.json`
 * copied into `lib/`: at runtime it resolves relative to the actual file
 * location, `lib/version.js` -> `<package root>/package.json`.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
const packageJson = require('../package.json') as { version?: string };

export const LIBRARY_VERSION: string = packageJson.version ?? '0.0.0';
