// Deterministic LOCAL-TEST account (Task 8B, local/testing only). Derived from a label — not a real or
// known credential. Used solely to (a) give the wagmi mock connector a stable address and (b) sign the
// LOCAL-TEST declaration in local/demo mode. Never used in live mode; live signing goes through the
// user's injected wallet. No production key material.
import { keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const LOCAL_TEST_PRIVATE_KEY = keccak256(stringToHex("bps-task8b-local-test-wallet"));
export const localTestAccount = privateKeyToAccount(LOCAL_TEST_PRIVATE_KEY);
export const LOCAL_TEST_ADDRESS = localTestAccount.address;
