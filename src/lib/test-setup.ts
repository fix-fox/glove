import { webcrypto } from "crypto";

if (typeof globalThis.crypto === "undefined") {
  // @ts-expect-error Node 18 webcrypto is close enough to the Web Crypto API
  globalThis.crypto = webcrypto;
}
