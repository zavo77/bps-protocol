// Minimal keccak256 + EIP-55 getAddress for the browser operator, built on vendored js-sha3.
// No network, no keys, no signing — pure hashing/formatting only.
import "./sha3.js"; // defines global `keccak256` (hex string -> hex) via js-sha3 UMD
const _k = (globalThis.keccak256 || (globalThis.sha3 && globalThis.sha3.keccak256));

export function keccak256(hexOrBytes) {
  // accept 0x-hex string; return 0x-prefixed hash
  let bytes;
  if (typeof hexOrBytes === "string" && hexOrBytes.startsWith("0x")) {
    const h = hexOrBytes.slice(2);
    bytes = new Uint8Array(h.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.substr(i * 2, 2), 16);
  } else if (typeof hexOrBytes === "string") {
    bytes = new TextEncoder().encode(hexOrBytes);
  } else { bytes = hexOrBytes; }
  return "0x" + _k(bytes);
}

export function getAddress(addr) {
  const a = addr.toLowerCase().replace(/^0x/, "");
  const hash = _k(a).toString(); // keccak of the lowercase ascii hex
  let out = "0x";
  for (let i = 0; i < a.length; i++) out += parseInt(hash[i], 16) >= 8 ? a[i].toUpperCase() : a[i];
  return out;
}
