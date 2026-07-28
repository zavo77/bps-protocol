"use client";
// Launch Lab creation state machine over CreateFlowState.
//
// Sequence: form validation → metadata upload (Pinata via /api/lab/metadata) →
// prepare (/api/lab/prepare: anchor re-verify + exact simulation + manifest) →
// gating (broadcast flag, kill switch, wallet, chain, freshness) → send via the
// wallet → wait for the receipt → decodeAndVerifyReceipt against the manifest.
// Any manifest mismatch is a HARD STOP ('launch-mismatch'); the only exit is reset().
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress, getAddress, keccak256, type Address, type Hex, type PublicClient } from "viem";
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from "wagmi";
import {
  CHAIN_ID,
  decodeAndVerifyReceipt,
  validateMetadataInput,
  type AnchorVerification,
  type CreateFlowState,
  type FeePresetId,
  type LabPublicConfig,
  type LaunchManifest,
  type LaunchReceiptResult,
  type LaunchSimulation,
  type MetadataInput,
  type MetadataUploadResult,
  type PreparedLaunchTransaction,
  type PrepareLaunchPayload,
  type WalletUiState,
} from "@bps/launch-lab";
import { errorMessage, isNotAllowlisted, labFetch } from "./api";
import { useAnchor } from "./use-anchor";
import { useLabConfig } from "./use-lab-config";
import { useSignedRequest } from "./use-signed-request";
import { useWalletUiState } from "./use-wallet-ui-state";

export interface CreateFlowFormState {
  tokenName: string;
  tokenSymbol: string;
  tokenDescription: string;
  imageFile: File | null;
  /** Integer USD. 0 = not yet initialised (defaults from server config). */
  startingFdvUsd: number;
  feePreset: FeePresetId;
  /** Empty string = default to the connected wallet. */
  creatorFeeAddress: string;
  /**
   * Chosen approved-anchor symbol (the market's quote asset). Defaults to GOOGL;
   * sent to the server as `anchorSymbol` in the prepare payload.
   */
  anchorSymbol: string;
  /**
   * Explicit user acknowledgement (experimental, unaffiliated, irreversible).
   * Sent to the server as literal `true` ONLY when the user checked the box —
   * never silently defaulted.
   */
  termsAccepted: boolean;
}

export interface PreparedLaunchBundle {
  manifest: LaunchManifest;
  manifestHash: Hex;
  simulation: LaunchSimulation;
  prepared: PreparedLaunchTransaction;
}

export interface CreateFlowGates {
  walletConnected: boolean;
  chainOk: boolean;
  anchorVerified: boolean;
  metadataConfirmed: boolean;
  simulated: boolean;
  simulationFresh: boolean;
  broadcastEnabled: boolean;
  killSwitchInactive: boolean;
  /** accessMode !== 'disabled' — public/allowlist creation is switched on. */
  creationEnabled: boolean;
  /** The user checked the experimental/irreversible acknowledgement box. */
  termsAccepted: boolean;
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"];

/**
 * Fast client-side mirror of validateMetadataInput's synchronous rules (same
 * regexes/limits) for keystroke feedback. The full validateMetadataInput —
 * including image magic bytes — runs on the real bytes before upload, and the
 * server re-validates authoritatively.
 */
export function liveFormErrors(form: CreateFlowFormState): string[] {
  const errors: string[] = [];
  if (form.tokenName !== "" && !/^[\x20-\x7E]{1,48}$/.test(form.tokenName)) {
    errors.push("Token name must be 1-48 printable ASCII characters.");
  }
  if (form.tokenSymbol !== "" && !/^[A-Z0-9]{1,12}$/.test(form.tokenSymbol)) {
    errors.push("Ticker must be 1-12 characters A-Z or 0-9.");
  }
  if (form.tokenDescription.length > 600) {
    errors.push("Description must be 1-600 characters.");
  }
  if (/[<>]/.test(form.tokenDescription) || /[<>]/.test(form.tokenName)) {
    errors.push("HTML characters are not allowed.");
  }
  if (form.imageFile) {
    if (!ALLOWED_IMAGE_MIME.includes(form.imageFile.type)) {
      errors.push("Image must be PNG, JPEG, or WebP.");
    }
    if (form.imageFile.size === 0 || form.imageFile.size > MAX_IMAGE_BYTES) {
      errors.push("Image must be 1 byte to 4 MB.");
    }
  }
  if (form.startingFdvUsd !== 0) {
    if (
      !Number.isInteger(form.startingFdvUsd) ||
      form.startingFdvUsd < 1_000 ||
      form.startingFdvUsd > 10_000_000
    ) {
      errors.push("Starting FDV must be a whole USD amount between 1,000 and 10,000,000.");
    }
  }
  if (form.creatorFeeAddress.trim() !== "" && !isAddress(form.creatorFeeAddress.trim())) {
    errors.push("Creator fee address is not a valid address.");
  }
  return errors;
}

function safeFilename(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
  return /^[A-Za-z0-9._-]{1,80}$/.test(cleaned) ? cleaned : "token-image";
}

/** Explicit async/terminal phases; everything else is derived. */
type FlowPhase =
  | "idle"
  | "image-uploading"
  | "simulating"
  | "simulation-failure"
  | "awaiting-signature"
  | "transaction-pending"
  | "confirmation-pending"
  | "receipt-decoding"
  | "launch-success"
  | "launch-mismatch";

export interface CreateFlow {
  form: CreateFlowFormState;
  updateForm: (patch: Partial<CreateFlowFormState>) => void;
  formComplete: boolean;
  formErrors: string[];
  metadata: MetadataUploadResult | null;
  bundle: PreparedLaunchBundle | null;
  manifest: LaunchManifest | null;
  manifestHash: Hex | null;
  simulation: LaunchSimulation | null;
  prepared: PreparedLaunchTransaction | null;
  simulationFresh: boolean;
  simulationAgeMs: number | null;
  flowState: CreateFlowState;
  walletState: WalletUiState;
  unauthorised: boolean;
  error: string | null;
  txHash: Hex | null;
  receiptResult: LaunchReceiptResult | null;
  config: LabPublicConfig | undefined;
  anchor: AnchorVerification | undefined;
  anchorLoading: boolean;
  gates: CreateFlowGates;
  canLaunch: boolean;
  uploadMetadata: () => Promise<boolean>;
  prepare: () => Promise<boolean>;
  launch: () => Promise<void>;
  reset: () => void;
  /** Full wizard reset (form + wallet-bound state + persisted draft). */
  startOver: () => void;
  /** Increments whenever the wizard must return to Step 1 (wallet change, start over). */
  resetEpoch: number;
}

// ---- wallet-scoped draft persistence (text fields only; never image bytes,
// never acknowledgement, never metadata/manifest/prepared state). Drafts exist
// ONLY for a connected wallet, keyed by chain + address, so a fresh visitor or
// a different wallet always starts empty. ----
const DRAFT_KEYS = [
  "tokenName",
  "tokenSymbol",
  "tokenDescription",
  "startingFdvUsd",
  "feePreset",
  "creatorFeeAddress",
  "anchorSymbol",
] as const;
type DraftShape = Pick<CreateFlowFormState, (typeof DRAFT_KEYS)[number]>;

function draftKey(chainId: number, address: string): string {
  return `bps.lab.launchDraft.v1.${chainId}.${address.toLowerCase()}`;
}

function saveDraft(chainId: number, address: string, form: CreateFlowFormState): void {
  if (typeof window === "undefined") return;
  try {
    const draft: Partial<DraftShape> = {};
    for (const k of DRAFT_KEYS) (draft as Record<string, unknown>)[k] = form[k];
    window.localStorage.setItem(draftKey(chainId, address), JSON.stringify(draft));
  } catch {
    /* storage unavailable — drafts simply don't persist */
  }
}

function loadDraft(chainId: number, address: string): Partial<DraftShape> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(chainId, address));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of DRAFT_KEYS) {
      if (k in parsed) out[k] = parsed[k];
    }
    if (typeof out.tokenName !== "string" || typeof out.tokenSymbol !== "string") return null;
    return out as Partial<DraftShape>;
  } catch {
    return null;
  }
}

function clearDraft(chainId: number, address: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(draftKey(chainId, address));
  } catch {
    /* ignore */
  }
}

const EMPTY_FORM: CreateFlowFormState = {
  tokenName: "",
  tokenSymbol: "",
  tokenDescription: "",
  imageFile: null,
  startingFdvUsd: 0,
  feePreset: "BALANCED_1",
  creatorFeeAddress: "",
  anchorSymbol: "GOOGL",
  termsAccepted: false,
};

export function useCreateFlow(): CreateFlow {
  const router = useRouter();
  // The WALLET's actual chain. wagmi's useChainId() reflects only the app
  // config (always 4663 here) and cannot see a wallet sitting on another chain
  // — using it caused the live raw-ChainMismatchError P0. All chain gating and
  // draft scoping below use the account chain.
  const { address, chainId: walletChainId } = useAccount();
  const chainId = walletChainId ?? CHAIN_ID;
  // Hard-stop only when a CONNECTED wallet sits on another chain; while
  // disconnected the connect prompts handle the flow.
  const chainBlocked = walletChainId !== undefined && walletChainId !== CHAIN_ID;
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const signRequest = useSignedRequest();

  const configQuery = useLabConfig();
  const anchorQuery = useAnchor();
  const config = configQuery.data;
  const anchor = anchorQuery.data;

  const [form, setFormState] = useState<CreateFlowFormState>(EMPTY_FORM);
  const [resetEpoch, setResetEpoch] = useState(0);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<MetadataUploadResult | null>(null);
  const [bundle, setBundle] = useState<PreparedLaunchBundle | null>(null);
  const [payloadUsed, setPayloadUsed] = useState<PrepareLaunchPayload | null>(null);
  const [prepareRequested, setPrepareRequested] = useState(false);
  const [phase, setPhase] = useState<FlowPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [unauthorised, setUnauthorised] = useState(false);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [receiptResult, setReceiptResult] = useState<LaunchReceiptResult | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const broadcastRef = useRef(false);

  const walletState = useWalletUiState(config, { unauthorised });

  // Defaults from server config once it arrives (first initialisation only).
  useEffect(() => {
    if (config && form.startingFdvUsd === 0) {
      setFormState((f) => ({
        ...f,
        startingFdvUsd: config.startingFdvUsd,
        feePreset: config.defaultFeePreset,
      }));
    }
  }, [config, form.startingFdvUsd]);

  // ---- wallet identity boundary ----
  // The wizard's wallet-bound state (metadata, manifest, prepared tx, review)
  // belongs to exactly ONE (chainId, address). When the address changes or the
  // wallet disconnects after having been connected, EVERYTHING — including the
  // typed form — is cleared and the wizard returns to Step 1, so no visitor can
  // ever see a previous wallet's draft. A first-time connect (disconnected →
  // connected) keeps what the same visitor just typed, then hydrates any saved
  // draft for that wallet into still-empty fields.
  const identityRef = useRef<string | null>(null);
  useEffect(() => {
    const identity = address ? `${chainId}:${address.toLowerCase()}` : null;
    const prev = identityRef.current;
    identityRef.current = identity;
    if (prev === identity) return;
    if (prev !== null) {
      const prevAddress = prev.split(":")[1] ?? null;
      const sameAddress = prevAddress !== null && prevAddress === (address?.toLowerCase() ?? null);
      // Wallet-bound state (metadata, manifest, prepared tx, review, errors)
      // is ALWAYS invalidated when the account or chain changes.
      setMetadata(null);
      setBundle(null);
      setPayloadUsed(null);
      setPrepareRequested(false);
      setPhase("idle");
      setError(null);
      setUnauthorised(false);
      setTxHash(null);
      setReceiptResult(null);
      setUploadErrors([]);
      broadcastRef.current = false;
      setResetEpoch((n) => n + 1);
      // The typed FORM is wiped only when the ACCOUNT changed (or disconnected)
      // — never show one wallet's draft to another. A chain-only switch by the
      // same account (e.g. Mainnet → Robinhood Chain) keeps their typed text so
      // the flow resumes safely after switching networks.
      if (!sameAddress) {
        setFormState(EMPTY_FORM);
      }
    }
    if (identity && address) {
      // Hydrate this wallet's saved draft into fields that are still empty.
      const draft = loadDraft(chainId, address);
      if (draft) {
        setFormState((f) => ({
          ...f,
          tokenName: f.tokenName || (draft.tokenName ?? ""),
          tokenSymbol: f.tokenSymbol || (draft.tokenSymbol ?? ""),
          tokenDescription: f.tokenDescription || (draft.tokenDescription ?? ""),
          creatorFeeAddress: f.creatorFeeAddress || (draft.creatorFeeAddress ?? ""),
          anchorSymbol: draft.anchorSymbol ?? f.anchorSymbol,
          startingFdvUsd: f.startingFdvUsd || (draft.startingFdvUsd ?? 0),
          feePreset: draft.feePreset ?? f.feePreset,
        }));
      }
    }
  }, [address, chainId]);

  // Persist the connected wallet's TEXT draft (never image bytes, never the
  // acknowledgement, never metadata/manifest/prepared state). Disconnected
  // visitors are never persisted — a fresh visitor always starts empty.
  useEffect(() => {
    if (!address) return;
    const t = setTimeout(() => saveDraft(chainId, address, form), 400);
    return () => clearTimeout(t);
  }, [address, chainId, form]);

  // Freshness ticker (5 s) while a prepared transaction exists.
  useEffect(() => {
    if (!bundle) return;
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, [bundle]);

  const updateForm = useCallback((patch: Partial<CreateFlowFormState>) => {
    setFormState((f) => ({ ...f, ...patch }));
    setUploadErrors([]);
  }, []);

  const formErrors = useMemo(
    () => [...liveFormErrors(form), ...uploadErrors],
    [form, uploadErrors],
  );
  const formComplete =
    form.tokenName.trim() !== "" &&
    form.tokenSymbol.trim() !== "" &&
    form.tokenDescription.trim() !== "" &&
    form.imageFile !== null;

  const simulationFresh = bundle !== null && Date.now() <= bundle.prepared.staleAfter && now > 0;
  const simulationAgeMs = bundle ? Math.max(0, now - bundle.simulation.simulationTimestamp) : null;

  const anchorVerified = anchor?.status === "verified";
  const chainOk = chainId === CHAIN_ID;
  const creationEnabled = config !== undefined && config.accessMode !== "disabled";
  const gates: CreateFlowGates = {
    walletConnected: walletState !== "disconnected",
    chainOk: walletState !== "disconnected" && chainOk,
    anchorVerified,
    metadataConfirmed: metadata !== null && metadata.provider === "pinata",
    simulated: bundle !== null,
    simulationFresh,
    broadcastEnabled: config?.broadcastEnabled === true,
    killSwitchInactive: config !== undefined && config.killSwitchActive === false,
    creationEnabled,
    termsAccepted: form.termsAccepted,
  };

  const flowState: CreateFlowState = useMemo(() => {
    if (phase !== "idle") return phase;
    // accessMode 'disabled' blocks creation exactly like the kill switch.
    if (config?.accessMode === "disabled") return "kill-switch-active";
    if (!formComplete) return "form-incomplete";
    if (formErrors.length > 0) return "form-invalid";
    // Form done but metadata not yet confirmed → still an incomplete flow input.
    if (!metadata) return "form-incomplete";
    if (!prepareRequested && !bundle) return "metadata-confirmed";
    if (!bundle) {
      if (anchorQuery.isPending || anchor?.status === "verifying") return "anchor-verifying";
      if (anchorQuery.isError || !anchor || anchor.status !== "verified") return "anchor-mismatch";
      return "anchor-verified";
    }
    if (config?.killSwitchActive) return "kill-switch-active";
    if (config && !config.broadcastEnabled) return "broadcast-disabled";
    if (!anchorVerified) return "anchor-mismatch";
    if (
      walletState !== "connected" ||
      !simulationFresh ||
      !gates.metadataConfirmed ||
      !form.termsAccepted ||
      config === undefined
    ) {
      return "simulation-success";
    }
    return "ready-to-launch";
  }, [
    phase,
    formComplete,
    formErrors.length,
    metadata,
    prepareRequested,
    bundle,
    anchorQuery.isPending,
    anchorQuery.isError,
    anchor,
    config,
    anchorVerified,
    walletState,
    simulationFresh,
    gates.metadataConfirmed,
    form.termsAccepted,
  ]);

  const ensureChain = useCallback(async () => {
    if (walletChainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID });
  }, [walletChainId, switchChainAsync]);

  /** Hard stop for every wallet-bound step while off Robinhood Chain. */
  const WRONG_CHAIN_MESSAGE = "Switch to Robinhood Chain to continue.";

  const failFromError = useCallback((e: unknown) => {
    if (isNotAllowlisted(e)) setUnauthorised(true);
    setError(errorMessage(e));
  }, []);

  const uploadMetadata = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!address) {
      setError("Connect a wallet before uploading metadata.");
      return false;
    }
    if (chainBlocked) {
      setError(WRONG_CHAIN_MESSAGE);
      return false;
    }
    const file = form.imageFile;
    if (!file) {
      setError("Choose a token image first.");
      return false;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const input: MetadataInput = {
        tokenName: form.tokenName,
        tokenSymbol: form.tokenSymbol,
        tokenDescription: form.tokenDescription,
        imageBytes: bytes,
        imageMime: file.type as MetadataInput["imageMime"],
        imageFilename: safeFilename(file.name || "token-image"),
      };
      const fullErrors = validateMetadataInput(input);
      if (fullErrors.length > 0) {
        setUploadErrors(fullErrors);
        return false;
      }
      await ensureChain();
      const payload = {
        tokenName: form.tokenName,
        tokenSymbol: form.tokenSymbol,
        tokenDescription: form.tokenDescription,
        imageHash: keccak256(bytes),
        imageMime: file.type,
      };
      const envelope = await signRequest("metadata-upload", payload);
      setPhase("image-uploading");
      const fd = new FormData();
      fd.append("envelope", JSON.stringify(envelope));
      fd.append(
        "fields",
        JSON.stringify({
          tokenName: form.tokenName,
          tokenSymbol: form.tokenSymbol,
          tokenDescription: form.tokenDescription,
        }),
      );
      fd.append("image", file, input.imageFilename);
      const result = await labFetch<MetadataUploadResult>("/api/lab/metadata", {
        method: "POST",
        body: fd,
      });
      setMetadata(result);
      setBundle(null);
      setPayloadUsed(null);
      setPrepareRequested(false);
      setPhase("idle");
      return true;
    } catch (e) {
      setPhase("idle");
      failFromError(e);
      return false;
    }
  }, [address, chainBlocked, form, ensureChain, signRequest, failFromError]);

  const buildPayload = useCallback((): PrepareLaunchPayload | null => {
    if (!address || !metadata) return null;
    // Never silently send termsAccepted: true — only when the user checked it.
    if (!form.termsAccepted) return null;
    const feeRaw = form.creatorFeeAddress.trim();
    const creatorFee = feeRaw === "" ? address : feeRaw;
    if (!isAddress(creatorFee)) return null;
    return {
      tokenName: form.tokenName,
      tokenSymbol: form.tokenSymbol,
      tokenDescription: form.tokenDescription,
      tokenUri: metadata.tokenUri,
      imageCid: metadata.imageCid,
      metadataCid: metadata.metadataCid,
      metadataProvider: "pinata",
      startingFdvUsd: Math.trunc(form.startingFdvUsd),
      feePreset: form.feePreset,
      creatorAddress: address,
      creatorFeeAddress: getAddress(creatorFee) as Address,
      anchorSymbol: form.anchorSymbol || "GOOGL",
      termsAccepted: true,
    };
  }, [address, metadata, form]);

  const prepare = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (chainBlocked) {
      setError(WRONG_CHAIN_MESSAGE);
      return false;
    }
    if (!form.termsAccepted) {
      setError(
        "Check the acknowledgement box (experimental, unaffiliated, irreversible) before preparing a launch.",
      );
      return false;
    }
    if (config?.accessMode === "disabled") {
      setError("Market creation is currently disabled.");
      return false;
    }
    setPrepareRequested(true);
    if (metadata && metadata.provider !== "pinata") {
      setError("Token metadata is not a production IPFS upload; broadcast would be refused.");
      return false;
    }
    const payload = buildPayload();
    if (!payload) {
      setError("Complete the form, upload metadata, and connect the creator wallet first.");
      return false;
    }
    // Fail-closed anchor check before asking the wallet to sign anything.
    const anchorNow = anchor ?? (await anchorQuery.refetch()).data;
    if (!anchorNow || anchorNow.status !== "verified") {
      setError(anchorNow?.mismatchReason ?? "GOOGL anchor verification failed.");
      return false;
    }
    try {
      await ensureChain();
      const envelope = await signRequest("prepare-launch", payload);
      setPhase("simulating");
      const fresh = await labFetch<PreparedLaunchBundle>("/api/lab/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ envelope, payload }),
      });
      setBundle(fresh);
      setPayloadUsed(payload);
      setNow(Date.now());
      setPhase("idle");
      return true;
    } catch (e) {
      failFromError(e);
      setPhase("simulation-failure");
      return false;
    }
  }, [
    chainBlocked,
    form.termsAccepted,
    config,
    metadata,
    buildPayload,
    anchor,
    anchorQuery,
    ensureChain,
    signRequest,
    failFromError,
  ]);

  /** Re-simulate via /api/lab/simulate (requires a fresh signature; 180 s rule). */
  const resimulate = useCallback(async (): Promise<PreparedLaunchBundle | null> => {
    if (!bundle || !payloadUsed) return null;
    const envelope = await signRequest("prepare-launch", payloadUsed);
    setPhase("simulating");
    const fresh = await labFetch<{
      simulation: LaunchSimulation;
      prepared: PreparedLaunchTransaction;
      manifestHash: Hex;
    }>("/api/lab/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ envelope, payload: payloadUsed }),
    });
    const merged: PreparedLaunchBundle = {
      manifest: bundle.manifest,
      manifestHash: fresh.manifestHash,
      simulation: fresh.simulation,
      prepared: fresh.prepared,
    };
    setBundle(merged);
    setNow(Date.now());
    return merged;
  }, [bundle, payloadUsed, signRequest]);

  const launch = useCallback(async (): Promise<void> => {
    if (phase === "launch-mismatch" || phase === "launch-success") return; // hard stop / done
    setError(null);
    // The launch transaction can NEVER be sent while the wallet is on another
    // chain — hard stop before anything reaches the wallet.
    if (chainBlocked) {
      setError(WRONG_CHAIN_MESSAGE);
      return;
    }
    if (!config || !bundle || !address || !publicClient) {
      setError("Launch prerequisites are missing.");
      return;
    }
    if (config.killSwitchActive) {
      setError("The kill switch is active; launches are halted.");
      return;
    }
    if (config.accessMode === "disabled") {
      setError("Market creation is currently disabled.");
      return;
    }
    if (!config.broadcastEnabled) {
      setError("Broadcasting is disabled by server configuration.");
      return;
    }
    if (!form.termsAccepted) {
      setError(
        "Check the acknowledgement box (experimental, unaffiliated, irreversible) before launching.",
      );
      return;
    }
    if (!anchorVerified) {
      setError("GOOGL anchor is not verified.");
      return;
    }
    if (!metadata || metadata.provider !== "pinata") {
      setError("Token metadata is not a broadcastable production IPFS upload.");
      return;
    }
    broadcastRef.current = false;
    try {
      await ensureChain();
      let active = bundle;
      if (Date.now() > active.prepared.staleAfter) {
        const fresh = await resimulate();
        if (!fresh) throw new Error("Re-simulation before send failed.");
        active = fresh;
      }
      setPhase("awaiting-signature");
      const hash = await sendTransactionAsync({
        to: active.prepared.to,
        data: active.prepared.data,
        value: 0n,
        gas: BigInt(active.prepared.gas),
        chainId: CHAIN_ID,
      });
      broadcastRef.current = true;
      setTxHash(hash);
      setPhase("transaction-pending");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setPhase("confirmation-pending");
      // Give React a frame to render the confirmation state before decoding.
      await new Promise((r) => setTimeout(r, 30));
      setPhase("receipt-decoding");
      const result = await decodeAndVerifyReceipt(
        publicClient as unknown as PublicClient,
        active.manifest,
        active.simulation.predictedTokenAddress,
        receipt,
      );
      setReceiptResult(result);
      if (result.matchesManifest) {
        // Fire-and-forget: register the confirmed launch so the public list
        // updates promptly. The server verifies everything from chain and the
        // list is chain-reconstructed regardless, so failures are non-fatal.
        // The manifest is included so the server can persist the immutable
        // launch facts — it only stores them if the canonical hash matches the
        // manifest it issued at prepare time.
        void labFetch<{ registered: boolean }>("/api/lab/launches", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ transactionHash: hash, manifest: active.manifest }),
        }).catch(() => {});
        setPhase("launch-success");
        router.push(`/lab/token/${result.tokenAddress}`);
      } else {
        // HARD STOP: never continue past a manifest mismatch.
        setPhase("launch-mismatch");
      }
    } catch (e) {
      failFromError(e);
      // After broadcast, a failure means the launch is UNVERIFIED — hard stop.
      setPhase(broadcastRef.current ? "launch-mismatch" : "idle");
    }
  }, [
    phase,
    chainBlocked,
    config,
    bundle,
    address,
    publicClient,
    anchorVerified,
    metadata,
    form.termsAccepted,
    ensureChain,
    resimulate,
    sendTransactionAsync,
    router,
    failFromError,
  ]);

  const reset = useCallback(() => {
    setMetadata(null);
    setBundle(null);
    setPayloadUsed(null);
    setPrepareRequested(false);
    setPhase("idle");
    setError(null);
    setUnauthorised(false);
    setTxHash(null);
    setReceiptResult(null);
    setUploadErrors([]);
    broadcastRef.current = false;
  }, []);

  // "Start over": everything reset — form, wallet-bound state, and the
  // persisted draft for the current wallet — back to an empty Step 1.
  const startOver = useCallback(() => {
    if (address) clearDraft(chainId, address);
    setFormState(
      config
        ? { ...EMPTY_FORM, startingFdvUsd: config.startingFdvUsd, feePreset: config.defaultFeePreset }
        : EMPTY_FORM,
    );
    reset();
    setResetEpoch((n) => n + 1);
  }, [address, chainId, config, reset]);

  return {
    form,
    updateForm,
    formComplete,
    formErrors,
    metadata,
    bundle,
    manifest: bundle?.manifest ?? null,
    manifestHash: bundle?.manifestHash ?? null,
    simulation: bundle?.simulation ?? null,
    prepared: bundle?.prepared ?? null,
    simulationFresh,
    simulationAgeMs,
    flowState,
    walletState,
    unauthorised,
    error,
    txHash,
    receiptResult,
    config,
    anchor,
    anchorLoading: anchorQuery.isPending,
    gates,
    canLaunch: flowState === "ready-to-launch",
    uploadMetadata,
    prepare,
    launch,
    reset,
    startOver,
    resetEpoch,
  };
}
