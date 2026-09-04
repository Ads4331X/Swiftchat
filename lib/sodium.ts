// We use the pure-JS/WASM "sumo" build of libsodium everywhere (web, Expo Go,
// and native builds).
//
// react-native-libsodium (the JSI native binding) is intentionally NOT used:
// its native build exposes a reduced API that omits crypto_scalarmult_base,
// which is required to re-derive a public key from a recovered private key
// during PIN-based key recovery. That made recovery crash on native builds
// with "sodium.crypto_scalarmult_base is not a function", which in turn made
// the PIN appear "invalid" and blocked conversation decryption.
//
// libsodium-wrappers-sumo exposes the complete crypto API (crypto_scalarmult_base
// AND Argon2 crypto_pwhash) and behaves identically across every platform, so
// a Recovery PIN set on web decrypts correctly on mobile and vice-versa.
const sodiumModule: any = require("libsodium-wrappers-sumo");

export default sodiumModule.default ?? sodiumModule;
