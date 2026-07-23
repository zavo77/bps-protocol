// Authoritative deterministic EIP-1193 mock provider (Task 8C, local/testing only). The wagmi `injected`
// connector drives ALL wallet operations through this provider exactly as a production injected wallet
// would: eth_requestAccounts, eth_chainId, wallet_switchEthereumChain (mutates state + emits
// `chainChanged`), eth_signTypedData_v4 (signs internally with the deterministic local-test key), and
// eth_sendTransaction (applies state + returns a receipt-backed hash). The deterministic private key
// exists ONLY inside this provider — application panels and production wallet services never import it,
// and never construct a separate wallet client. No live chain, wallet, or key is ever touched.
import { localTestAccount } from "./local-account";
import { createRpcRequest, type MockChainState } from "./mock-rpc";

type Handler = (...args: unknown[]) => void;

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: Handler): void;
  removeListener(event: string, handler: Handler): void;
  // Test-only controls (NOT part of the injected-wallet contract): simulate the wallet-side events a real
  // injected provider would emit. They mutate the mock state and emit the corresponding EIP-1193 event.
  __setAccounts(accounts: readonly string[]): void;
  __disconnect(): void;
}

function stripDomain(types: Record<string, unknown>): Record<string, unknown> {
  const { EIP712Domain: _omit, ...rest } = types as Record<string, unknown>;
  void _omit;
  return rest;
}

// Coerce the JSON typed-data (numbers arrive as strings/hex over JSON-RPC) back to viem-typed values.
function coerceTypedData(json: {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}) {
  const fields = json.types[json.primaryType] ?? [];
  const message: Record<string, unknown> = {};
  for (const f of fields) {
    const v = json.message[f.name];
    if (f.type.startsWith("uint") || f.type.startsWith("int"))
      message[f.name] = BigInt(v as string);
    else if (f.type === "bool") message[f.name] = Boolean(v);
    else message[f.name] = v;
  }
  const domain = { ...json.domain };
  if (domain.chainId != null) domain.chainId = Number(domain.chainId as string);
  return { domain, types: stripDomain(json.types), primaryType: json.primaryType, message };
}

export function createMockEip1193Provider(state: MockChainState): Eip1193Provider {
  const rpc = createRpcRequest(state);
  const listeners: Record<string, Set<Handler>> = {};
  // Accounts the wallet has authorized. `state.accounts` is what is currently EXPOSED (empty while
  // disconnected). Only an explicit eth_requestAccounts re-exposes them — never a passive read.
  let authorized = [...state.accounts];
  const emit = (event: string, ...args: unknown[]) =>
    listeners[event]?.forEach((fn) => {
      fn(...args);
    });

  const request = async ({
    method,
    params,
  }: {
    method: string;
    params?: unknown[];
  }): Promise<unknown> => {
    if (method === "eth_signTypedData_v4") {
      const raw = (params as [string, string])[1];
      const json = typeof raw === "string" ? JSON.parse(raw) : raw;
      const typed = coerceTypedData(json);
      // Signs with the connected account's key (held only here). Recovers to the connected account.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return localTestAccount.signTypedData(typed as any);
    }
    const p = params ?? [];
    if (method === "wallet_switchEthereumChain") {
      const res = await rpc({ method, params: p }); // mutates state.chainId or throws (rejection)
      emit("chainChanged", `0x${state.chainId.toString(16)}`);
      return res;
    }
    if (method === "eth_requestAccounts") {
      // Explicit user consent re-exposes the authorized accounts (models the wallet approval prompt).
      if (state.accounts.length === 0) state.accounts = [...authorized];
      const accts = await rpc({ method, params: p });
      emit("connect", { chainId: `0x${state.chainId.toString(16)}` });
      return accts;
    }
    return rpc({ method, params: p });
  };

  return {
    request,
    on(event, handler) {
      (listeners[event] ??= new Set()).add(handler);
    },
    removeListener(event, handler) {
      listeners[event]?.delete(handler);
    },
    __setAccounts(accounts) {
      authorized = [...accounts];
      state.accounts = [...accounts];
      emit("accountsChanged", [...accounts]);
    },
    __disconnect() {
      // A disconnected wallet exposes NO accounts; eth_accounts must not silently re-expose them. Only an
      // explicit eth_requestAccounts (user consent) re-establishes the session.
      state.accounts = [];
      emit("accountsChanged", []);
      emit("disconnect", { code: 4900, message: "disconnected" });
    },
  };
}
