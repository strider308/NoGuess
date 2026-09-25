/**
 * FakeKms — deterministic test-only key management abstraction.
 *
 * TEST-ONLY. NOT CRYPTOGRAPHIC SECURITY.
 *
 * This is a structural stand-in for a real KMS. It uses a tagged base64
 * encoding to make "encrypted" values obviously non-secure and visually
 * distinct from plaintext. No real encryption algorithm is used.
 *
 * Purpose: allow services to call encrypt/decrypt without coupling to
 * a real secret manager, while keeping test values inspectable.
 *
 * No real credentials or secrets exist in the fixture.
 */

const FAKE_KEY_ID = "fake-key-v1";
const TAG = "FKMS:";

export interface EncryptResult {
  readonly ciphertext: string;  // tagged base64 — NOT encrypted
  readonly keyId: string;
}

export class FakeKms {
  /**
   * "Encrypt" a plaintext string.
   * Returns a tagged base64 string that is obviously not real ciphertext.
   *
   * TEST-ONLY. NOT CRYPTOGRAPHIC SECURITY.
   */
  encrypt(plaintext: string): EncryptResult {
    const encoded = Buffer.from(plaintext, "utf8").toString("base64");
    return {
      ciphertext: `${TAG}${encoded}`,
      keyId: FAKE_KEY_ID,
    };
  }

  /**
   * "Decrypt" a tagged base64 string back to plaintext.
   * Throws if the input does not have the expected fake tag.
   *
   * TEST-ONLY. NOT CRYPTOGRAPHIC SECURITY.
   */
  decrypt(ciphertext: string, keyId: string): string {
    if (keyId !== FAKE_KEY_ID) {
      throw new Error(`FakeKms: unknown keyId "${keyId}"`);
    }
    if (!ciphertext.startsWith(TAG)) {
      throw new Error(
        `FakeKms: ciphertext does not have expected tag "${TAG}". ` +
          `Was it encrypted by FakeKms?`
      );
    }
    const encoded = ciphertext.slice(TAG.length);
    return Buffer.from(encoded, "base64").toString("utf8");
  }

  /** The fixed key ID used by this fake. */
  get keyId(): string {
    return FAKE_KEY_ID;
  }
}
