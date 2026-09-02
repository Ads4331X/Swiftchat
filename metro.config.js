const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("wasm");
config.resolver.unstable_enablePackageExports = false;

const defaultResolveRequest = config.resolver.resolveRequest;

// Force the CJS (main) builds of the libsodium packages on web. Their ESM
// builds (`.mjs`) reference `import.meta`, which Metro/Hermes cannot parse.
const LIBSODIUM_CJS = new Set([
  "libsodium-wrappers",
  "libsodium",
  "libsodium-wrappers-sumo",
  "libsodium-sumo",
]);

config.resolver.resolveRequest = (context, moduleName, platform) => {
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
