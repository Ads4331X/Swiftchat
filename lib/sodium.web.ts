// lib/sodium.web.ts
import nacl from "tweetnacl";

// Shim matching the subset of the libsodium API your crypto.ts uses
const sodium = {
  ready: Promise.resolve(),
  crypto_box_keypair: () => {
    const { publicKey, secretKey } = nacl.box.keyPair();
    return { publicKey, privateKey: secretKey };
  },
};

export default sodium;
