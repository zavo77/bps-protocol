// TASK 10D-2 — provider-agnostic canary EXECUTION operator engine (fail-closed + restart-safe).
// SAFETY: never handles a key/seed/keystore/raw signature; never eth_sendRawTransaction; no local signer,
// session keys, AA, batching, auto-send, or auto-retry. One eth_sendTransaction per step, explicit only.
//
// States: bound -> connected -> reconciled. preconditions()/sendCurrent() fail closed unless ALL THREE.
// Durable state (keyed by executionPacketDigest): journal, pending, halt/uncertain-send. current step is
// NEVER trusted from raw localStorage length — it is set only by reconcile() after exact validation of
// every journal tx + receipt + a cumulative current-state checkpoint (no in-memory _before dependence).

import { buildCanonical, digestOf, validateStrict, rawDuplicateKeys } from "./canonical.mjs";

const FORBIDDEN_METHODS = new Set(["eth_sendRawTransaction", "eth_sign", "personal_sign", "eth_signTransaction", "eth_signTypedData", "eth_signTypedData_v4", "wallet_addEthereumChain", "wallet_switchEthereumChain"]);
const SLOTS = ["canaryToken", "lockingVault", "claimManager", "rialtoAdapter", "coordinator", "stockVault", "uniswapAdapter", "tradeRouter"];
const SCOPE = "BPSC-TEST canary only; Robinhood Chain mainnet; maximum all-inclusive exposure $130; individual Rabby approvals; canonical BPS production excluded.";
const EVSIG = {
  erc20Approval: "Approval(address,address,uint256)",
  erc20Transfer: "Transfer(address,address,uint256)",
  erc721Transfer: "Transfer(address,address,uint256)",
  poolCreated: "PoolCreated(address,address,uint24,int24,address)",
  poolInitialize: "Initialize(uint160,int24)",
  increaseLiquidity: "IncreaseLiquidity(uint256,uint128,uint256,uint256)",
  officialBuy: "OfficialBuy(uint256,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address,address)",
  officialSell: "OfficialSell(uint256,address,address,uint256,uint256,uint256,uint256,uint256,uint256,address,address)",
  lockCreated: "LockCreated(address,uint256,uint256,uint64,uint32,uint64,uint16,uint16)",
};

export class CanaryOperator {
  constructor({ packet, policy, snapshot, reviewedAuthorization, reviewedAuthorizationRaw, provider, keccak256, getAddress, priceProvider, storage, now = () => Date.now(), receiptPolls = 180, pollMs = 500, keyPrefix = "canary", keyDigest = null }) {
    this._keyPrefix = keyPrefix; this._keyDigest = keyDigest;
    // Raw inputs are consumed ONLY by bindAndVerifyPacket(); they are set to null after a successful bind so
    // that no runtime method can read an unbound value. this.canon (the packaged, digest-anchored object) is
    // the SINGLE runtime data source. this.steps + this.addr + all expectations are built from it in bind().
    this.packet = packet; this.policy = policy; this.snapshot = snapshot;
    this.reviewedAuthorization = reviewedAuthorization || null;
    this.reviewedAuthorizationRaw = reviewedAuthorizationRaw || (reviewedAuthorization ? JSON.stringify(reviewedAuthorization) : null);
    this.canon = null; this.steps = []; this.addr = {};
    this.keccak256 = keccak256; this.getAddress = getAddress; this.priceProvider = priceProvider;
    this.storage = storage || memStore(); this.now = now; this.receiptPolls = receiptPolls; this.pollMs = pollMs;
    // execDigest is used only to key durable storage; it is re-validated by binding before any runtime use.
    this.execDigest = packet && packet.meta ? packet.meta.executionPacketDigest : (reviewedAuthorization && reviewedAuthorization.digests ? reviewedAuthorization.digests.executionPacketDigest : null);
    this.delayedDisabled = true;
    // explicit states — start fully closed
    this.bound = false; this.connected = false; this.reconciled = false;
    this.halted = false; this.haltReason = null; this.uncertainSend = null;
    // durable state (keyed by digest + namespace; the v6 recovery operator uses a DISTINCT namespace so it
    // never reads, mutates, clears or migrates the halted v5 records).
    const kd = keyDigest || this.execDigest;
    this._kHalt = keyPrefix + ":halt:" + kd; this._kJournal = keyPrefix + ":journal:" + kd; this._kPending = keyPrefix + ":pending:" + kd; this._kIntent = keyPrefix + ":intent:" + kd;
    const h = JSON.parse(this.storage.get(this._kHalt) || "null");
    if (h) { this.halted = true; this.haltReason = h.reason; this.uncertainSend = h.uncertainSend || null; }
    this.journal = JSON.parse(this.storage.get(this._kJournal) || "[]");   // UNTRUSTED until reconcile()
    this.pending = JSON.parse(this.storage.get(this._kPending) || "null");
    this.intent = JSON.parse(this.storage.get(this._kIntent) || "null");   // (10D-4) durable in-flight send intent
    // A persisted in-flight intent whose step is neither already journaled nor covered by a pending record
    // means a crash between intent-persistence and the wallet response: stay HALTED as an uncertain send
    // (never blind-retry). A journaled step (intent-clear failed after success) is stale and harmless.
    if (this.intent && !this.uncertainSend) {
      const journaled = this.journal.some(j => j.step === this.intent.step);
      const pendingForStep = this.pending && this.pending.step === this.intent.step;
      if (!journaled && !pendingForStep) { this.halted = true; this.uncertainSend = this.intent; this.haltReason = "in-flight send intent persisted with no confirmed tx hash or journal entry — reconciliation required (no blind retry)"; }
    }
    this.current = 0; // authoritative only after reconcile()
  }

  _persistHalt(reason, uncertainSend = null) { this.halted = true; this.haltReason = reason; this.uncertainSend = uncertainSend; try { this.storage.set(this._kHalt, JSON.stringify({ reason, uncertainSend })); } catch { } }
  _halt(reason) { this._persistHalt(reason, this.uncertainSend); return { ok: false, halted: true, reason }; }
  // (10D-4) durable write with read-back verification: returns true ONLY if the value round-trips through storage.
  _durableSet(key, value) { try { this.storage.set(key, value); return this.storage.get(key) === value; } catch { return false; } }
  async _req(provider, method, params = []) { if (FORBIDDEN_METHODS.has(method)) throw new Error("FORBIDDEN wallet method blocked: " + method); return provider.request({ method, params }); }
  _utf8ToHex(s) { let h = "0x"; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h += (c < 16 ? "0" : "") + c.toString(16); } return h; }
  _stable(v) { return Array.isArray(v) ? "[" + v.map(x => this._stable(x)).join(",") + "]" : (v && typeof v === "object") ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + this._stable(v[k])).join(",") + "}" : JSON.stringify(v); }
  _signable(t) { return { chainId: t.chainId, signer: this.getAddress(t.signer), nonce: t.nonce, type: 2, to: t.to ? this.getAddress(t.to) : null, value: t.value || "0", data: t.dataOrInitCode, gasLimit: t.gasLimit, maxFeePerGas: t.maxFeePerGas, maxPriorityFeePerGas: t.maxPriorityFeePerGas }; }
  _signableHash(t) { return this.keccak256(this._utf8ToHex(this._stable(this._signable(t)))); }

  // ---- (1)(5)(10D-3) bind: canonical reviewed-authorization anchoring + full packet/policy/snapshot binding ----
  bindAndVerifyPacket() {
    const a = this.packet, p = this.policy, s = this.snapshot, c = {}, A = this.getAddress;

    // ===== (10D-3) CANONICAL REVIEWED-AUTHORIZATION BINDING (authoritative) =====
    // Reconstruct the canonical object over EVERY security-relevant leaf from the runtime inputs, and require
    // three INDEPENDENT digest anchors (packet, policy, packaged operator) to agree with it. A single leaf
    // mutation changes the reconstruction digest; recomputing one adjacent anchor cannot make the others agree.
    const recon = buildCanonical({ packet: a, policy: p, snapshot: s, getAddress: A });
    c.canonicalReconstructs = recon.errors.length === 0;
    const digestR = recon.object ? digestOf(recon.object, this.keccak256) : null;
    const pkg = this.reviewedAuthorization, raw = this.reviewedAuthorizationRaw || (pkg ? JSON.stringify(pkg) : "");
    const strictErr = pkg ? validateStrict(pkg, raw, A) : ["packaged reviewed-authorization missing"];
    const dupKeys = pkg ? rawDuplicateKeys(raw) : ["<missing>"];
    c.packagedReviewedAuthorizationValid = strictErr.length === 0;
    c.packagedNoDuplicateKeys = dupKeys.length === 0;
    const digestP = pkg ? digestOf(pkg, this.keccak256) : null;
    const anchorPacket = a.meta && a.meta.reviewedAuthorizationDigest, anchorPolicy = p.reviewedAuthorizationDigest;
    const eq = (x, y) => !!x && !!y && String(x).toLowerCase() === String(y).toLowerCase();
    // ALL FOUR must be identical: reconstruction, packaged, packet anchor, policy anchor.
    c.reviewedDigestAnchorsAgree = eq(digestR, digestP) && eq(digestR, anchorPacket) && eq(digestR, anchorPolicy);
    // reconstruction must structurally equal the packaged bound object (defense in depth beyond the digest)
    c.reconMatchesPackaged = !!recon.object && !!pkg && this._stable(recon.object) === this._stable(pkg);

    // per-index coverage: recompute digest over EXACTLY the ordered per-index signables; also require the
    // step array to line up 1:1 with immediate txs (index i, expected sequential nonce), delayed appended.
    const perIndex = a.immediateTransactions.map((t, i) => ({ i, ...this._signable(t) }));
    const recomputed = this.keccak256(this._utf8ToHex(this._stable(a.immediateTransactions.concat([a.delayedWithdrawalSubPacket]).map(t => this._signable(t)))));
    c.execDigestMatches = recomputed.toLowerCase() === this.execDigest.toLowerCase();
    const dstart = a.meta.startNonces.deployer, tstart = a.meta.startNonces.tester; let di = 0, tii = 0, cov = true;
    a.immediateTransactions.forEach((t, i) => { const exp = A(t.signer) === A(a.meta.deployer) ? dstart + (di++) : tstart + (tii++); if (t.nonce !== exp) cov = false; });
    c.perIndexCoverage = cov && perIndex.length === a.immediateTransactions.length;
    // chain / canary / production / scope / wallets
    c.chainId4663 = a.meta.chainId === 4663 && p.chainId === 4663;
    c.canaryNotProduction = a.meta.authorization && a.meta.authorization.canary === true && a.meta.authorization.production === false && p.canary === true && p.production === false;
    c.scopeExact = a.meta.authorization && a.meta.authorization.scope === SCOPE && p.authorizationScope === SCOPE;
    c.walletsConsistent = A(p.wallets.deployer) === A(a.meta.deployer) && A(p.wallets.tester) === A(a.meta.tester);
    c.noncesConsistent = a.meta.startNonces.deployer === s.nonces.deployer && a.meta.startNonces.tester === s.nonces.tester && p.expectedNonces.deployer === s.nonces.deployer && p.expectedNonces.tester === s.nonces.tester;
    // snapshot (block/hash/ts/baseFee) across policy, packet meta, block-snapshot
    c.snapshotConsistent = String(s.pinnedBlock.number) === String(p.snapshot.forkBlock) && s.pinnedBlock.hash.toLowerCase() === p.snapshot.forkHash.toLowerCase() && a.meta.forkBlock === String(p.snapshot.forkBlock) && a.meta.forkBlockHash.toLowerCase() === p.snapshot.forkHash.toLowerCase() && a.meta.forkTimestamp === String(p.snapshot.forkTimestamp) && a.meta.forkBaseFeePerGasWei === p.snapshot.baseFeePerGasWei && String(s.pinnedBlock.baseFeePerGasWei) === p.snapshot.baseFeePerGasWei;
    // infrastructure addresses: policy == packet.addressGuards.infrastructure (WETH/factory/NPM/swap/registry/pool)
    const infra = new Set(a.addressGuards.infrastructure.map(x => A(x)));
    c.infraConsistent = [p.infrastructure.weth, p.infrastructure.uniswapV3Factory, p.infrastructure.nonfungiblePositionManager, p.infrastructure.swapRouter02, p.infrastructure.rialtoRegistry, a.addressGuards.poolAddress].every(x => infra.has(A(x)));
    // gas limits + fee bounds: policy.gas == packet.reviewPolicySnapshot.gas; feeBounds match policy
    c.gasConsistent = a.reviewPolicySnapshot && this._stable(a.reviewPolicySnapshot.gas) === this._stable(p.gas) && a.meta.feeBounds.maxFeePerGasWei === p.gas.maxFeePerGasWei && a.meta.feeBounds.maxPriorityFeePerGasWei === p.gas.maxPriorityFeePerGasWei && a.meta.feeBounds.pinnedBaseFeePerGasWei === p.snapshot.baseFeePerGasWei;
    // caps: policy.caps == packet.reviewPolicySnapshot.caps
    c.capsConsistent = a.reviewPolicySnapshot && this._stable(a.reviewPolicySnapshot.caps) === this._stable(p.caps);
    // validity
    c.validityConsistent = a.meta.validityWindowSeconds === p.validity.windowSeconds && !!a.meta.expiresAtUtc && !!a.meta.generatedAtUtc;
    // authorization flags true in packet AND policy
    c.flagsAuthorized = ["broadcastReady", "liveWritesApproved", "executionAuthorized", "fundingAuthorized"].every(k => a.safetyFlags[k] === true && p.safetyFlags[k] === true);
    // runtime cap must equal exactly $130 in the reconstruction (the canonical object binds it)
    c.capIs130 = !!recon.object && recon.object.maxAllInclusiveExposureUsd === 130;
    // dependency hashes recorded (per-tx live check happens in preconditions/reconcile)
    c.dependencyHashesRecorded = a.addressGuards && s.externalCodeHashes && Object.keys(s.externalCodeHashes).length === 6;
    const ok = Object.values(c).every(Boolean);
    this.bound = ok;
    if (!ok) { this._halt("packet binding failed: " + Object.entries(c).filter(([, v]) => !v).map(([k]) => k).join(",")); return { ok, digest: recomputed, reviewedAuthorizationDigest: digestR, checks: c }; }

    // ===== (10D-3/10D-4) SINGLE BOUND RUNTIME DATA SOURCE =====
    // After binding, ALL security-relevant runtime values come ONLY from the validated, digest-anchored
    // canonical object. this.steps, this.addr, and every expectation are built from it; the raw packet /
    // policy / snapshot are then discarded so no runtime method can read an unbound value.
    const cc = pkg; this.canon = cc;
    this.capMicro = BigInt(cc.maxAllInclusiveExposureUsd) * 1_000_000n;
    this.DEPLOYER = A(cc.wallets.deployer); this.TESTER = A(cc.wallets.tester);
    this.WETH = A(cc.infrastructure.weth); this.FACTORY = A(cc.infrastructure.uniswapV3Factory); this.NPM = A(cc.infrastructure.nonfungiblePositionManager);
    this.SWAP = A(cc.infrastructure.swapRouter02); this.REGISTRY = A(cc.infrastructure.rialtoRegistry); this.NVDA = A(cc.infrastructure.nvdaStockToken);
    this.pool = A(cc.pool);
    this.addr = {}; for (const k of Object.keys(cc.predicted)) this.addr[k] = A(cc.predicted[k]);
    // build this.steps from the canonical transactions; derive maxGasCostWei = gasLimit*maxFeePerGas.
    this.steps = cc.transactions.immediate.map(t => {
      const st = { index: t.index, phase: t.phase, label: t.label, postconditionType: t.postconditionType, chainId: 4663, signer: A(t.signer), nonce: t.nonce, to: t.to ? A(t.to) : null, value: t.value, dataOrInitCode: t.data, gasLimit: t.gasLimit, maxFeePerGas: t.maxFeePerGas, maxPriorityFeePerGas: t.maxPriorityFeePerGas };
      st.maxGasCostWei = (BigInt(t.gasLimit) * BigInt(t.maxFeePerGas)).toString();
      return st;
    });
    // attach deploy predicted addresses + expected deployed runtime code hash, in deploy(nonce) order.
    const deploySteps = this.steps.filter(s => s.phase === "A-deploy").sort((x, y) => x.nonce - y.nonce);
    deploySteps.forEach((s, i) => { const slot = SLOTS[i]; s.slot = slot; s.predictedCreationAddress = A(cc.deployments[slot].predictedAddress); s.expectedRuntimeHash = cc.deployments[slot].runtimeCodeHash; });
    this._expiresAtUtc = cc.expiresAtUtc;
    this._exposurePrincipalWei = cc.exposure.totalPrincipalWei; this._exposureGasWei = cc.exposure.totalMaxGasWei;
    this._authFlags = cc.flags;
    // (10D-4) discard raw inputs — runtime methods must reference ONLY this.canon / this.steps.
    this.packet = null; this.policy = null; this.snapshot = null;
    return { ok, digest: recomputed, reviewedAuthorizationDigest: digestR, checks: c };
  }

  // (1) connection state — verify chain + that accounts are exposed (connection approved by user in wallet)
  async markConnected(provider) {
    if (!this.bound) return { ok: false, reason: "not bound" };
    if (this.halted) return { ok: false, halted: true, reason: this.haltReason };
    if (BigInt(await this._req(provider, "eth_chainId")) !== 4663n) return { ok: false, reason: "wrong chain (need 4663/0x1237); switch Rabby manually" };
    const accts = await this._req(provider, "eth_accounts");
    if (!Array.isArray(accts) || accts.length === 0) return { ok: false, reason: "no account exposed" };
    this.connected = true; return { ok: true };
  }

  _statesReady() { return this.bound && this.connected && this.reconciled && !this.halted && !this.uncertainSend; }

  // ---- (5)(6) fresh live-price exposure ----
  async _exposureGate() {
    if (!this.priceProvider) return { ok: false, reason: "no price provider" };
    let pr; try { pr = await this.priceProvider(); } catch (e) { return { ok: false, reason: "price fetch failed: " + (e && e.message) }; }
    if (!pr || typeof pr.coinbaseMicroUsd === "undefined" || typeof pr.krakenMicroUsd === "undefined") return { ok: false, reason: "malformed price data" };
    if (!(pr.coinbaseAgeS <= 300 && pr.krakenAgeS <= 300)) return { ok: false, reason: `stale price (coinbase ${pr.coinbaseAgeS}s / kraken ${pr.krakenAgeS}s)` };
    const higher = BigInt(pr.coinbaseMicroUsd) > BigInt(pr.krakenMicroUsd) ? BigInt(pr.coinbaseMicroUsd) : BigInt(pr.krakenMicroUsd);
    // (10D-3) exposure components (WETH principal + maximum gas) come ONLY from the bound canonical object.
    const wei = BigInt(this._exposurePrincipalWei) + BigInt(this._exposureGasWei);
    const exposureMicro = (wei * higher) / 10n ** 18n;
    return { ok: exposureMicro <= this.capMicro, exposureMicro, higher: higher.toString() };
  }

  // ---- pre-transaction gates (fail closed unless bound+connected+reconciled) ----
  async preconditions(provider) {
    if (this.halted) return { ok: false, halted: true, reason: this.haltReason };
    if (this.uncertainSend) return { ok: false, halted: true, reason: "uncertain send pending — reconciliation required" };
    if (!this.bound) return { ok: false, reason: "not bound" };
    if (!this.connected) return { ok: false, reason: "not connected" };
    if (!this.reconciled) return { ok: false, reason: "not reconciled — run reconcile() after Connect" };
    if (this.pending) return { ok: false, pending: true, reason: "a transaction is pending; reconcile first" };
    const i = this.current; if (i >= this.steps.length) return { ok: false, done: true };
    const t = this.steps[i], g = {}, A = this.getAddress;
    g.notExpired = this.now() <= Date.parse(this._expiresAtUtc); // (10D-3) expiry from bound object
    g.correctChain = BigInt(await this._req(provider, "eth_chainId")) === 4663n;
    const accts = await this._req(provider, "eth_accounts"); g.accountSelected = Array.isArray(accts) && accts[0] && A(accts[0]) === A(t.signer);
    // (6) BOTH latest and pending nonce must equal the expected nonce
    const nLatest = Number(BigInt(await this._req(provider, "eth_getTransactionCount", [t.signer, "latest"])));
    const nPending = Number(BigInt(await this._req(provider, "eth_getTransactionCount", [t.signer, "pending"])));
    g.nonceLatestMatches = nLatest === t.nonce; g.noncePendingMatches = nPending === t.nonce;
    g.priorStepsVerified = this.journal.length === i;
    // (10D-4) dependency addresses + runtime code hashes come ONLY from the bound canonical object.
    let dep = true; for (const rec of Object.values(this.canon.dependencies)) { const code = await this._req(provider, "eth_getCode", [rec.address, "latest"]); if (this.keccak256(code).toLowerCase() !== rec.runtimeCodeHash.toLowerCase() || (code.length - 2) / 2 !== rec.codeBytes) dep = false; }
    g.dependencyHashesUnchanged = dep;
    if (t.phase === "A-deploy") { const cc = await this._req(provider, "eth_getCode", [t.predictedCreationAddress, "latest"]); g.predictedCreateEmpty = cc === "0x" || cc === "0x0"; } else g.predictedCreateEmpty = true;
    const head = await this._req(provider, "eth_getBlockByNumber", ["latest", false]);
    g.baseFeeInBounds = BigInt(head.baseFeePerGas) + BigInt(t.maxPriorityFeePerGas) <= BigInt(t.maxFeePerGas);
    g.ethSufficient = BigInt(await this._req(provider, "eth_getBalance", [t.signer, "latest"])) >= BigInt(t.maxGasCostWei);
    let sim = true; try { const cx = { from: t.signer, data: t.dataOrInitCode, value: "0x0" }; if (t.to) cx.to = t.to; await this._req(provider, "eth_call", [cx, "latest"]); } catch { sim = false; } g.simulationNoRevert = sim;
    let est = true; try { const ex = { from: t.signer, data: t.dataOrInitCode, value: "0x0" }; if (t.to) ex.to = t.to; est = BigInt(await this._req(provider, "eth_estimateGas", [ex])) <= BigInt(t.gasLimit); } catch { est = false; } g.gasEstimateWithinLimit = est;
    const exp = await this._exposureGate(); g.freshExposureWithinCap = exp.ok;
    g.authorizationEnabled = ["broadcastReady", "liveWritesApproved", "executionAuthorized", "fundingAuthorized"].every(k => this._authFlags[k] === true); // (10D-3) from bound object
    const ok = Object.values(g).every(Boolean);
    if (!ok) return this._halt("precondition failed at step " + i + ": " + Object.entries(g).filter(([, v]) => !v).map(([k]) => k).join(","));
    return { ok, step: i, gates: g, exposure: exp, tx: this._buildSendTx(t) };
  }

  _buildSendTx(t) { const tx = { from: this.getAddress(t.signer), value: "0x0", data: t.dataOrInitCode, gas: "0x" + BigInt(t.gasLimit).toString(16), maxFeePerGas: "0x" + BigInt(t.maxFeePerGas).toString(16), maxPriorityFeePerGas: "0x" + BigInt(t.maxPriorityFeePerGas).toString(16), type: "0x2", nonce: "0x" + BigInt(t.nonce).toString(16), chainId: "0x1237" }; if (t.to) tx.to = this.getAddress(t.to); return tx; }

  // ---- send: (10D-4) durable in-flight intent (persist + read-back) BEFORE invoking Rabby; DURABLE
  //      uncertain-send halt on any unknown error; the intent survives to keep reload halted. ----
  async sendCurrent(provider) {
    if (this.halted || this.uncertainSend) return { ok: false, halted: true, reason: this.haltReason || "uncertain send" };
    if (!this._statesReady()) return { ok: false, reason: "states not ready (bound/connected/reconciled)" };
    if (this.pending) return { ok: false, pending: true };
    const pre = await this.preconditions(provider); if (!pre.ok) return pre;
    const t = this.steps[this.current];
    const boundary = !!t.gasCeilings; // (10D-5) recovery steps enforce eth_chainId==4663 at every boundary
    if (boundary && !(await this._assertChain(provider))) return { ok: false, reason: "provider chain != 4663 immediately before intent persistence" };
    const intent = { digest: this.execDigest, step: this.current, signer: this.getAddress(t.signer), nonce: t.nonce, signableTxHash: this._signableHash(t) };
    // (6) persist + read back the in-flight intent BEFORE invoking Rabby; if it does not round-trip, DO NOT send.
    if (!this._durableSet(this._kIntent, JSON.stringify(intent))) { return { ok: false, reason: "storage unavailable — refusing to invoke wallet (no in-flight intent persisted)" }; }
    this.intent = intent;
    if (boundary && !(await this._assertChain(provider))) { this._durableSet(this._kIntent, "null"); this.intent = null; return { ok: false, reason: "provider chain != 4663 immediately before eth_sendTransaction" }; }
    let txHash;
    try { txHash = await this._req(provider, "eth_sendTransaction", [this._buildSendTx(t)]); }
    catch (e) {
      if (e && (e.code === 4001 || /user rejected|user denied/i.test(e.message || ""))) {
        // confirmed user rejection BEFORE broadcast: safe to clear the intent. If clearing fails, halt (no retry).
        if (!this._durableSet(this._kIntent, "null")) { this._persistHalt("failed to clear a rejected-send intent — reconciliation required (no blind retry)", intent); return { ok: false, halted: true, uncertainSend: true }; }
        this.intent = null; return { ok: false, userRejected: true, step: this.current };
      }
      // unknown error after invoking: the durable intent REMAINS; record the uncertain-send halt.
      this._persistHalt("unknown provider error after eth_sendTransaction invoked — reconciliation required (no blind retry): " + (e && e.message), intent);
      return { ok: false, halted: true, uncertainSend: true };
    }
    // (10D-5) immediately after the hash is returned, re-assert the provider chain; a change halts uncertain.
    if (boundary && !(await this._assertChain(provider))) { this._persistHalt("provider chain != 4663 immediately after tx hash returned — reconciliation required (no blind retry): " + txHash, intent); return { ok: false, halted: true, uncertainSend: true, txHash }; }
    // Rabby returned a hash: replace the intent with a durable pending record. If that update fails, the
    // ORIGINAL intent must remain so reload stays halted (uncertain) — never a blind retry.
    const pending = { digest: this.execDigest, step: this.current, txHash };
    if (!this._durableSet(this._kPending, JSON.stringify(pending))) { this._persistHalt("failed to durably record the returned tx hash — reconciliation required (supply the hash to resolve): " + txHash, intent); return { ok: false, halted: true, uncertainSend: true, txHash }; }
    this.pending = pending;
    return { ok: true, step: this.current, txHash };
  }

  // (10D-5) chain-id boundary helper: the provider chain MUST be 4663 at every boundary.
  async _assertChain(provider) { try { return BigInt(await this._req(provider, "eth_chainId")) === 4663n; } catch { return false; } }

  // ---- (4) ONE shared tx verifier. EXACT for v5; a step carrying `gasCeilings` (recovery) keeps every
  //      security-critical field EXACT but allows BOUNDED Rabby gas adjustments, and tolerates an ABSENT
  //      response chainId only because eth_chainId==4663 is independently required at this boundary. ----
  async _verifyTxAndReceipt(provider, t, txHash) {
    const A = this.getAddress, bounded = !!t.gasCeilings;
    if (bounded && !(await this._assertChain(provider))) return { ok: false, reason: "provider chain != 4663 at verify boundary" };
    const otx = await this._req(provider, "eth_getTransactionByHash", [txHash]);
    if (!otx) return { ok: false, reason: "transaction lookup returned null" };
    // chainId in the tx response: absent is acceptable ONLY in recovery (eth_chainId==4663 asserted above);
    // a PRESENT value must equal 4663 in both modes.
    if (otx.chainId === undefined || otx.chainId === null) { if (!bounded) return { ok: false, reason: "missing chainId (no default permitted)" }; }
    else if (Number(BigInt(otx.chainId)) !== 4663) return { ok: false, reason: "tx-response chainId present and != 4663" };
    // security-critical fields — EXACT in both modes
    const fieldOk = A(otx.from) === A(t.signer) && Number(BigInt(otx.nonce)) === t.nonce && Number(BigInt(otx.type)) === 2 &&
      (t.to ? A(otx.to) === A(t.to) : (otx.to === null || otx.to === undefined)) && BigInt(otx.value) === 0n && otx.input.toLowerCase() === t.dataOrInitCode.toLowerCase();
    if (!fieldOk) return { ok: false, reason: "tx fields differ from packet" };
    if ((otx.accessList && otx.accessList.length > 0)) return { ok: false, reason: "unexpected non-empty access list" };
    if (otx.blobVersionedHashes || otx.maxFeePerBlobGas) return { ok: false, reason: "unexpected blob fields" };
    // gas fields — EXACT for v5; BOUNDED for recovery
    const gl = BigInt(otx.gas), mf = BigInt(otx.maxFeePerGas), mp = BigInt(otx.maxPriorityFeePerGas);
    if (!bounded) { if (!(gl === BigInt(t.gasLimit) && mf === BigInt(t.maxFeePerGas) && mp === BigInt(t.maxPriorityFeePerGas))) return { ok: false, reason: "gas fields differ from packet" }; }
    else {
      const g = t.gasCeilings;
      if (gl > BigInt(g.gasLimitCeiling)) return { ok: false, reason: "gasLimit exceeds ceiling (2x reviewed)" };
      if (mf > BigInt(g.maxFeeCeilingWei)) return { ok: false, reason: "maxFeePerGas exceeds reviewed maximum" };
      if (mp > BigInt(g.maxPriorityCeilingWei)) return { ok: false, reason: "maxPriorityFeePerGas exceeds reviewed maximum" };
      if (mp > mf) return { ok: false, reason: "maxPriorityFeePerGas > maxFeePerGas" };
      if (gl * mf > BigInt(g.maxGasCostCeilingWei)) return { ok: false, reason: "gasLimit*maxFeePerGas exceeds the step's reviewed maxGasCostWei" };
    }
    let rc = null; for (let k = 0; k < this.receiptPolls; k++) { rc = await this._req(provider, "eth_getTransactionReceipt", [txHash]); if (rc) break; await new Promise(r => setTimeout(r, this.pollMs)); }
    if (!rc) return { ok: false, reason: "receipt timeout" };
    if (rc.transactionHash.toLowerCase() !== txHash.toLowerCase()) return { ok: false, reason: "receipt hash mismatch" };
    if (BigInt(rc.status) !== 1n) return { ok: false, reason: "receipt reverted" };
    if (t.phase === "A-deploy" && A(rc.contractAddress) !== A(t.predictedCreationAddress)) return { ok: false, reason: "deployed address != predicted" };
    return { ok: true, otx, rc };
  }

  // ---- initial post-broadcast verify (shared verifier + receipt-event postcondition) ----
  async verifyAfterHash(provider, txHash) {
    if (this.halted) return { ok: false, halted: true, reason: this.haltReason };
    if (!this.pending || this.pending.txHash.toLowerCase() !== txHash.toLowerCase()) return this._halt("verifyAfterHash for a non-pending hash");
    const i = this.current, t = this.steps[i];
    const v = await this._verifyTxAndReceipt(provider, t, txHash); if (!v.ok) return this._halt("verify at step " + i + ": " + v.reason);
    const post = this._receiptPostcondition(i, v.otx, v.rc); if (!post.ok) return this._halt("postcondition at step " + i + " (" + t.label + "): " + post.reason);
    // cumulative current-state checkpoint appropriate to the just-completed step
    const chk = await this._cumulativeCheckpoint(provider, i, v.rc); if (!chk.ok) return this._halt("checkpoint at step " + i + ": " + chk.reason);
    // (10D-4) durably journal the step FIRST. If the journal write does not round-trip, keep the pending
    // record and halt so a reload re-verifies the SAME tx hash (never a blind retry).
    const nextJournal = this.journal.concat([{ digest: this.execDigest, step: i, txHash, receiptStatus: "success", verified: true }]);
    // if the journal write does not round-trip, retain the pending record (do NOT advance, do NOT durably
    // halt) so a reload re-verifies the SAME tx hash — never a blind retry, never a lost success.
    if (!this._durableSet(this._kJournal, JSON.stringify(nextJournal))) return { ok: false, reason: "failed to durably journal step " + i + " — pending retained; reload will re-verify the same tx" };
    this.journal = nextJournal;
    // pending + intent are now superseded by the journal; clearing them is best-effort (a stale pending for
    // an already-journaled step is ignored on reload).
    this._durableSet(this._kPending, "null"); this.pending = null;
    this._durableSet(this._kIntent, "null"); this.intent = null;
    this.current += 1;
    return { ok: true, step: i, txHash, postcondition: post, checkpoint: chk, done: this.current >= this.steps.length };
  }

  // ---- (10D-4) receipt-event postcondition: dispatch on the DIGEST-BOUND postconditionType; verify EVERY
  //      indexed topic + non-indexed value against canonical expectations / calldata-derived args. Uses ONLY
  //      this.canon + receipt logs (no this.packet/policy/snapshot, no transient _before). Restart-safe. ----
  _receiptPostcondition(i, otx, rc) {
    const t = this.steps[i], A = this.getAddress, c = this.addr, lp = this.canon.lp;
    const topicAddr = (tp) => A("0x" + tp.slice(26));      // 32-byte indexed topic -> address
    switch (t.postconditionType) {
      case "deploy": return A(rc.contractAddress) === A(t.predictedCreationAddress) ? { ok: true, deployed: A(rc.contractAddress) } : { ok: false, reason: "deploy address" };
      case "approve": {
        // spender + amount derived from the bound calldata; owner = the signer (indexed topic 1).
        const spender = this._calldataAddr(t.dataOrInitCode, 0), amount = this._calldataUint(t.dataOrInitCode, 1);
        const ev = this._decodeEvent(rc.logs, t.to, EVSIG.erc20Approval, [true, true, false]); if (!ev) return { ok: false, reason: "no Approval event" };
        if (topicAddr(ev.topics[1]) !== A(t.signer)) return { ok: false, reason: "approval owner != signer" };
        if (topicAddr(ev.topics[2]) !== spender) return { ok: false, reason: "approval spender" };
        if (ev.d[0] !== amount) return { ok: false, reason: "approval amount" };
        return { ok: true, allowance: ev.d[0].toString() };
      }
      case "createPool": {
        const ev = this._decodeEvent(rc.logs, this.FACTORY, EVSIG.poolCreated, [true, true, true, false, false]); if (!ev) return { ok: false, reason: "no PoolCreated" };
        if (topicAddr(ev.topics[1]) !== A(lp.token0) || topicAddr(ev.topics[2]) !== A(lp.token1)) return { ok: false, reason: "PoolCreated token0/token1" };
        if (Number(BigInt(ev.topics[3])) !== lp.feeTier) return { ok: false, reason: "PoolCreated fee" };
        if (this._asI24(ev.d[0]) !== lp.tickSpacing) return { ok: false, reason: "PoolCreated tickSpacing" };
        const pool = this._asAddr(ev.d[1]);
        return pool === this.pool ? { ok: true, pool } : { ok: false, reason: "PoolCreated pool " + pool };
      }
      case "initialize": {
        const ev = this._decodeEvent(rc.logs, this.pool, EVSIG.poolInitialize, [false, false]); if (!ev) return { ok: false, reason: "no Initialize" };
        if (ev.d[0] !== BigInt(lp.sqrtPriceX96)) return { ok: false, reason: "Initialize sqrtPriceX96" };
        if (this._asI24(ev.d[1]) !== lp.tick) return { ok: false, reason: "Initialize tick" };
        return { ok: true, sqrtPriceX96: ev.d[0].toString() };
      }
      case "mint": {
        // MintParams from bound calldata: token0,token1,fee,tickLower,tickUpper,a0Des,a1Des,a0Min,a1Min,recipient,deadline
        const d = t.dataOrInitCode;
        if (this._calldataAddr(d, 0) !== A(lp.token0) || this._calldataAddr(d, 1) !== A(lp.token1)) return { ok: false, reason: "mint calldata token0/1" };
        if (Number(this._calldataUint(d, 2)) !== lp.feeTier) return { ok: false, reason: "mint calldata fee" };
        if (this._asI24(this._calldataUint(d, 3)) !== lp.tickLower || this._asI24(this._calldataUint(d, 4)) !== lp.tickUpper) return { ok: false, reason: "mint calldata ticks" };
        if (this._calldataUint(d, 7) !== BigInt(lp.amount0Min) || this._calldataUint(d, 8) !== BigInt(lp.amount1Min)) return { ok: false, reason: "mint calldata minimums" };
        if (this._calldataAddr(d, 9) !== A(lp.positionOwner)) return { ok: false, reason: "mint calldata recipient" };
        const inc = this._decodeEvent(rc.logs, this.NPM, EVSIG.increaseLiquidity, [true, false, false, false]);
        const t0 = this.keccak256(this._utf8ToHex(EVSIG.erc721Transfer)).toLowerCase(); let xferTokenId = null, xferTo = null;
        for (const lg of rc.logs) if (A(lg.address) === this.NPM && lg.topics.length === 4 && lg.topics[0].toLowerCase() === t0) { xferTokenId = BigInt(lg.topics[3]); xferTo = topicAddr(lg.topics[2]); }
        if (!inc || xferTokenId === null) return { ok: false, reason: "no IncreaseLiquidity/Transfer" };
        if (BigInt(inc.topics[1]) !== xferTokenId) return { ok: false, reason: "mint tokenId mismatch Transfer vs IncreaseLiquidity" };
        if (xferTo !== A(lp.positionOwner)) return { ok: false, reason: "mint NFT recipient" };
        if (inc.d[0] !== BigInt(lp.poolLiquidityAfter)) return { ok: false, reason: "mint liquidity" };
        if (inc.d[1] !== BigInt(lp.amount0Used) || inc.d[2] !== BigInt(lp.amount1Used)) return { ok: false, reason: "mint amounts used" };
        if (!(inc.d[1] >= BigInt(lp.amount0Min) && inc.d[2] >= BigInt(lp.amount1Min))) return { ok: false, reason: "mint amounts < minimum" };
        return { ok: true, tokenId: xferTokenId.toString(), liquidity: inc.d[0].toString() };
      }
      case "buy": {
        const bu = this.canon.buy; const ev = this._decodeEvent(rc.logs, c.tradeRouter, EVSIG.officialBuy, [true, true, true, false, false, false, false, false, false, false, false]); if (!ev) return { ok: false, reason: "no OfficialBuy" };
        if (ev.topics[1] === undefined || BigInt(ev.topics[1]) !== BigInt(bu.tradeId)) return { ok: false, reason: "buy tradeId" };
        if (topicAddr(ev.topics[2]) !== A(bu.trader)) return { ok: false, reason: "buy trader" };
        if (topicAddr(ev.topics[3]) !== A(bu.recipient)) return { ok: false, reason: "buy recipient" };
        if (ev.d[0] !== BigInt(bu.grossWethInput) || ev.d[1] !== BigInt(bu.stockBudget) || ev.d[2] !== BigInt(bu.burnBudget) || ev.d[3] !== BigInt(bu.userWethBudget) || ev.d[4] !== BigInt(bu.userBpsOutput) || ev.d[5] !== BigInt(bu.bpsBurned)) return { ok: false, reason: "buy accounting amounts" };
        if (this._asAddr(ev.d[6]) !== A(bu.adapter) || this._asAddr(ev.d[7]) !== A(bu.stockBudgetRecipient)) return { ok: false, reason: "buy adapter/stockBudgetRecipient" };
        if (!(ev.d[4] >= BigInt(bu.minimumUserBpsOutput))) return { ok: false, reason: "buy < minimum" };
        return { ok: true, userBpsOutput: ev.d[4].toString() };
      }
      case "sell": {
        const se = this.canon.sell; const ev = this._decodeEvent(rc.logs, c.tradeRouter, EVSIG.officialSell, [true, true, true, false, false, false, false, false, false, false, false]); if (!ev) return { ok: false, reason: "no OfficialSell" };
        if (ev.topics[1] === undefined || BigInt(ev.topics[1]) !== BigInt(se.tradeId)) return { ok: false, reason: "sell tradeId" };
        if (topicAddr(ev.topics[2]) !== A(se.trader)) return { ok: false, reason: "sell trader" };
        if (topicAddr(ev.topics[3]) !== A(se.recipient)) return { ok: false, reason: "sell recipient" };
        if (ev.d[0] !== BigInt(se.grossBpsInput) || ev.d[1] !== BigInt(se.grossWethOutput) || ev.d[2] !== BigInt(se.stockBudget) || ev.d[3] !== BigInt(se.burnBudget) || ev.d[4] !== BigInt(se.userWethOutput) || ev.d[5] !== BigInt(se.bpsBurned)) return { ok: false, reason: "sell accounting amounts" };
        if (this._asAddr(ev.d[6]) !== A(se.adapter) || this._asAddr(ev.d[7]) !== A(se.stockBudgetRecipient)) return { ok: false, reason: "sell adapter/stockBudgetRecipient" };
        if (!(ev.d[1] >= BigInt(se.minimumGrossWethOutput) && ev.d[4] >= BigInt(se.minimumUserWethOutput))) return { ok: false, reason: "sell < minimum" };
        return { ok: true, userWethOutput: ev.d[4].toString() };
      }
      case "lock": {
        const lk = this.canon.lock; const ev = this._decodeEvent(rc.logs, c.lockingVault, EVSIG.lockCreated, [true, true, false, false, false, false, false, false]); if (!ev) return { ok: false, reason: "no LockCreated" };
        if (topicAddr(ev.topics[1]) !== A(lk.account)) return { ok: false, reason: "lock account" };
        if (BigInt(ev.topics[2]) !== BigInt(lk.lockId)) return { ok: false, reason: "lock lockId" };
        if (ev.d[0] !== BigInt(lk.principal)) return { ok: false, reason: "lock principal" };
        // startTime + unlockTime are EXECUTION-TIME (block timestamp at mining) — verify the event's internal
        // consistency (start + duration == unlock) and the RELATIONSHIP to the bound duration / multiplier /
        // policyVersion, not the absolute rehearsal timestamps (which differ block-to-block, incl. recovery).
        if (Number(ev.d[2]) !== lk.duration) return { ok: false, reason: "lock duration" };
        if (ev.d[1] + ev.d[2] !== ev.d[3]) return { ok: false, reason: "lock event unlock != start+duration" };
        if (Number(ev.d[4]) !== lk.multiplierBps) return { ok: false, reason: "lock multiplierBps" };
        if (Number(ev.d[5]) !== lk.policyVersion) return { ok: false, reason: "lock policyVersion" };
        return { ok: true, principal: ev.d[0].toString(), unlockTime: ev.d[3].toString() };
      }
    }
    return { ok: false, reason: "no postcondition for type " + t.postconditionType };
  }

  // ---- (3) cumulative current-state checkpoint: only PERSISTENT invariants that hold after later steps.
  //      Reads current chain state (or the receipt) — never in-memory _before, never transient values. ----
  async _cumulativeCheckpoint(provider, uptoStep, mintRcForToken) {
    const A = this.getAddress, c = this.addr, lp = this.canon.lp;
    const done = (pcType) => this.steps.slice(0, uptoStep + 1).some(s => s.postconditionType === pcType);
    const W = async (to, sig, exp, args = []) => A(await this._callAddr(provider, to, sig, args)) === A(exp);
    // all deployed-so-far contracts must have code AND the exact expected deployed runtime code hash (bound)
    for (let j = 0; j <= uptoStep; j++) { const s = this.steps[j]; if (s.phase !== "A-deploy") continue; const code = await this._req(provider, "eth_getCode", [s.predictedCreationAddress, "latest"]); if (!code || code === "0x") return { ok: false, reason: "missing code " + s.slot }; if (this.keccak256(code).toLowerCase() !== s.expectedRuntimeHash.toLowerCase()) return { ok: false, reason: "runtime code hash " + s.slot }; }
    const deployed = (slot) => this.steps.slice(0, uptoStep + 1).some(s => s.slot === slot);
    if (deployed("canaryToken")) { const sym = await this._callString(provider, c.canaryToken, "symbol()"); if (sym !== this.canon.canaryTokenSymbol) return { ok: false, reason: "symbol" }; }
    if (deployed("lockingVault")) { if (!(await W(c.lockingVault, "owner()", this.DEPLOYER) && await W(c.lockingVault, "bpsToken()", c.canaryToken))) return { ok: false, reason: "vault wiring" }; }
    if (deployed("stockVault")) { const nvda = await this._callBool(provider, c.stockVault, "isApprovedStockToken(address)", [this._encAddr(this.NVDA)]); if (!(await W(c.stockVault, "acquisitionExecutor()", c.coordinator) && await W(c.stockVault, "reserveRecipient()", this.DEPLOYER) && nvda)) return { ok: false, reason: "vault immutables/NVDA" }; }
    if (deployed("tradeRouter")) { if (!(await W(c.tradeRouter, "owner()", this.DEPLOYER) && await W(c.tradeRouter, "bpsToken()", c.canaryToken) && await W(c.tradeRouter, "swapAdapter()", c.uniswapAdapter) && await W(c.tradeRouter, "stockBudgetRecipient()", c.stockVault))) return { ok: false, reason: "router wiring" }; }
    // pool exists once created (persists) — token order + fee from the bound canonical LP expectations
    if (done("createPool")) { const p = A(await this._callAddr(provider, this.FACTORY, "getPool(address,address,uint24)", [this._encAddr(lp.token0), this._encAddr(lp.token1), this._encUint(BigInt(lp.feeTier))])); if (p !== this.pool) return { ok: false, reason: "pool getPool" }; }
    // LP NFT: persistent position state (owner, liquidity, fee, ticks, token0/token1) all bound
    if (done("mint")) {
      const mintStep = this.steps.find(s => s.postconditionType === "mint");
      const t0 = this.keccak256(this._utf8ToHex(EVSIG.erc721Transfer)).toLowerCase();
      const fromRc = (rc) => { if (!rc) return null; for (const lg of rc.logs) if (A(lg.address) === this.NPM && lg.topics.length === 4 && lg.topics[0].toLowerCase() === t0) return BigInt(lg.topics[3]); return null; };
      const tid = (mintStep.index === uptoStep && mintRcForToken) ? fromRc(mintRcForToken) : await this._mintTokenId(provider);
      if (tid === null) return { ok: false, reason: "mint tokenId (checkpoint)" };
      const owner = A(await this._callAddr(provider, this.NPM, "ownerOf(uint256)", [this._encUint(tid)]));
      if (owner !== A(lp.positionOwner)) return { ok: false, reason: "LP NFT owner" };
      // positions(tokenId) => (nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity, ...)
      const pos = await this._call(provider, this.NPM, "positions(uint256)", [this._encUint(tid)]);
      const word = (n) => pos.slice(2 + n * 64, 2 + (n + 1) * 64);
      const pToken0 = A("0x" + word(2).slice(24)), pToken1 = A("0x" + word(3).slice(24));
      const pFee = Number(BigInt("0x" + word(4))), pTickLower = this._asI24(BigInt("0x" + word(5))), pTickUpper = this._asI24(BigInt("0x" + word(6))), pLiq = BigInt("0x" + word(7));
      if (pToken0 !== A(lp.token0) || pToken1 !== A(lp.token1)) return { ok: false, reason: "position token0/token1" };
      if (pFee !== lp.feeTier || pTickLower !== lp.tickLower || pTickUpper !== lp.tickUpper) return { ok: false, reason: "position fee/ticks" };
      if (pLiq !== BigInt(lp.poolLiquidityAfter)) return { ok: false, reason: "position liquidity" };
    }
    // lock principal persists (no immediate withdrawal)
    if (done("lock")) { const lpr = BigInt(await this._callUint(provider, c.lockingVault, "lockedPrincipal(address)", [this._encAddr(this.TESTER)])); if (lpr !== BigInt(this.canon.lock.principal)) return { ok: false, reason: "lockedPrincipal" }; }
    return { ok: true };
  }
  async _mintTokenId(provider) { // recover tokenId from the journalled mint receipt (historical), else null
    const mintStep = this.steps.find(s => s.postconditionType === "mint"); const j = this.journal.find(x => x.step === mintStep.index); if (!j) return null;
    const rc = await this._req(provider, "eth_getTransactionReceipt", [j.txHash]); if (!rc) return null;
    const t0 = this.keccak256(this._utf8ToHex(EVSIG.erc721Transfer)).toLowerCase();
    for (const lg of rc.logs) if (this.getAddress(lg.address) === this.NPM && lg.topics.length === 4 && lg.topics[0].toLowerCase() === t0) return BigInt(lg.topics[3]);
    return null;
  }

  // ---- (1)(3) restart reconciliation: validate EVERY journal tx + receipt exactly (shared verifier +
  //      receipt-event postcondition), then a single cumulative checkpoint for the latest step. Sets
  //      current only from the VALIDATED journal. Handles pending + durable uncertain-send. ----
  async reconcile(provider) {
    if (!this.bound) return { ok: false, reason: "not bound" };
    if (!this.connected) return { ok: false, reason: "not connected" };
    if (this.halted && !this.uncertainSend) return { ok: false, halted: true, reason: this.haltReason };
    // a durable uncertain-send stays halted until resolved with a real tx hash (see resolveUncertainSend)
    if (this.uncertainSend) return { ok: false, halted: true, uncertainSend: this.uncertainSend, reason: "uncertain send — supply a tx hash to resolve, or regenerate under review proving no broadcast" };
    for (let k = 0; k < this.journal.length; k++) {
      const j = this.journal[k];
      if (j.digest !== this.execDigest || j.step !== k) return this._halt("journal step/digest mismatch at " + k);
      const t = this.steps[k];
      const v = await this._verifyTxAndReceipt(provider, t, j.txHash); if (!v.ok) return this._halt("journal verify at step " + k + ": " + v.reason);
      const post = this._receiptPostcondition(k, v.otx, v.rc); if (!post.ok) return this._halt("journal postcondition at step " + k + ": " + post.reason);
    }
    // cumulative checkpoint appropriate to the latest completed step (restart-safe; no _before)
    if (this.journal.length > 0) { const chk = await this._cumulativeCheckpoint(provider, this.journal.length - 1); if (!chk.ok) return this._halt("restart checkpoint: " + chk.reason); }
    this.current = this.journal.length; // authoritative, from validated journal
    this.reconciled = true;
    // a pending record for an already-journaled step is stale (its journal write succeeded but the pending
    // clear did not) — discard it rather than re-resume it.
    if (this.pending && this.pending.step < this.journal.length) { this._durableSet(this._kPending, "null"); this.pending = null; }
    if (this.pending) {
      const otx = await this._req(provider, "eth_getTransactionByHash", [this.pending.txHash]);
      if (!otx) { this.reconciled = false; return { ok: true, current: this.current, pendingUnresolved: true, note: "pending tx not on chain; sends disabled until it verifies" }; }
      const v = await this.verifyAfterHash(provider, this.pending.txHash); if (!v.ok) return v;
      this.reconciled = true; return { ok: true, current: this.current, pendingResolved: true };
    }
    return { ok: true, current: this.current };
  }

  // resolve a durable uncertain-send ONLY with a supplied/discovered tx hash that reconciles exactly.
  // (10D-5) FIX: journalling FIRST and only clearing the durable halt/intent if EVERY write round-trips.
  // If the journal write or either clear fails, the operator stays HALTED — never a blind retry.
  async resolveUncertainSend(provider, txHash) {
    if (!this.uncertainSend) return { ok: false, reason: "no uncertain send" };
    const step = this.uncertainSend.step, t = this.steps[step];
    const v = await this._verifyTxAndReceipt(provider, t, txHash); if (!v.ok) return { ok: false, reason: "supplied tx does not reconcile: " + v.reason };
    const post = this._receiptPostcondition(step, v.otx, v.rc); if (!post.ok) return { ok: false, reason: "postcondition: " + post.reason };
    // journal FIRST; if the durable journal write does not round-trip, remain HALTED (no clear, no retry).
    const next = this.journal.slice(); next[step] = { digest: this.execDigest, step, txHash, receiptStatus: "success", verified: true };
    if (!this._durableSet(this._kJournal, JSON.stringify(next))) return { ok: false, halted: true, reason: "failed to durably journal during uncertain-send resolution — remains halted (no blind retry)" };
    this.journal = next;
    // clear intent + halt durably; only drop the in-memory halt if BOTH clears round-trip.
    const clearedIntent = this._durableSet(this._kIntent, "null"), clearedHalt = this._durableSet(this._kHalt, "null");
    if (!clearedIntent || !clearedHalt) return { ok: false, halted: true, reason: "resolved+journalled but failed to clear durable halt/intent — remains halted until storage recovers (no blind retry)" };
    this.uncertainSend = null; this.intent = null; this.halted = false; this.haltReason = null;
    this.current = this.journal.length; return { ok: true, resolvedStep: step };
  }

  // ---- ABI helpers ----
  // calldata arg accessors (args start after the 4-byte selector = hex offset 10). Used to DERIVE decoded
  // arguments directly from the digest-bound calldata rather than trusting an unbound duplicate.
  _calldataWord(data, i) { const off = 10 + i * 64; return data.slice(off, off + 64); }
  _calldataAddr(data, i) { return this.getAddress("0x" + this._calldataWord(data, i).slice(24)); }
  _calldataUint(data, i) { return BigInt("0x" + this._calldataWord(data, i)); }
  _asAddr(x) { return this.getAddress("0x" + BigInt(x).toString(16).padStart(40, "0")); }
  _asI24(x) { const n = BigInt(x); return Number(n >= (1n << 255n) ? n - (1n << 256n) : n); }
  _selector(sig) { return this.keccak256(this._utf8ToHex(sig)).slice(0, 10); }
  _encAddr(a) { return this.getAddress(a).toLowerCase().replace(/^0x/, "").padStart(64, "0"); }
  _encUint(n) { return BigInt(n).toString(16).padStart(64, "0"); }
  async _call(provider, to, sig, argsHex = []) { return this._req(provider, "eth_call", [{ to, data: this._selector(sig) + argsHex.join("") }, "latest"]); }
  async _callAddr(provider, to, sig, argsHex = []) { return "0x" + (await this._call(provider, to, sig, argsHex)).slice(-40); }
  async _callUint(provider, to, sig, argsHex = []) { const r = await this._call(provider, to, sig, argsHex); return BigInt(r.length >= 66 ? r.slice(0, 66) : r).toString(); }
  async _callBool(provider, to, sig, argsHex = []) { return BigInt(await this._call(provider, to, sig, argsHex)).toString() === "1"; }
  async _callString(provider, to, sig) { const r = await this._call(provider, to, sig); const len = Number(BigInt("0x" + r.slice(66, 130))); const hex = r.slice(130, 130 + len * 2); let s = ""; for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.substr(i, 2), 16)); return s; }
  _decodeEvent(logs, emitter, sig, indexed) {
    const t0 = this.keccak256(this._utf8ToHex(sig)).toLowerCase(), em = this.getAddress(emitter);
    for (const lg of logs) { if (this.getAddress(lg.address) !== em || lg.topics[0].toLowerCase() !== t0) continue; const d = []; let di = 0; const data = lg.data.slice(2); for (const isIdx of indexed) { if (!isIdx) { d.push(BigInt("0x" + data.slice(di * 64, (di + 1) * 64))); di++; } } return { topics: lg.topics, d }; }
    return null;
  }
}
function memStore() { const m = new Map(); return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v) }; }
