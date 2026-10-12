import nacl from "tweetnacl";

/*
 * Derive the public identity key from a private identity key. The identity
 * keypair is generated with libsodium's crypto_box_keypair (Curve25519) and
 * tweetnacl derives the exact same Curve25519 public key, so this returns the
 * public key that was registered for that private key.
 *
 * It lives in its own module so both the identity module and the recovery
 * module can use it without creating an import cycle.
 */
export async function derivePublicKeyFromPrivateKey(
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  return nacl.box.keyPair.fromSecretKey(privateKey).publicKey; // returns in unit8array format
}
