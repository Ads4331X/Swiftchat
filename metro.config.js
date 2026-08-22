const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("wasm");
config.resolver.unstable_enablePackageExports = false;

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    (moduleName === "libsodium-wrappers" || moduleName === "libsodium") &&
    platform === "web"
  ) {
    console.log("🔍 Redirecting", moduleName, "to CJS build");
    const resolved = require.resolve(moduleName);
    console.log("✅ Resolved to:", resolved);
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
