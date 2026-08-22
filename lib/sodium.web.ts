// lib/sodium.web.ts
import nacl from "tweetnacl";

const sodium = {
  ready: Promise.resolve(),

  crypto_box_keypair: () => {
    const { publicKey, secretKey } = nacl.box.keyPair();
    return { publicKey, privateKey: secretKey };
  },

  randombytes_buf: (length: number): Uint8Array => {
    return nacl.randomBytes(length);
  },
};

export default sodium;
