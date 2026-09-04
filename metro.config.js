const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("wasm");
config.resolver.unstable_enablePackageExports = false;

const defaultResolveRequest = config.resolver.resolveRequest;

const EMPTY_MODULE = path.resolve(__dirname, "lib/shims/empty.js");
const NODE_CORE_STUBS = new Set(["fs", "node:fs"]);

// Force the CJS (main) builds of the libsodium packages on web. Their ESM
// builds (`.mjs`) reference `import.meta`, which Metro/Hermes cannot parse.
const LIBSODIUM_CJS = new Set([
  "libsodium-wrappers",
  "libsodium",
  "libsodium-wrappers-sumo",
  "libsodium-sumo",
]);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Stub out Node core modules the sumo build references but never
  // actually calls at runtime in RN/Expo (e.g. its unused `fs` fallback path).
  if (NODE_CORE_STUBS.has(moduleName)) {
    return {
      filePath: EMPTY_MODULE,
      type: "sourceFile",
    };
  }

  if (LIBSODIUM_CJS.has(moduleName) && platform === "web") {
    const resolved = require.resolve(moduleName);
    return {
      filePath: resolved,
      type: "sourceFile",
    };
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    return middleware(req, res, next);
  };
};

module.exports = withNativeWind(config, { input: "./global.css" });
