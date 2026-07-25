// TASK 10D-8 — v9 RECOVERY operator engine (pure time refresh of the reviewed v8). Original steps 1-13 are VERIFIED completed on-chain anchors
// (permanently non-actionable: not in the signable set; no precheck/confirm/send/retry/rebroadcast route;
// no code path can send ANY deployer transaction). ONLY the final six tester transactions (original steps
// 14-19, tester nonces 2-7) are signable. Fix for the v7 accountSelected terminal halt: the operator
// refuses to CONNECT with any account other than the tester, and a wrong-account pre-check is a NON-HALTING
// refusal (nothing was sent; switching accounts and re-running the pre-check is safe). All other gates,
// the accepted v7 gas policy (1.25x cost ceilings, 50,000,000 wei priority ceiling) and every v7 protection
// are preserved unchanged.
import { CanaryOperator } from "./operator-core.mjs";
import { buildRecoveryCanonical, validateRecoveryStrict, PRIORITY_CEILING_WEI, ALL_SLOTS } from "./recovery-canonical.mjs";
import { digestOf, rawDuplicateKeys } from "./canonical.mjs";

const V5_ZIP_SHA = "5a6246ca51bd3237e6d925153439d9040b1c3674c0e026e9d8f187e7a5e64b3b";
const V6_ZIP_SHA = "fd57f5c1bcc4d296250bfb04cab096a4f56299b0deb2edefbf4824f9414fb356";
const V6_RAD = "0xdca841943bc32b76df5a04310d30b70a4a9244dcc4d9445d8d42500fe01ecf57";
const V7_ZIP_SHA = "b8dd4e6d5b141d74092791798780a1f3fc59ae21d8f3a59727e1e169a1e06253";
const V7_RAD = "0xf12f37c6b8a311efbcd706bf1850c10d02aff5e30570a9d2afe6a3712604dfea";
const V5_RAD_EXACT = "0x4fdfd36b99d6090fef67f21bd3b2027e8dc7e339861ae94eb0f292da2b6ee248";
const V8_ZIP_SHA = "6c92a429affc2bee83290e01129b052f0af1dc9d3481112fe147f5b8367b8aa9";
const V8_RAD = "0x5f92fd120f5a09f4e8feeab811ae2e278ba20f299c8386f32ee121e5fc896662";

export class RecoveryOperator extends CanaryOperator {
  constructor({ recoveryPacket, recoveryPolicy, recoverySnapshot, recoveryAuthorization, recoveryAuthorizationRaw, provider, keccak256, getAddress, priceProvider, storage, now, receiptPolls, pollMs }) {
    // DISTINCT "canaryv9" namespace keyed by the v9 recovery digest — v5/v6/v7/v8 records never touched.
    super({ packet: null, policy: null, snapshot: null, reviewedAuthorization: null, provider, keccak256, getAddress, priceProvider, storage, now, receiptPolls, pollMs, keyPrefix: "canaryv9", keyDigest: recoveryPacket && recoveryPacket.meta ? recoveryPacket.meta.recoveryAuthorizationDigest : null });
    this.recoveryPacket = recoveryPacket; this.recoveryPolicy = recoveryPolicy; this.recoverySnapshot = recoverySnapshot;
    this.recoveryAuthorization = recoveryAuthorization || null;
    this.recoveryAuthorizationRaw = recoveryAuthorizationRaw || (recoveryAuthorization ? JSON.stringify(recoveryAuthorization) : null);
    this.execDigest = recoveryPacket && recoveryPacket.meta ? recoveryPacket.meta.recoveryAuthorizationDigest : null;
    this.completedSteps = null; this.isRecovery = true;
  }

  bindAndVerifyPacket() {
    const a = this.recoveryPacket, p = this.recoveryPolicy, s = this.recoverySnapshot, c = {}, A = this.getAddress;
    const recon = buildRecoveryCanonical({ packet: a, policy: p, snapshot: s, getAddress: A });
    c.canonicalReconstructs = recon.errors.length === 0;
    const digestR = recon.object ? digestOf(recon.object, this.keccak256) : null;
    const pkg = this.recoveryAuthorization, raw = this.recoveryAuthorizationRaw || (pkg ? JSON.stringify(pkg) : "");
    const strictErr = pkg ? validateRecoveryStrict(pkg, raw, A) : ["packaged recovery-authorization missing"];
    const dupKeys = pkg ? rawDuplicateKeys(raw) : ["<missing>"];
    c.packagedValid = strictErr.length === 0; c.packagedNoDuplicateKeys = dupKeys.length === 0;
    const digestP = pkg ? digestOf(pkg, this.keccak256) : null;
    const eq = (x, y) => !!x && !!y && String(x).toLowerCase() === String(y).toLowerCase();
    c.anchorsAgree = eq(digestR, digestP) && eq(digestR, a.meta && a.meta.recoveryAuthorizationDigest) && eq(digestR, p.recoveryAuthorizationDigest);
    c.reconMatchesPackaged = !!recon.object && !!pkg && this._stable(recon.object) === this._stable(pkg);
    const recomputed = pkg ? this.keccak256(this._utf8ToHex(this._stable(pkg.transactions.immediate.map(t => ({ originalIndex: t.originalIndex, chainId: 4663, signer: A(t.signer), nonce: t.nonce, type: 2, to: t.to ? A(t.to) : null, value: t.value, data: t.data, gasLimit: t.gasLimit, maxFeePerGas: t.maxFeePerGas, maxPriorityFeePerGas: t.maxPriorityFeePerGas }))))) : null;
    c.remainingExecDigestMatches = !!pkg && eq(recomputed, a.meta.remainingExecutionDigest) && eq(recomputed, pkg.digests.remainingExecutionDigest);
    c.priorAnchorsBound = !!pkg && pkg.v5.zipSha256 === V5_ZIP_SHA && eq(pkg.v5.reviewedAuthorizationDigest, V5_RAD_EXACT) && pkg.v6.zipSha256 === V6_ZIP_SHA && eq(pkg.v6.recoveryAuthorizationDigest, V6_RAD) && pkg.v7.zipSha256 === V7_ZIP_SHA && eq(pkg.v7.recoveryAuthorizationDigest, V7_RAD) && pkg.v8.zipSha256 === V8_ZIP_SHA && eq(pkg.v8.recoveryAuthorizationDigest, V8_RAD);
    c.originalPlanBound = !!pkg && pkg.originalPlan.stepCount === 19 && pkg.originalPlan.deployerStepRange === "1-13";
    c.completedDeployerRange1to13 = !!pkg && Array.isArray(pkg.completedSteps) && pkg.completedSteps.length === 13 && pkg.completedSteps.every((x, i) => x.originalIndex === i + 1 && A(x.signer) === A(pkg.wallets.deployer));
    c.thirteenAnchors = !!pkg && Array.isArray(pkg.completedSteps) && pkg.completedSteps.length === 13 && pkg.completedSteps.every((x, i) => x.originalIndex === i + 1 && x.nonce === x.originalIndex + 2);
    c.sixTesterSignables = !!pkg && pkg.transactions.count === 6 && pkg.transactions.immediate.length === 6 && pkg.transactions.immediate.every((t, i) => t.originalIndex === i + 14 && t.nonce === i + 2 && A(t.signer) === A(pkg.wallets.tester)) && !pkg.transactions.immediate.some(t => t.originalIndex <= 13 || A(t.signer) === A(pkg.wallets.deployer));
    c.nonceExpectations = !!pkg && pkg.remaining.deployerExpectedNonce === 16 && pkg.remaining.testerExpectedNonce === 2;
    c.gasPolicyBound = !!pkg && pkg.gasPolicy.maxPriorityCeilingWei === PRIORITY_CEILING_WEI && pkg.gasPolicy.maxFeeCeilingUnchanged === true && pkg.gasPolicy.gasLimitCeilingUnchanged === true;
    c.deadlineRefreshBound = !!pkg && (() => {
      const dr = pkg.deadlineRefresh; if (!dr || dr.steps.length !== 2) return false;
      if (dr.oldDeadline !== "1784949999") return false;
      if (Number(dr.newDeadline) !== Math.floor(Date.parse(pkg.expiresAtUtc) / 1000)) return false;
      for (const x of dr.steps) {
        const tx = pkg.transactions.immediate.find(t => t.originalIndex === x.originalIndex); if (!tx) return false;
        if (this.keccak256(tx.data).toLowerCase() !== x.newDataKeccak.toLowerCase()) return false;
        const word = BigInt("0x" + tx.data.slice(2 + x.wordOffsetBytes * 2, 2 + x.wordOffsetBytes * 2 + 64));
        if (word.toString() !== dr.newDeadline) return false;
      }
      return true;
    })();
    c.eightCompletedContracts = !!pkg && Object.keys(pkg.completedContracts).length === 8;
    c.chainId4663 = !!pkg && pkg.chainId === 4663;
    c.capIs130 = !!pkg && pkg.maxAllInclusiveExposureUsd === 130;
    const ok = Object.values(c).every(Boolean);
    this.bound = ok;
    if (!ok) { this._halt("recovery binding failed: " + Object.entries(c).filter(([, v]) => !v).map(([k]) => k).join(",")); return { ok, recoveryAuthorizationDigest: digestR, checks: c }; }

    // ===== SINGLE BOUND RUNTIME DATA SOURCE (v9) =====
    const cc = pkg; this.canon = cc; this.completedSteps = cc.completedSteps;
    this.capMicro = BigInt(cc.maxAllInclusiveExposureUsd) * 1_000_000n;
    this.DEPLOYER = A(cc.wallets.deployer); this.TESTER = A(cc.wallets.tester);
    this.WETH = A(cc.infrastructure.weth); this.FACTORY = A(cc.infrastructure.uniswapV3Factory); this.NPM = A(cc.infrastructure.nonfungiblePositionManager);
    this.SWAP = A(cc.infrastructure.swapRouter02); this.REGISTRY = A(cc.infrastructure.rialtoRegistry); this.NVDA = A(cc.infrastructure.nvdaStockToken);
    this.pool = A(cc.pool);
    this.addr = {}; for (const slot of ALL_SLOTS) this.addr[slot] = A(cc.completedContracts[slot].address);
    this.steps = cc.transactions.immediate.map(t => {
      const st = { index: t.remainingIndex, originalIndex: t.originalIndex, remainingIndex: t.remainingIndex, phase: t.phase, label: t.label, postconditionType: t.postconditionType, chainId: 4663, signer: A(t.signer), nonce: t.nonce, to: t.to ? A(t.to) : null, value: t.value, dataOrInitCode: t.data, gasLimit: t.gasLimit, maxFeePerGas: t.maxFeePerGas, maxPriorityFeePerGas: t.maxPriorityFeePerGas, gasCeilings: t.gasCeilings };
      st.maxGasCostWei = (BigInt(t.gasLimit) * BigInt(t.maxFeePerGas)).toString();
      return st;
    });
    this._expiresAtUtc = cc.expiresAtUtc;
    this._exposurePrincipalWei = cc.exposure.remainingPrincipalWei;
    this._exposureGasWei = (BigInt(cc.exposure.remainingMaxGasWei) + BigInt(cc.exposure.realizedGasWei)).toString();
    this._authFlags = cc.flags;
    this.recoveryPacket = null; this.recoveryPolicy = null; this.recoverySnapshot = null;
    return { ok, recoveryAuthorizationDigest: digestR, checks: c };
  }

  // NO dispatch route exists for completed steps 1-13 or ANY deployer transaction.
  completedStepIsActionable() { return this.steps.some(s => this.getAddress(s.signer) === this.DEPLOYER || s.originalIndex <= 13); }
  step1IsActionable() { return this.completedStepIsActionable(); }

  // (10D-7) connect requires the TESTER selected — a NON-HALTING refusal otherwise (all signables are tester).
  async markConnected(provider) {
    if (!this.bound) return { ok: false, reason: "not bound" };
    if (this.halted) return { ok: false, halted: true, reason: this.haltReason };
    if (BigInt(await this._req(provider, "eth_chainId")) !== 4663n) return { ok: false, reason: "wrong chain (need 4663/0x1237); switch Rabby manually" };
    const accts = await this._req(provider, "eth_accounts");
    if (!Array.isArray(accts) || accts.length === 0) return { ok: false, reason: "no account exposed" };
    if (this.getAddress(accts[0]) !== this.TESTER) return { ok: false, wrongAccount: true, reason: "the TESTER account must be selected in Rabby (all six remaining transactions are tester transactions); switch accounts and connect again — nothing was sent" };
    this.connected = true; return { ok: true };
  }

  // re-verify ALL 13 completed anchors + resulting pool/position state as the reconciliation authority.
  async _verifyCompletedAnchors(provider) {
    if (!(await this._assertChain(provider))) return { ok: false, reason: "provider chain != 4663 at anchor verify" };
    const A = this.getAddress;
    for (const anc of this.completedSteps) {
      const tx = await this._req(provider, "eth_getTransactionByHash", [anc.txHash]);
      const rc = await this._req(provider, "eth_getTransactionReceipt", [anc.txHash]);
      if (!tx || !rc) return { ok: false, reason: "anchor " + anc.originalIndex + " tx/receipt not found" };
      if (tx.chainId !== undefined && tx.chainId !== null && Number(BigInt(tx.chainId)) !== 4663) return { ok: false, reason: "anchor " + anc.originalIndex + " chainId" };
      if (BigInt(rc.status) !== 1n) return { ok: false, reason: "anchor " + anc.originalIndex + " receipt not success" };
      if (A(tx.from) !== A(anc.signer) || Number(BigInt(tx.nonce)) !== anc.nonce || BigInt(tx.value) !== 0n) return { ok: false, reason: "anchor " + anc.originalIndex + " fields" };
      if (this.keccak256(tx.input).toLowerCase() !== anc.inputKeccak.toLowerCase()) return { ok: false, reason: "anchor " + anc.originalIndex + " input keccak" };
      if (anc.createdAddress && anc.deployedRuntimeCodeHash) {
        if (A(rc.contractAddress) !== A(anc.createdAddress)) return { ok: false, reason: "anchor " + anc.originalIndex + " created address" };
        const code = await this._req(provider, "eth_getCode", [anc.createdAddress, "latest"]);
        if (this.keccak256(code).toLowerCase() !== anc.deployedRuntimeCodeHash.toLowerCase()) return { ok: false, reason: "anchor " + anc.originalIndex + " runtime hash" };
      }
    }
    // pool + LP position state (results of steps 11-13)
    const lp = this.canon.lp;
    const gp = A(await this._callAddr(provider, this.FACTORY, "getPool(address,address,uint24)", [this._encAddr(lp.token0), this._encAddr(lp.token1), this._encUint(BigInt(lp.feeTier))]));
    if (gp !== this.pool) return { ok: false, reason: "factory.getPool != bound pool" };
    const tid = BigInt(this.canon.positionTokenId);
    const owner = A(await this._callAddr(provider, this.NPM, "ownerOf(uint256)", [this._encUint(tid)]));
    if (owner !== this.DEPLOYER) return { ok: false, reason: "LP NFT owner != deployer" };
    const pos = await this._call(provider, this.NPM, "positions(uint256)", [this._encUint(tid)]);
    const liq = BigInt("0x" + pos.slice(2 + 7 * 64, 2 + 8 * 64));
    if (liq.toString() !== this.canon.positionLiquidity) return { ok: false, reason: "position liquidity != bound" };
    return { ok: true };
  }

  async reconcile(provider) {
    if (!this.bound) return { ok: false, reason: "not bound" };
    if (!this.connected) return { ok: false, reason: "not connected" };
    if (this.halted && !this.uncertainSend) return { ok: false, halted: true, reason: this.haltReason };
    const anc = await this._verifyCompletedAnchors(provider); if (!anc.ok) return this._halt("recovery reconciliation: " + anc.reason);
    return super.reconcile(provider);
  }

  // (10D-7) NON-HALTING wrong-account pre-gate (the v7 terminal halt fix) + the v7 deadline gates.
  async preconditions(provider) {
    if (!this.halted && !this.uncertainSend && this.bound && this.connected && this.reconciled && !this.pending && this.current < this.steps.length) {
      const accts = await this._req(provider, "eth_accounts");
      const sel = Array.isArray(accts) && accts[0] ? this.getAddress(accts[0]) : null;
      if (sel !== this.TESTER) return { ok: false, wrongAccount: true, reason: "the TESTER account must be selected in Rabby; switch accounts and re-run the pre-check — nothing was sent and nothing is halted" };
    }
    const pre = await super.preconditions(provider);
    if (!pre.ok) return pre;
    const head = await this._req(provider, "eth_getBlockByNumber", ["latest", false]);
    const expiryEpoch = Math.floor(Date.parse(this.canon.expiresAtUtc) / 1000);
    if (!(Number(BigInt(head.timestamp)) < expiryEpoch)) return this._halt("provider block timestamp is not strictly before the packet expiry");
    const t = this.steps[pre.step];
    const dr = this.canon.deadlineRefresh;
    const step = dr && dr.steps.find(x => x.originalIndex === t.originalIndex);
    if (step) {
      const word = BigInt("0x" + t.dataOrInitCode.slice(2 + step.wordOffsetBytes * 2, 2 + step.wordOffsetBytes * 2 + 64));
      if (word.toString() !== dr.newDeadline) return this._halt("bound calldata deadline != bound packet expiry at original step " + t.originalIndex);
      if (!(Number(BigInt(head.timestamp)) < Number(dr.newDeadline))) return this._halt("provider block timestamp has passed the bound transaction deadline");
    }
    return pre;
  }
}
