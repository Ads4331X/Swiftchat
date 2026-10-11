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
//
// Its emscripten build seeds its CSPRNG AT IMPORT TIME by looking for
// `self.crypto.getRandomValues`, then `require("crypto")`. React Native defines
// `self`/`window` but no `crypto` global, and the sumo package's `browser` field
// stubs `crypto` to an empty module, so seeding failed with "No secure random
// number generator found" (surfacing as an empty-message crash). Install a real
// RNG backed by expo-crypto before libsodium is required. Web already has one.
import * as Crypto from "expo-crypto";

const globalCrypto = (globalThis as any).crypto;
if (typeof globalCrypto?.getRandomValues !== "function") {
  (globalThis as any).crypto = {
    ...globalCrypto,
    getRandomValues: (array: ArrayBufferView) =>
      Crypto.getRandomValues(array as Uint8Array),
  };
}

const sodiumModule: any = require("libsodium-wrappers-sumo");

export default sodiumModule.default ?? sodiumModule;
