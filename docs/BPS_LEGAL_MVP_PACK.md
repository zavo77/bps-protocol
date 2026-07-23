# BPS Protocol — MVP Legal and Eligibility Pack

**Terms version:** `BPS-TERMS-1.0`
**Risk version:** `BPS-RISK-1.0`
**Privacy version:** `BPS-PRIVACY-1.0`
**Jurisdiction policy:** `BPS-RESTRICTED-1.0`
**Draft date:** 18 July 2026

> Working draft for product implementation and external counsel review. Do not publish or rely on it as final legal advice. Replace every bracketed field and obtain advice in the operator's jurisdiction before a real-money launch or Stock Token distribution.

> **Document control (bps-experiment canonical).** This copy in `bps-experiment/docs/` is authoritative for the current implementation. The **economic** description in section 4 is reconciled to economic policy **`BPS-ECON-2.0`** and the frozen `BPSTradeRouter` contract behavior. Previous external copies referencing `BPS-ECON-1.0` (byte-identical copies under `bps-protocol/docs/`, `bps-protocol/`, `bps-input/`, and `bps-inputs/`) are **superseded and non-authoritative**. This reconciliation was documentation-to-contract only; **no protocol behavior changed** and no external copy was modified. This document **remains a working draft for external counsel review** — nothing here is legally approved, and all bracketed fields, jurisdiction, KYC/AML, entity, governing-law, contact, and liability-cap inputs remain unresolved (see `docs/audit/TASK_10_FOUNDER_DECISION_PACK.md`).

## Fields that must be completed before publication

- `[OPERATOR LEGAL NAME]`
- `[ENTITY TYPE AND JURISDICTION]`
- `[REGISTERED ADDRESS]`
- `[CONTACT EMAIL]`
- `[PRIVACY EMAIL]`
- `[GOVERNING LAW]`
- `[COURTS OR ARBITRATION FORUM]`
- `[MINIMUM AGE]`
- `[DATA HOSTING REGIONS AND PROCESSORS]`
- `[LIABILITY CAP]`

---

# Terms and Conditions

## 1. Agreement and operator

These Terms and Conditions (the **Terms**) govern access to the BPS Protocol website, interface, contracts, dashboards, eligibility flow, trade-routing interface, and distribution-claim functionality (together, the **Services**). The Services are operated by `[OPERATOR LEGAL NAME]`, a `[ENTITY TYPE AND JURISDICTION]` with an address at `[REGISTERED ADDRESS]` (**BPS**, **we**, **us**, or **our**).

By accessing the Services, connecting a wallet, signing an eligibility declaration, submitting a transaction, or claiming an allocation, you agree to these Terms, the Privacy Policy, the Risk Disclosure, and the jurisdiction policy identified by version in your signed declaration. If you do not agree, do not use the Services.

## 2. Protocol status and third parties

BPS is experimental software. Unless separately stated in a written agreement, BPS does not act as your broker, dealer, custodian, investment adviser, fiduciary, exchange, tax adviser, or legal adviser. You control your wallet and authorize every transaction with your own keys.

The Services interact with independent networks, smart contracts, wallets, RPC providers, decentralized exchanges, liquidity providers, data services, execution venues, Stock Token issuers, and other third parties. BPS does not control their availability, terms, assets, pricing, eligibility decisions, or performance.

BPS is not Robinhood, Robinhood Assets (Jersey) Limited, Uniswap, Rialto, or any other third-party provider, and is not endorsed by or affiliated with them unless an authorized written announcement expressly says otherwise.

## 3. BPS token

BPS is a cryptographic protocol token. Holding BPS does not represent shares, equity, debt, a partnership interest, a fund interest, a bank deposit, a claim on the operator, or ownership of any asset held by a protocol vault. BPS does not give a holder voting, redemption, profit-sharing, dividend, or governance rights unless a separate published mechanism expressly provides them.

Holding BPS does not guarantee that fees will be generated, that Stock Tokens will be acquired, that an allocation will be made, that a holder will be eligible, or that any asset will have value. A market price or fully-diluted valuation of BPS is not a measure of, and does not guarantee, any asset backing.

## 4. Official trade route and fees

The BPS interface may offer an official route that applies a protocol allocation to the gross routed trade value. Under economic policy `BPS-ECON-2.0`, a **buy** applies a **3% allocation** (2% to Stock Token acquisition funding and 1% to a BPS repurchase-and-burn) and a **sell** applies a **4% allocation** (2% to Stock Token acquisition funding and 2% to a BPS repurchase-and-burn, taken from realized WETH proceeds). Acquired Stock Tokens are split 80% to the distribution allocation and 20% to the strategic reserve. An accrued acquisition budget does not mean a Stock Token acquisition has occurred. A separate Uniswap pool fee, currently targeted at 1.00%, may apply, together with gas, price impact, slippage, bridge costs, spread, and third-party charges; that pool fee is not part of the BPS protocol allocation.

Only trades executed through the official BPS router generate the BPS protocol allocation in version 1. Direct pool or third-party trades may bypass it. Displayed quotes are estimates and may expire or differ from final execution.

## 5. Stock Token allocations

Subject to available fees, venue access, issuer restrictions, liquidity, operational limits, and eligibility, the protocol may acquire Stock Tokens under a published mandate and make pro-rata allocations to eligible BPS holders.

Robinhood Stock Tokens are tokenized debt securities issued by Robinhood Assets (Jersey) Limited. They provide economic exposure to a referenced security but do not grant legal or beneficial ownership of the referenced company's shares. Their rights, collateral, corporate-action treatment, transfer restrictions, redemption, and risks are governed by the issuer's Base Prospectus and applicable Final Terms—not by these Terms.

BPS does not issue, guarantee, redeem, or custody the underlying securities. BPS may pause, defer, substitute within the published mandate, or cancel an acquisition cycle when a route is unavailable, unlawful, unsafe, unreconciled, or outside risk limits.

## 6. Eligibility

You may use Stock Token acquisition or claim functionality only if you satisfy all applicable laws, issuer terms, venue rules, sanctions requirements, and the current BPS eligibility policy.

At a minimum, you must truthfully declare that:

- You are not a U.S. Person as defined in Regulation S and are not located in the United States.
- You are not located in or ordinarily resident in a restricted jurisdiction.
- You are not acting for the account or benefit of a restricted person.
- You and the connected wallet are not subject to applicable sanctions or asset-freeze restrictions.
- You have reviewed and accept the Stock Token and protocol risks.
- You will notify BPS and stop using restricted functionality if any declaration becomes inaccurate.

A wallet signature records your declaration; it does not itself prove identity, residence, sanctions status, or legal eligibility. BPS may require geofencing, sanctions screening, identity verification, proof of residence, issuer attestation, venue allowlisting, or other checks. BPS may reject or revoke eligibility at any time when reasonably required for law, issuer terms, risk, or security.

## 7. Prohibited use

You must not:

- Use the Services from, for, or on behalf of a restricted person or jurisdiction.
- Evade geofencing, sanctions, identity, wallet, or eligibility controls.
- Provide false, incomplete, or misleading eligibility information.
- Manipulate snapshots, markets, prices, or claims; exploit errors; or interfere with the Services.
- Use the Services for money laundering, terrorist financing, fraud, market abuse, sanctions evasion, or unlawful activity.
- Introduce malicious code, probe infrastructure without authorization, or compromise another person's wallet.

## 8. Wallet security and transactions

You are solely responsible for your wallet, devices, seed phrase, private keys, approvals, transaction review, and destination addresses. Blockchain transactions may be irreversible. BPS cannot recover keys, reverse transactions, restore lost assets, or guarantee wallet compatibility.

You must verify contract addresses through the official BPS contract registry. Tokens with matching names or symbols may be counterfeit.

## 9. Snapshots and claims

Each distribution cycle will publish a manifest that may include the snapshot block, excluded addresses, eligible supply, allocation method, asset amounts, rounding method, terms version, jurisdiction-policy version, claim period, and Merkle root.

Allocations are calculated using the published cycle rules. Integer rounding may create dust, which remains in the distribution vault for a future cycle. Claims not completed during the stated claim period may be rolled into a later distribution, subject to applicable law and the published cycle policy. Gas and wallet costs are the claimant's responsibility unless stated otherwise.

## 10. Changes, pause, and termination

BPS may update the interface, risk limits, supported assets, eligibility policy, or these Terms. Material changes will receive a new version and effective date. A wallet may be required to sign the new version before using restricted functionality.

Authorized protocol roles may pause trading, acquisitions, attestations, root publication, or claims to address security, legal, issuer, venue, reconciliation, or operational risks. A pause does not create a right to compensation.

## 11. No advice and taxes

Information provided through the Services is general and does not constitute investment, financial, legal, accounting, or tax advice, or a recommendation to acquire, hold, or sell any asset. You are responsible for your own assessment and professional advice. You are solely responsible for taxes, filings, and reporting arising from your transactions or claims.

## 12. Intellectual property

The BPS name, marks, interface design, text, and non-open-source materials belong to BPS or its licensors. Open-source smart contracts and software are governed by their repository licenses. These Terms do not transfer any intellectual-property rights.

## 13. Disclaimers

To the maximum extent permitted by law, the Services are provided **as is** and **as available**. BPS disclaims warranties of merchantability, fitness for a particular purpose, non-infringement, uninterrupted availability, accuracy, security, and error-free operation. No statement about automation, transparency, proof of distribution, or decentralization is a promise of performance or value.

## 14. Limitation of liability

To the maximum extent permitted by law, BPS and its contributors, officers, contractors, and affiliates will not be liable for indirect, incidental, special, punitive, or consequential loss; loss of profits, data, opportunity, goodwill, tokens, or keys; or loss arising from market movement, smart contracts, blockchains, wallets, third parties, eligibility, issuer action, sanctions controls, or user error.

The aggregate liability of BPS for claims relating to the Services will not exceed the greater of `[LIABILITY CAP]` or fees directly paid by you to BPS during the preceding three months. This clause does not exclude liability that cannot lawfully be excluded.

## 15. Indemnity

To the extent permitted by law, you will indemnify BPS against claims and reasonable costs arising from your unlawful use, breach of these Terms, false eligibility declaration, violation of third-party rights, or use for or on behalf of a restricted person.

## 16. Governing law and contact

These Terms are governed by `[GOVERNING LAW]`. Disputes will be resolved in `[COURTS OR ARBITRATION FORUM]`, subject to any mandatory consumer rights that apply. Contact: `[CONTACT EMAIL]`.

---

# Privacy Policy

## 1. Controller and scope

`[OPERATOR LEGAL NAME]` is the controller of personal information processed through the BPS interface and eligibility service. Public blockchain activity is independently replicated across the network and may not be controlled or erasable by BPS.

## 2. Information collected

We may process:

- Wallet address, chain, transaction hashes, token balances, and public blockchain activity.
- Wallet signatures, nonce, terms version, jurisdiction-policy version, declaration status, issue time, and expiry.
- Country selected, geolocation/geofence result, sanctions-screening result, and eligibility status.
- IP address, device/browser information, timestamps, security logs, error events, and cookie preferences.
- Information in support, legal, abuse, or security communications.
- Identity or residence information only if a verified provider or applicable requirement makes it necessary. The MVP should avoid collecting identity documents directly.

Do not place a person's name, country, IP address, identity document, or sanctions result onchain. The onchain attestation should contain only the wallet, validity period, status, and hashes/versions required for verification.

## 3. Purposes and legal bases

We process information to provide the interface, verify signatures, determine and record eligibility, calculate claims, secure and debug the Services, prevent fraud and sanctions evasion, comply with law and issuer/venue requirements, enforce the Terms, and communicate with users.

Depending on jurisdiction, processing may rely on performance of a contract, compliance with legal obligations, legitimate interests in operating and securing the Services, and consent where required for optional cookies or communications.

## 4. Sharing

We may share the minimum necessary information with infrastructure, hosting, database, monitoring, wallet, geolocation, sanctions, identity-verification, legal, and professional-service providers; Stock Token issuers or execution venues when required; authorities where legally required; and a successor in a merger, financing, reorganization, or asset transfer.

Public wallet addresses and transactions are visible to anyone. BPS does not sell personal information for money. Complete any jurisdiction-specific “sale,” “sharing,” or targeted-advertising disclosure before launch.

## 5. Retention

Recommended launch defaults, subject to counsel and legal obligations:

- Terms signatures and eligibility audit records: up to five years after the last relevant interaction.
- Security and raw IP logs: 30 days unless needed for an active incident.
- Support communications: up to 24 months after closure.
- Cookie preferences: up to 12 months.
- Public blockchain records: retained by the network indefinitely.

Delete or aggregate information earlier when it is no longer required. Document every production processor and retention period before launch.

## 6. International transfers

Service providers may process information outside your country. Where required, BPS will use an approved transfer mechanism and safeguards. Insert the actual hosting regions and transfer mechanism after selecting vendors.

## 7. Security

BPS uses reasonable technical and organizational safeguards, including access control, encryption in transit, secret separation, least-privilege service accounts, audit logging, and incident procedures. No system is completely secure.

## 8. Rights

Depending on your jurisdiction, you may request access, correction, deletion, restriction, portability, objection, or withdrawal of consent, and may complain to a regulator. These rights may be limited by legal obligations and do not permit BPS to alter public blockchain history. Contact `[PRIVACY EMAIL]`.

## 9. Children

The Services are not intended for anyone under `[MINIMUM AGE]` or the legal age required to acquire the relevant products. BPS does not knowingly collect information from children.

## 10. Changes

Material changes will receive a new privacy-policy version and effective date. Eligibility signatures should record the applicable version.

---

# Risk Disclosure

Using BPS and receiving Stock Tokens is high risk and may result in the loss of some or all value. Review at least the following:

1. **BPS token risk.** BPS may have no sustained demand, liquidity, utility, or value. Holding it does not guarantee a distribution.
2. **Not equity or a fund.** BPS is not a share, fund interest, deposit, or claim on the protocol treasury or distribution vault.
3. **Stock Token legal form.** Robinhood Stock Tokens are tokenized debt securities. They do not provide legal or beneficial ownership, voting rights, or direct shareholder rights in the referenced company.
4. **Issuer and collateral risk.** Rights depend on the issuer, custodian, security arrangements, Base Prospectus, and Final Terms. Insolvency, enforcement, custody, or documentation failures may cause loss or delay.
5. **Private-company reference risk.** SPCX references a private company. Valuation, liquidity, disclosure, transfer, corporate-action, and price-discovery risks may be greater than for exchange-listed companies.
6. **Market and concentration risk.** Frontier 10 is concentrated in technology, AI, autonomy, and space. Correlated losses can be severe.
7. **Liquidity and pricing risk.** Onchain liquidity may be shallow. Quotes may expire; price impact and spreads may be large; market hours and reference-market closures may create deviations.
8. **No guaranteed execution.** An acquisition may be deferred, partially filled, substituted under the mandate, or cancelled because of venue, issuer, eligibility, liquidity, reconciliation, or risk limits.
9. **Eligibility risk.** A holder may own BPS but be legally unable to receive or redeem Stock Tokens. Eligibility rules may change, expire, or require additional verification.
10. **Smart-contract risk.** Bugs, exploits, incorrect permissions, upgrade errors, oracle failures, reentrancy, or integration defects may cause loss.
11. **Blockchain risk.** Robinhood Chain, Ethereum settlement, sequencers, RPCs, bridges, reorgs, congestion, gas markets, or network upgrades may fail or delay transactions.
12. **Automation risk.** Operators, signers, APIs, indexers, databases, and job queues may fail, duplicate, omit, or misprice actions. “Automated” does not mean infallible or fully decentralized.
13. **Wallet risk.** Lost keys, malicious approvals, phishing, counterfeit tokens, compromised devices, and address errors may cause irreversible loss.
14. **DEX and LP risk.** The BPS/WETH pool may experience volatility, price manipulation, concentrated-liquidity gaps, and impermanent loss. LP fees do not guarantee profit.
15. **Snapshot and claim risk.** Single-block snapshots can be gamed and may not reflect long-term holding. Incorrect indexing, exclusions, rounding, or an expired claim window may affect allocations.
16. **Regulatory risk.** Laws and regulator positions concerning cryptoassets, tokenized securities, promotions, taxes, sanctions, and decentralized protocols can change rapidly and may restrict the Services.
17. **Tax risk.** Trades, fee-funded allocations, and claims may create tax and reporting obligations. Obtain your own advice.
18. **Administrative-key risk.** During the MVP, a Safe and authorized roles may pause or control defined functions. Progressive decentralization is a goal, not a present guarantee.
19. **Third-party risk.** BPS relies on independent issuers, venues, DEXs, wallets, RPC providers, data providers, and hosting services whose failures are outside BPS control.
20. **Total-loss risk.** You should participate only with value you can afford to lose.

---

# Restricted-jurisdiction notice

Under policy `BPS-RESTRICTED-1.0`, Stock Token acquisition and claim functionality must be blocked for U.S. Persons and persons located in or ordinarily resident in the United States, Canada, the United Kingdom, Switzerland, Cuba, Belarus, Iran, North Korea, Russia, Syria, Ukraine, South Sudan, Sudan, Myanmar, or Venezuela, as well as sanctioned persons and anyone acting for their account or benefit.

This list reflects the issuer's published restriction page reviewed on 18 July 2026 and may change. The signed/versioned production list is maintained in `BPS_RESTRICTED_JURISDICTIONS.json`. BPS must also apply any broader issuer, venue, sanctions, or legal restriction in force at the time of acquisition or distribution.

Source: [Robinhood Assets (Jersey) — Restricted Jurisdictions](https://docs.robinhood.com/rhj/restricted-jurisdictions/).

---

# Non-U.S.-person and eligibility declaration

Display each statement as a separate unticked checkbox:

> I am not a “U.S. Person” as defined in Regulation S under the U.S. Securities Act of 1933, I am not currently located in the United States, and I am not acquiring or receiving any Stock Token for the account or benefit of a U.S. Person.

> I am not located in, ordinarily resident in, incorporated in, or acting from a jurisdiction restricted by `BPS-RESTRICTED-1.0` or by the applicable Stock Token issuer or execution venue.

> I am not acting as agent, nominee, trustee, custodian, intermediary, or otherwise for the account or benefit of a restricted person.

> Neither I nor the connected wallet is subject to applicable sanctions, asset-freeze restrictions, or legal prohibitions, and the wallet is not controlled by a sanctioned or restricted person.

> I have reviewed `BPS-TERMS-1.0`, `BPS-PRIVACY-1.0`, and `BPS-RISK-1.0`, including the fact that Stock Tokens may be tokenized debt securities and do not represent ownership of the referenced company's shares.

> I understand that holding BPS does not guarantee eligibility, an allocation, liquidity, redemption, yield, or value, and that my eligibility may expire or be revoked.

> My declarations are accurate. I will stop using restricted functionality and renew my declaration if my location, residence, status, control, or circumstances change.

Button label: **Sign eligibility declaration**

Pre-sign notice:

> Your signature does not move funds. It creates a verifiable record that this wallet accepted the identified policy versions. False declarations may result in rejection or revocation and may violate law. Additional screening or identity verification may still be required.

## EIP-712 wallet-signature wording

Human-readable message:

```text
BPS Protocol Eligibility Declaration

Wallet: {wallet}
Terms: BPS-TERMS-1.0 ({termsHash})
Privacy: BPS-PRIVACY-1.0 ({privacyHash})
Risk: BPS-RISK-1.0 ({riskHash})
Restricted jurisdictions: BPS-RESTRICTED-1.0 ({jurisdictionsHash})
Country selected: {countryCode}
Issued at: {issuedAt}
Expires at: {expiresAt}
Nonce: {nonce}

I confirm that I am not a U.S. Person; I am not in or ordinarily resident in a restricted jurisdiction; I am not acting for a restricted person; I am not sanctioned; and I accept the identified terms and risks.

This signature does not authorize a transaction or transfer funds.
```

Recommended typed-data structure:

```json
{
  "domain": {
    "name": "BPS Protocol Eligibility",
    "version": "1",
    "chainId": 4663,
    "verifyingContract": "{ELIGIBILITY_REGISTRY_ADDRESS}"
  },
  "primaryType": "EligibilityDeclaration",
  "types": {
    "EligibilityDeclaration": [
      { "name": "wallet", "type": "address" },
      { "name": "countryCodeHash", "type": "bytes32" },
      { "name": "termsHash", "type": "bytes32" },
      { "name": "privacyHash", "type": "bytes32" },
      { "name": "riskHash", "type": "bytes32" },
      { "name": "jurisdictionsHash", "type": "bytes32" },
      { "name": "issuedAt", "type": "uint64" },
      { "name": "expiresAt", "type": "uint64" },
      { "name": "nonce", "type": "bytes32" }
    ]
  }
}
```

The backend must reconstruct the exact displayed declaration, verify the signature and nonce, apply geofence/sanctions/provider results, and only then issue a time-limited attestation. Never infer eligibility from the signature alone.
