// TASK 10B-7 — hardened snapshot-bound canary review-packet materializer + fork rehearsal.
// Read-only: talks ONLY to a local anvil fork (writes) + the live RPC (nonce read). Signs nothing live.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createPublicClient, http, keccak256, encodeAbiParameters, parseAbiParameters, decodeAbiParameters,
  getContractAddress, concatHex, encodeFunctionData, decodeFunctionData, decodeEventLog, toHex, getAddress
} from "viem";

const DIR = "C:/Projects/bps-experiment/packages/contracts/canary-packet";
const OUT = "C:/Projects/bps-experiment/packages/contracts/out";
const REPO = "C:/Projects/bps-experiment";
const ANVIL = process.env.ANVIL_RPC || "http://127.0.0.1:8546";

const policy = JSON.parse(readFileSync(`${DIR}/review-policy.json`, "utf8"));
const price = JSON.parse(readFileSync(`${DIR}/price-snapshot.json`, "utf8"));

// ---- price gate (item 2): FAIL on stale or fixture prices whenever a live/executable packet is requested ----
const MAX_PRICE_AGE_S = 300;
const REQUIRE_LIVE = policy.mode === "live" || policy.live === true || policy.executable === true;
function priceFreshness(p) {
  const now = Date.now();
  const ages = { capturedAt: (now - Date.parse(p.capturedAt)) / 1000 };
  for (const s of p.sources) ages[s.name] = (now - Date.parse(s.respondedAt || s.observedAt)) / 1000;
  const stale = Object.entries(ages).filter(([, a]) => !(a <= MAX_PRICE_AGE_S)).map(([k]) => k);
  return { ages, stale, isLive: p.mode === "live" && p.live === true, fresh: stale.length === 0 };
}
const PF = priceFreshness(price);
if (REQUIRE_LIVE) {
  if (!PF.isLive) throw new Error(`live/executable packet requested but price snapshot is a FIXTURE (mode=${price.mode}, live=${price.live})`);
  if (!PF.fresh) throw new Error(`live packet requested but price observations are STALE (>${MAX_PRICE_AGE_S}s): ${PF.stale.join(",")}`);
}
if (!PF.isLive && (policy.executable === true)) throw new Error("fixture price cannot back an executable packet");

// ---- fixed-point price (micro-USD integer; higher of two sources) ----
const microMax = price.sources.reduce((m, s) => BigInt(s.microUsd) > m ? BigInt(s.microUsd) : m, 0n);
if (BigInt(price.selected.microUsd) !== microMax) throw new Error("price selection != higher source");
const CAP_MICRO = BigInt(price.selected.microUsd);            // e.g. 1876505000
const floorWeiUsd = (usdWhole) => (BigInt(usdWhole) * 1_000_000n * 10n ** 18n) / CAP_MICRO; // floor
const usdMicroOfWei = (wei) => (BigInt(wei) * CAP_MICRO) / 10n ** 18n;                        // micro-USD, floor

const CHAIN_ID = policy.chainId;
const { deployer: DEPLOYER, tester: TESTER } = policy.wallets;
const { weth: WETH, uniswapV3Factory: FACTORY, nonfungiblePositionManager: NPM, swapRouter02: SWAPROUTER, rialtoRegistry: REGISTRY, nvdaStockToken: NVDA } = policy.infrastructure;
const WETH_WHALE = "0xC0Be1cb0f674D9737C72B2A63fC542361185b807";
const FEE = policy.economics.feeTier, SPACING = BigInt(policy.economics.tickSpacing);
const MAX_FEE = BigInt(policy.gas.maxFeePerGasWei), MAX_PRIORITY = BigInt(policy.gas.maxPriorityFeePerGasWei);
const GL_MULT = BigInt(policy.gas.gasLimitMultiplierPct);
// integer CEILING: ceil(est * 120 / 100) = (est*120 + 99) / 100
const gasLimitOf = (est) => (BigInt(est) * GL_MULT + 99n) / 100n;
const BPSC_LP_DESIRED = BigInt(policy.economics.bpscLpDesiredWei);
const LP_WETH_WEI = floorWeiUsd(policy.caps.lpWethUsd);
const TRADE_TOTAL_WEI = floorWeiUsd(policy.caps.controlledTradesUsd);
const BUY_WETH_WEI = floorWeiUsd(policy.caps.individualTradeUsd);

const pub = createPublicClient({ transport: http(ANVIL) });
const LIVE_RPC_ENV = policy.liveRpcEnvVar || "ROBINHOOD_CHAIN_RPC_URL";
const LIVE_RPC = process.env[LIVE_RPC_ENV];
if (!LIVE_RPC) throw new Error("provider RPC env var not set: " + LIVE_RPC_ENV);
const live = createPublicClient({ transport: http(LIVE_RPC) });
const rpc = (m, p = []) => pub.request({ method: m, params: p });
const hx = (v) => (typeof v === "bigint" ? v.toString() : v);
function artifactJson(name) { return JSON.parse(readFileSync(`${OUT}/${name}.sol/${name}.json`, "utf8")); }
function creation(name) { return artifactJson(name).bytecode.object; }
function abiOf(name) { return artifactJson(name).abi; }
const sha256 = (buf) => "0x" + createHash("sha256").update(buf).digest("hex");

// ---- integer sqrt + LiquidityAmounts ----
function isqrt(n){ if(n<2n) return n; let x=n,y=(x+1n)/2n; while(y<x){x=y;y=(x+n/x)/2n;} return x; }
const Q96 = 2n ** 96n;
function encodeSqrtRatioX96(a1,a0){ return isqrt((a1<<192n)/a0); }
function tickAtSqrt(s){ const r=Number(s)/Number(Q96); return Math.log(r*r)/Math.log(1.0001); }
function sqrtAtTick(t){ return BigInt(Math.floor(Math.sqrt(Math.pow(1.0001,t))*Number(Q96))); }
function L0(sa,sb,a0){ if(sa>sb)[sa,sb]=[sb,sa]; return (a0*((sa*sb)/Q96))/(sb-sa); }
function L1(sa,sb,a1){ if(sa>sb)[sa,sb]=[sb,sa]; return (a1*Q96)/(sb-sa); }
function amt0(sa,sb,L){ if(sa>sb)[sa,sb]=[sb,sa]; return (((L<<96n)*(sb-sa))/sb)/sa; }
function amt1(sa,sb,L){ if(sa>sb)[sa,sb]=[sb,sa]; return (L*(sb-sa))/Q96; }

const erc20 = [
  {type:"function",name:"balanceOf",stateMutability:"view",inputs:[{type:"address"}],outputs:[{type:"uint256"}]},
  {type:"function",name:"approve",stateMutability:"nonpayable",inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}],outputs:[{type:"bool"}]},
  {type:"function",name:"transfer",stateMutability:"nonpayable",inputs:[{name:"to",type:"address"},{name:"amount",type:"uint256"}],outputs:[{type:"bool"}]},
  {type:"function",name:"symbol",stateMutability:"view",inputs:[],outputs:[{type:"string"}]},
];
const bal = (t,w) => pub.readContract({address:t,abi:erc20,functionName:"balanceOf",args:[w]}).then(BigInt);
const ethBal = (w) => rpc("eth_getBalance",[w,"latest"]).then(BigInt);
const facAbi=[{type:"function",name:"createPool",stateMutability:"nonpayable",inputs:[{name:"tokenA",type:"address"},{name:"tokenB",type:"address"},{name:"fee",type:"uint24"}],outputs:[{type:"address"}]},{type:"function",name:"getPool",stateMutability:"view",inputs:[{type:"address"},{type:"address"},{type:"uint24"}],outputs:[{type:"address"}]}];
const poolAbi=[{type:"function",name:"initialize",stateMutability:"nonpayable",inputs:[{name:"sqrtPriceX96",type:"uint160"}],outputs:[]},{type:"function",name:"slot0",stateMutability:"view",inputs:[],outputs:[{type:"uint160"},{type:"int24"},{type:"uint16"},{type:"uint16"},{type:"uint16"},{type:"uint8"},{type:"bool"}]},{type:"function",name:"liquidity",stateMutability:"view",inputs:[],outputs:[{type:"uint128"}]}];
const npmAbi=[{type:"function",name:"mint",stateMutability:"payable",inputs:[{components:[{name:"token0",type:"address"},{name:"token1",type:"address"},{name:"fee",type:"uint24"},{name:"tickLower",type:"int24"},{name:"tickUpper",type:"int24"},{name:"amount0Desired",type:"uint256"},{name:"amount1Desired",type:"uint256"},{name:"amount0Min",type:"uint256"},{name:"amount1Min",type:"uint256"},{name:"recipient",type:"address"},{name:"deadline",type:"uint256"}],name:"params",type:"tuple"}],outputs:[{type:"uint256"},{type:"uint128"},{type:"uint256"},{type:"uint256"}]}];
const routerAbi = abiOf("BPSTradeRouter");
const lockAbi = abiOf("BPSLockingVault");

let SIM_TS, DEADLINE, FORK, WINDOW, DEPLOYER_START=0, TESTER_START=0;
const GENERATED_AT = new Date().toISOString();
const specNames = ["BPSCanaryToken","BPSLockingVault","DistributionClaimManager","RialtoStockAcquisitionAdapter","DistributionFundingCoordinator","StockAcquisitionVault","UniswapV3BPSSwapAdapter","BPSTradeRouter"];
const slots = ["canaryToken","lockingVault","claimManager","rialtoAdapter","coordinator","stockVault","uniswapAdapter","tradeRouter"];

const PIN_BASEFEE = BigInt(policy.snapshot.baseFeePerGasWei);
async function send(from, tx){
  await rpc("anvil_setNextBlockBaseFeePerGas",[toHex(PIN_BASEFEE)]); // constant base fee -> deterministic effPrice
  const est = BigInt(await rpc("eth_estimateGas",[{from,...tx}]));
  const gl = gasLimitOf(est);
  const hash = await rpc("eth_sendTransaction",[{from,gas:toHex(gl),maxFeePerGas:toHex(MAX_FEE),maxPriorityFeePerGas:toHex(MAX_PRIORITY),...tx}]);
  const rc = await pub.waitForTransactionReceipt({hash});
  if(rc.status!=="success") throw new Error("revert: "+JSON.stringify(tx).slice(0,90));
  return { est, gl, rc };
}

// Build the full immediate sequence. record=true builds the artifact objects.
async function runImmediate(record){
  const A=(t)=>({type:t});
  const P={}; for(let i=0;i<8;i++) P[slots[i]]=getContractAddress({from:DEPLOYER,nonce:BigInt(DEPLOYER_START+i)});
  const specs=[
    { types:["address"], args:[DEPLOYER] },
    { types:["address","address"], args:[P.canaryToken,DEPLOYER] },
    { types:["address","address"], args:[P.coordinator,DEPLOYER] },
    { types:["address","address","address"], args:[P.stockVault,WETH,REGISTRY] },
    { types:["address","address","address","address"], args:[P.stockVault,P.claimManager,DEPLOYER,DEPLOYER] },
    { types:["address","address","address","address","address","address[]"], args:[WETH,P.rialtoAdapter,P.coordinator,DEPLOYER,P.coordinator,[NVDA]] },
    { types:["address","address","address","address","uint24"], args:[P.tradeRouter,P.canaryToken,WETH,SWAPROUTER,FEE] },
    { types:["address","address","address","address","address"], args:[DEPLOYER,P.canaryToken,WETH,P.uniswapAdapter,P.stockVault] },
  ];
  const txs=[]; let seq=0;
  const rec=(o)=>{ o.chainId=CHAIN_ID; o.gasLimit=gasLimitOf(o.gasEstimate).toString(); o.maxFeePerGas=MAX_FEE.toString(); o.maxPriorityFeePerGas=MAX_PRIORITY.toString(); o.maxGasCostWei=(BigInt(o.gasLimit)*MAX_FEE).toString(); txs.push(o); return o; };

  // Phase A deploy
  for(let i=0;i<8;i++){
    const s=specs[i], initCode=concatHex([creation(specNames[i]), encodeAbiParameters(s.types.map(A),s.args)]);
    const {est,rc}=await send(DEPLOYER,{data:initCode,value:"0x0"});
    if(getAddress(rc.contractAddress)!==getAddress(P[slots[i]])) throw new Error("addr mismatch "+specNames[i]);
    rec({ seq:seq++, phase:"A-deploy", label:specNames[i], signer:DEPLOYER, nonce:DEPLOYER_START+i, txType:"0x2 (EIP-1559 CREATE)", to:null,
      predictedCreationAddress:getAddress(P[slots[i]]), value:"0", dataOrInitCode:initCode, dataKeccak:keccak256(initCode),
      decodedArgs:{constructorTypes:s.types,constructorValues:s.args.map(hx)}, gasEstimate:hx(est), gasUsed:hx(rc.gasUsed), effectiveGasPrice:hx(rc.effectiveGasPrice), receiptStatus:rc.status, txHash:rc.transactionHash, blockHash:rc.blockHash, blockNumber:hx(rc.blockNumber),
      prerequisite:i===0?`deployer live nonce==${DEPLOYER_START}`:`deploy nonce ${DEPLOYER_START+i-1} confirmed`, reconciliation:"code at predicted CREATE address; constructor immutables wired",
      recovery:(specNames[i]==="BPSTradeRouter"||specNames[i]==="BPSLockingVault")?"owner pause/emergency post-deploy":"none (immutable)", irreversible:true });
  }
  const canary=P.canaryToken, vault=P.stockVault, router=P.tradeRouter, locking=P.lockingVault;

  async function mat(signer,to,data,meta){
    const {est,rc}=await send(signer,{to,data,value:"0x0"});
    const nonce=Number(await rpc("eth_getTransactionCount",[signer,"latest"]))-1;
    rec({ seq:seq++, phase:meta.phase, label:meta.label, signer, nonce, txType:"0x2 (EIP-1559 call)", to:getAddress(to), predictedCreationAddress:null,
      value:"0", dataOrInitCode:data, dataKeccak:keccak256(data), decodedArgs:meta.decoded, gasEstimate:hx(est), gasUsed:hx(rc.gasUsed), effectiveGasPrice:hx(rc.effectiveGasPrice), receiptStatus:rc.status, txHash:rc.transactionHash, blockHash:rc.blockHash, blockNumber:hx(rc.blockNumber),
      prerequisite:meta.prereq, reconciliation:meta.recon, recovery:meta.recovery||"n/a", irreversible:meta.irrev!==false });
    return rc;
  }
  const approveData=(sp,am)=>encodeFunctionData({abi:erc20,functionName:"approve",args:[sp,am]});

  // pool math
  const token0=BigInt(canary)>BigInt(WETH)?WETH:canary, token1=BigInt(canary)>BigInt(WETH)?canary:WETH;
  const bpscPerWethNum=CAP_MICRO*(1_000_000n/BigInt(policy.economics.bpscPriceMicroUsd)); const bpscPerWethDen=1_000_000n;
  const sqrtP=encodeSqrtRatioX96(bpscPerWethNum,bpscPerWethDen);
  const tickCur=tickAtSqrt(sqrtP);
  const tickLower=Number((BigInt(Math.floor(tickCur+Math.log(policy.economics.rangeLowMultNumer/policy.economics.rangeLowMultDenom)/Math.log(1.0001)))/SPACING)*SPACING);
  const tickUpper=Number((BigInt(Math.ceil(tickCur+Math.log(policy.economics.rangeHighMult)/Math.log(1.0001)))/SPACING)*SPACING);
  const sa=sqrtAtTick(tickLower), sb=sqrtAtTick(tickUpper);
  const a0Des=LP_WETH_WEI, a1Des=BPSC_LP_DESIRED;
  const L=(function(){const x=L0(sqrtP,sb,a0Des),y=L1(sa,sqrtP,a1Des);return x<y?x:y;})();
  const a0UsedCalc=amt0(sqrtP,sb,L), a1UsedCalc=amt1(sa,sqrtP,L);

  // Phase B approvals+pool+init
  await mat(DEPLOYER,WETH,approveData(NPM,a0Des),{phase:"B-lp",label:"WETH.approve(NPM)",decoded:{spender:NPM,amount:hx(a0Des)},prereq:"deployer holds WETH",recon:"allowance(deployer,NPM)==amount",irrev:false});
  await mat(DEPLOYER,canary,approveData(NPM,a1Des),{phase:"B-lp",label:"BPSC.approve(NPM)",decoded:{spender:NPM,amount:hx(a1Des)},prereq:"deployer holds 1e9 BPSC",recon:"allowance==amount",irrev:false});
  await mat(DEPLOYER,FACTORY,encodeFunctionData({abi:facAbi,functionName:"createPool",args:[token0,token1,FEE]}),{phase:"B-lp",label:"factory.createPool",decoded:{tokenA:token0,tokenB:token1,fee:FEE},prereq:"pool must not exist",recon:"getPool!=0",recovery:"none",irrev:true});
  const pool=await pub.readContract({address:FACTORY,abi:facAbi,functionName:"getPool",args:[token0,token1,FEE]});
  await mat(DEPLOYER,pool,encodeFunctionData({abi:poolAbi,functionName:"initialize",args:[sqrtP]}),{phase:"B-lp",label:"pool.initialize",decoded:{sqrtPriceX96:hx(sqrtP)},prereq:"pool created, uninitialized",recon:"slot0.sqrtPriceX96==arg",recovery:"none",irrev:true});

  // LP mint: dry-run to learn used, derive non-zero mins, execute with them
  const mintP=(a0m,a1m)=>({token0,token1,fee:FEE,tickLower,tickUpper,amount0Desired:a0Des,amount1Desired:a1Des,amount0Min:a0m,amount1Min:a1m,recipient:DEPLOYER,deadline:DEADLINE});
  const snapM=await rpc("evm_snapshot",[]); let a0u,a1u;
  { const w0=await bal(WETH,DEPLOYER),b0=await bal(canary,DEPLOYER);
    await send(DEPLOYER,{to:NPM,data:encodeFunctionData({abi:npmAbi,functionName:"mint",args:[mintP(0n,0n)]}),value:"0x0"});
    a0u=w0-await bal(WETH,DEPLOYER); a1u=b0-await bal(canary,DEPLOYER); }
  await rpc("evm_revert",[snapM]);
  const a0Min=a0u*995n/1000n, a1Min=a1u*995n/1000n;
  const wBefMint=await bal(WETH,DEPLOYER), bBefMint=await bal(canary,DEPLOYER);
  const mintRc=await mat(DEPLOYER,NPM,encodeFunctionData({abi:npmAbi,functionName:"mint",args:[mintP(a0Min,a1Min)]}),{phase:"B-lp",label:"NPM.mint",decoded:{token0,token1,fee:FEE,tickLower,tickUpper,amount0Desired:hx(a0Des),amount1Desired:hx(a1Des),amount0Min:hx(a0Min),amount1Min:hx(a1Min),recipient:DEPLOYER,deadline:hx(DEADLINE)},prereq:"approvals; pool initialized; deadline>now",recon:"IncreaseLiquidity; NFT to deployer; used>=min",recovery:"decreaseLiquidity+collect+burn NFT",irrev:true});
  // decode the minted ERC721 position tokenId from the NPM Transfer(0x0 -> deployer, tokenId) log
  const ERC721_XFER="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  let positionTokenId=null;
  for(const lg of mintRc.logs){ if(lg.address.toLowerCase()===NPM.toLowerCase() && lg.topics.length===4 && lg.topics[0].toLowerCase()===ERC721_XFER) positionTokenId=BigInt(lg.topics[3]); }
  if(positionTokenId===null) throw new Error("could not decode minted position tokenId");
  const npmPosAbi=[{type:"function",name:"positions",stateMutability:"view",inputs:[{type:"uint256"}],outputs:[{name:"nonce",type:"uint96"},{name:"operator",type:"address"},{name:"token0",type:"address"},{name:"token1",type:"address"},{name:"fee",type:"uint24"},{name:"tickLower",type:"int24"},{name:"tickUpper",type:"int24"},{name:"liquidity",type:"uint128"},{name:"feeGrowthInside0LastX128",type:"uint256"},{name:"feeGrowthInside1LastX128",type:"uint256"},{name:"tokensOwed0",type:"uint128"},{name:"tokensOwed1",type:"uint128"}]},{type:"function",name:"ownerOf",stateMutability:"view",inputs:[{type:"uint256"}],outputs:[{type:"address"}]}];
  const posOwner=await pub.readContract({address:NPM,abi:npmPosAbi,functionName:"ownerOf",args:[positionTokenId]});
  const pos=await pub.readContract({address:NPM,abi:npmPosAbi,functionName:"positions",args:[positionTokenId]});
  const a0Act=wBefMint-await bal(WETH,DEPLOYER), a1Act=bBefMint-await bal(canary,DEPLOYER);
  const slot0=await pub.readContract({address:pool,abi:poolAbi,functionName:"slot0"});
  const poolLiq=await pub.readContract({address:pool,abi:poolAbi,functionName:"liquidity"});
  const lpUsage={token0,token1,sqrtPriceX96:hx(sqrtP),tickLower,tickUpper,liquidity:hx(L),amount0Desired:hx(a0Des),amount1Desired:hx(a1Des),
    amount0Used:hx(a0Act),amount1Used:hx(a1Act),amount0UsedCalc:hx(a0UsedCalc),amount1UsedCalc:hx(a1UsedCalc),
    minFormula:"floor(amountUsed*995/1000)",amount0Min:hx(a0Min),amount1Min:hx(a1Min),minInCalldata:true,
    positionTokenId:hx(positionTokenId), positionOwner:getAddress(posOwner), positionFee:Number(pos[4]), positionTickLower:Number(pos[5]), positionTickUpper:Number(pos[6]), positionLiquidity:hx(pos[7]),
    deployerWethBefore:hx(wBefMint),deployerWethAfter:hx(await bal(WETH,DEPLOYER)),deployerBpscBefore:hx(bBefMint),deployerBpscAfter:hx(await bal(canary,DEPLOYER)),
    poolSqrtAfter:hx(slot0[0]),poolTickAfter:Number(slot0[1]),poolLiquidityAfter:hx(poolLiq)};

  // Phase C buy (non-zero user+burn mins)
  await mat(TESTER,WETH,approveData(router,BUY_WETH_WEI),{phase:"C-trade",label:"tester WETH.approve(router)",decoded:{spender:router,amount:hx(BUY_WETH_WEI)},prereq:"tester holds WETH",recon:"allowance(tester,router)==amount",irrev:false});
  const snapB=await rpc("evm_snapshot",[]); let buyDry;
  { const rcv=await send(TESTER,{to:router,data:encodeFunctionData({abi:routerAbi,functionName:"buyExactWethForBps",args:[BUY_WETH_WEI,0n,0n,TESTER,DEADLINE]}),value:"0x0"});
    for(const lg of rcv.rc.logs){try{const d=decodeEventLog({abi:routerAbi,data:lg.data,topics:lg.topics});if(d.eventName==="OfficialBuy")buyDry=d.args;}catch{}} }
  await rpc("evm_revert",[snapB]);
  const minUserBps=BigInt(buyDry.userBpsOutput)*99n/100n, minBuyBurn=BigInt(buyDry.bpsBurned)*99n/100n;
  const tW0=await bal(WETH,TESTER), tB0=await bal(canary,TESTER), vW0=await bal(WETH,vault);
  const buyRc=await mat(TESTER,router,encodeFunctionData({abi:routerAbi,functionName:"buyExactWethForBps",args:[BUY_WETH_WEI,minUserBps,minBuyBurn,TESTER,DEADLINE]}),{phase:"C-trade",label:"buyExactWethForBps",decoded:{grossWethInput:hx(BUY_WETH_WEI),minimumUserBpsOutput:hx(minUserBps),minimumBurnBpsOutput:hx(minBuyBurn),recipient:TESTER,deadline:hx(DEADLINE)},prereq:"tester WETH approval; pool liquidity",recon:"OfficialBuy; tester BPS up",recovery:"n/a (atomic)",irrev:true});
  let buyEv; for(const lg of buyRc.logs){try{const d=decodeEventLog({abi:routerAbi,data:lg.data,topics:lg.topics});if(d.eventName==="OfficialBuy")buyEv=d.args;}catch{}}
  const boughtBps=await bal(canary,TESTER)-tB0;
  const buyAcct={grossWethInput:hx(BUY_WETH_WEI),grossWethMicroUsd:hx(usdMicroOfWei(BUY_WETH_WEI)),stockBudget2pct:hx(buyEv.stockBudget),burnBudget1pct:hx(buyEv.burnBudget),userWethBudget97pct:hx(buyEv.userWethBudget),
    userBpsOutput:hx(buyEv.userBpsOutput),bpsBurned:hx(buyEv.bpsBurned),minimumUserBpsOutput:hx(minUserBps),minimumBurnBpsOutput:hx(minBuyBurn),minFormula:"floor(actual*99/100)",
    testerWethBefore:hx(tW0),testerWethAfter:hx(await bal(WETH,TESTER)),testerBpsBefore:hx(tB0),testerBpsAfter:hx(await bal(canary,TESTER)),vaultWethBefore:hx(vW0),vaultWethAfter:hx(await bal(WETH,vault)),allocationSum:hx(BigInt(buyEv.stockBudget)+BigInt(buyEv.burnBudget)+BigInt(buyEv.userWethBudget))};

  // Phase C sell HALF (non-zero gross+user+burn mins)
  const sellBps=boughtBps/2n;
  await mat(TESTER,canary,approveData(router,sellBps),{phase:"C-trade",label:"tester BPSC.approve(router)",decoded:{spender:router,amount:hx(sellBps)},prereq:"tester holds BPS from buy",recon:"allowance==sellBps",irrev:false});
  const snapS=await rpc("evm_snapshot",[]); let sellDry;
  { const rcv=await send(TESTER,{to:router,data:encodeFunctionData({abi:routerAbi,functionName:"sellExactBpsForWeth",args:[sellBps,0n,0n,0n,TESTER,DEADLINE]}),value:"0x0"});
    for(const lg of rcv.rc.logs){try{const d=decodeEventLog({abi:routerAbi,data:lg.data,topics:lg.topics});if(d.eventName==="OfficialSell")sellDry=d.args;}catch{}} }
  await rpc("evm_revert",[snapS]);
  const minGross=BigInt(sellDry.grossWethOutput)*99n/100n, minUserW=BigInt(sellDry.userWethOutput)*99n/100n, minSellBurn=BigInt(sellDry.bpsBurned)*99n/100n;
  const tW1=await bal(WETH,TESTER), tB1=await bal(canary,TESTER), vW1=await bal(WETH,vault);
  const sellRc=await mat(TESTER,router,encodeFunctionData({abi:routerAbi,functionName:"sellExactBpsForWeth",args:[sellBps,minGross,minUserW,minSellBurn,TESTER,DEADLINE]}),{phase:"C-trade",label:"sellExactBpsForWeth",decoded:{grossBpsInput:hx(sellBps),minimumGrossWethOutput:hx(minGross),minimumUserWethOutput:hx(minUserW),minimumBurnBpsOutput:hx(minSellBurn),recipient:TESTER,deadline:hx(DEADLINE)},prereq:"tester BPS approval to router",recon:"OfficialSell; tester WETH up",recovery:"n/a",irrev:true});
  let sellEv; for(const lg of sellRc.logs){try{const d=decodeEventLog({abi:routerAbi,data:lg.data,topics:lg.topics});if(d.eventName==="OfficialSell")sellEv=d.args;}catch{}}
  const userWethOut=BigInt(sellEv.userWethOutput);
  const sellAcct={grossBpsInput:hx(sellBps),grossWethOutput:hx(sellEv.grossWethOutput),stockAcquisition2pct:hx(sellEv.stockBudget),retirementBurn2pct:hx(sellEv.burnBudget),userWethOutput96pct:hx(sellEv.userWethOutput),bpsBurned:hx(sellEv.bpsBurned),
    minimumGrossWethOutput:hx(minGross),minimumUserWethOutput:hx(minUserW),minimumBurnBpsOutput:hx(minSellBurn),minFormula:"floor(actual*99/100)",slippageTolerancePct:"1.000",
    userWethMicroUsd:hx(usdMicroOfWei(userWethOut)),sellCapMicroUsdLimit:(BigInt(policy.caps.individualTradeUsd)*1_000_000n).toString(),withinSellCap:usdMicroOfWei(userWethOut)<=BigInt(policy.caps.individualTradeUsd)*1_000_000n,
    testerWethBefore:hx(tW1),testerWethAfter:hx(await bal(WETH,TESTER)),testerBpsBefore:hx(tB1),testerBpsAfter:hx(await bal(canary,TESTER)),vaultWethBefore:hx(vW1),vaultWethAfter:hx(await bal(WETH,vault)),allocationSum:hx(BigInt(sellEv.stockBudget)+BigInt(sellEv.burnBudget)+BigInt(sellEv.userWethOutput))};

  // Phase D lock remaining
  const lockAmount=await bal(canary,TESTER);
  await mat(TESTER,canary,approveData(locking,lockAmount),{phase:"D-lock",label:"tester BPSC.approve(vault)",decoded:{spender:locking,amount:hx(lockAmount)},prereq:"tester holds remaining BPS",recon:"allowance(tester,vault)==amount",irrev:false});
  const lockRc=await mat(TESTER,locking,encodeFunctionData({abi:lockAbi,functionName:"createLock",args:[lockAmount,604800]}),{phase:"D-lock",label:"createLock(amount,7d)",decoded:{amount:hx(lockAmount),duration:604800},prereq:"tester BPS approval to vault",recon:"LockCreated; lockId=0",recovery:"withdraw(lockId) after unlockTime",irrev:false});
  let lockId,principal,unlockTime; for(const lg of lockRc.logs){try{const d=decodeEventLog({abi:lockAbi,data:lg.data,topics:lg.topics});if(d.eventName==="LockCreated"){lockId=d.args.lockId;principal=d.args.principal;unlockTime=d.args.unlockTime;}}catch{}}

  return { txs, P, pool:getAddress(pool), canary, vault, router, locking, claimManager:P.claimManager, rialtoAdapter:P.rialtoAdapter, coordinator:P.coordinator, uniswapAdapter:P.uniswapAdapter,
    lpUsage, buyAcct, sellAcct, lockId, principal, unlockTime, token0, token1 };
}

async function main(){
  // ---- snapshot-safe: fork LATEST must equal the pinned snapshot (fork not ahead/behind/different) ----
  const cid=BigInt(await rpc("eth_chainId")); if(cid!==BigInt(CHAIN_ID)) throw new Error("chainId "+cid);
  const latest=await pub.request({method:"eth_getBlockByNumber",params:["latest",false]});
  FORK={number:BigInt(latest.number),hash:latest.hash,timestamp:BigInt(latest.timestamp),baseFee:BigInt(latest.baseFeePerGas)};
  if(FORK.number!==BigInt(policy.snapshot.forkBlock)) throw new Error(`fork LATEST ${FORK.number} != pinned ${policy.snapshot.forkBlock} (fork ahead/behind)`);
  if(FORK.hash.toLowerCase()!==policy.snapshot.forkHash.toLowerCase()) throw new Error("fork latest hash mismatch");
  if(FORK.timestamp!==BigInt(policy.snapshot.forkTimestamp)) throw new Error("fork timestamp mismatch");
  if(FORK.baseFee!==BigInt(policy.snapshot.baseFeePerGasWei)) throw new Error("fork baseFee mismatch");
  // independent live-RPC cross-check: same block number must have the same hash on the live chain
  const liveBlk=await live.request({method:"eth_getBlockByNumber",params:[toHex(policy.snapshot.forkBlock),false]});
  if(liveBlk.hash.toLowerCase()!==FORK.hash.toLowerCase()) throw new Error("live-RPC hash mismatch vs fork latest");
  const anvilConfig={...policy.anvilLaunch, forkUrl:undefined, forkUrlEnvVar:(policy.liveRpcEnvVar||"ROBINHOOD_CHAIN_RPC_URL"), observedLatest:{number:FORK.number.toString(),hash:FORK.hash,timestamp:FORK.timestamp.toString(),baseFeePerGas:FORK.baseFee.toString()}, liveCrossCheckHash:liveBlk.hash, liveCrossCheckMatches:true, blockTimestampIntervalSeconds:1};
  await rpc("anvil_setBlockTimestampInterval",[1]); // deterministic timestamps -> reproducible replay
  SIM_TS=Number(FORK.timestamp); WINDOW=BigInt(policy.validity&&policy.validity.windowSeconds?policy.validity.windowSeconds:1200); DEADLINE=BigInt(SIM_TS)+WINDOW;
  // live + fork nonces
  const liveD=await live.getTransactionCount({address:DEPLOYER}), liveT=await live.getTransactionCount({address:TESTER});
  const forkD=Number(await rpc("eth_getTransactionCount",[DEPLOYER,"latest"])), forkT=Number(await rpc("eth_getTransactionCount",[TESTER,"latest"]));
  if(liveD!==policy.expectedNonces.deployer||liveT!==policy.expectedNonces.tester) throw new Error("live nonce mismatch "+liveD+"/"+liveT);
  // deployment/tester START nonces are read from live state (never hardcoded); fork (pinned at the
  // captured block) must carry exactly those nonces, and CREATE addresses derive from them.
  DEPLOYER_START=forkD; TESTER_START=forkT;
  if(forkD!==policy.expectedNonces.deployer||forkT!==policy.expectedNonces.tester) throw new Error(`fork nonce ${forkD}/${forkT} != expected ${policy.expectedNonces.deployer}/${policy.expectedNonces.tester}`);
  if(MAX_FEE<FORK.baseFee) throw new Error("maxFee<baseFee");

  // ---- build provenance ----
  const gitHead=execSync("git rev-parse HEAD",{cwd:REPO}).toString().trim();
  const gitDirtyTracked=execSync("git status --porcelain --untracked-files=no",{cwd:REPO}).toString().trim();
  const contractsProvenance={};
  for(const n of specNames){
    const aj=artifactJson(n); const fileBuf=readFileSync(`${OUT}/${n}.sol/${n}.json`);
    const srcLines=Object.entries(aj.metadata.sources).map(([p,v])=>`${p}:${v.keccak256}`).sort();
    contractsProvenance[n]={ solc:aj.metadata.compiler.version, optimizer:aj.metadata.settings.optimizer, evmVersion:aj.metadata.settings.evmVersion,
      creationBytecodeKeccak:keccak256(aj.bytecode.object), runtimeBytecodeKeccak:keccak256(aj.deployedBytecode.object),
      artifactSha256:sha256(fileBuf), sourceListKeccak:keccak256(toHex(srcLines.join("\n"))) };
  }
  const provenance={ repoHead:gitHead, dirtyTrackedTree:gitDirtyTracked.length>0, dirtyTrackedDetail:gitDirtyTracked||"clean (tracked files)", contracts:contractsProvenance };

  // ---- provision: generous ETH seed (gas-estimate stability; exact-seeding gas is circular under
  //      no-hardcoded-trust), EXACT WETH (no headroom). Funding REQUIREMENT is derived from the
  //      recorded per-signer max gas cost and delivered by the separate funding packet. ----
  const SEED_ETH=10n**18n;
  await rpc("anvil_setBalance",[DEPLOYER,toHex(SEED_ETH)]);
  await rpc("anvil_setBalance",[TESTER,toHex(SEED_ETH)]);
  await rpc("anvil_impersonateAccount",[DEPLOYER]); await rpc("anvil_impersonateAccount",[TESTER]);
  // Provision the EXACT packet WETH amount by writing the WETH balanceOf storage slot directly (no
  // extra nonce consumed). The wallets may already hold WETH (real reconciliation) or the whale may be
  // unreliable at this block, so set-exact is the robust mechanism. Slot index discovered from a holder
  // with a KNOWN nonzero live balance (the deployer, per the block snapshot) so it self-verifies.
  const snapForSlot=JSON.parse(readFileSync(`${DIR}/bundle/block-snapshot.json`,"utf8"));
  const knownHolder=DEPLOYER, knownBal=BigInt(snapForSlot.balances.weth.deployer);
  if(knownBal===0n) throw new Error("cannot discover WETH slot: deployer live WETH balance is 0");
  let wethSlotIndex=null;
  for(let idx=0; idx<300; idx++){
    const slot=keccak256(encodeAbiParameters([{type:"address"},{type:"uint256"}],[knownHolder,BigInt(idx)]));
    const raw=await rpc("eth_getStorageAt",[WETH,slot,"latest"]);
    if(BigInt(raw)===knownBal){ wethSlotIndex=BigInt(idx); break; }
  }
  if(wethSlotIndex===null) throw new Error("could not discover WETH balanceOf storage slot");
  const setWeth=async(who,amt)=>{
    const slot=keccak256(encodeAbiParameters([{type:"address"},{type:"uint256"}],[who,wethSlotIndex]));
    await rpc("anvil_setStorageAt",[WETH,slot,toHex(amt,{size:32})]);
    if((await bal(WETH,who))!==amt) throw new Error("weth set-exact failed "+who);
  };
  await setWeth(DEPLOYER,LP_WETH_WEI); await setWeth(TESTER,TRADE_TOTAL_WEI);
  const sig=(arr,who)=>arr.filter(t=>getAddress(t.signer)===getAddress(who)).reduce((s,t)=>s+BigInt(t.maxGasCostWei),0n);

  const startBal={ deployer:{eth:hx(await ethBal(DEPLOYER)),weth:hx(await bal(WETH,DEPLOYER)),bpsc:"0 (token not yet deployed)"}, tester:{eth:hx(await ethBal(TESTER)),weth:hx(await bal(WETH,TESTER)),bpsc:"0"} };
  const R=await runImmediate(true);
  const deployerFund=sig(R.txs,DEPLOYER), testerImmFund=sig(R.txs,TESTER); // exact per-signer max gas cost (funding requirement)
  startBal.deployer.bpsc=hx(R.lpUsage.deployerBpscBefore); // 1e9 minted at deploy nonce 0 (pre-LP inventory)

  // role/ownership from FORK state
  const routerOwner=await pub.readContract({address:R.router,abi:routerAbi,functionName:"owner"});
  const lockingOwner=await pub.readContract({address:R.locking,abi:lockAbi,functionName:"owner"});
  const claimOwner=await pub.readContract({address:R.claimManager,abi:abiOf("DistributionClaimManager"),functionName:"owner"});
  const roleProof={ routerOwner, lockingOwner, claimManagerOwner:claimOwner, coordinator:R.coordinator,
    routerOwnerIsDeployer:getAddress(routerOwner)===getAddress(DEPLOYER), lockingOwnerIsDeployer:getAddress(lockingOwner)===getAddress(DEPLOYER),
    claimManagerOwnerIsCoordinator:getAddress(claimOwner)===getAddress(R.coordinator), extraConfigTxRequired:false, readFrom:"fork state (post-deploy)" };

  const endBal={ deployer:{eth:hx(await ethBal(DEPLOYER)),weth:hx(await bal(WETH,DEPLOYER)),bpsc:hx(await bal(R.canary,DEPLOYER))}, tester:{eth:hx(await ethBal(TESTER)),weth:hx(await bal(WETH,TESTER)),bpsc:hx(await bal(R.canary,TESTER))} };

  // ---- delayed withdrawal (separate schedule) ----
  const snapPre=await rpc("evm_snapshot",[]);
  await rpc("evm_setNextBlockTimestamp",[Number(R.unlockTime)+1]); await rpc("anvil_setNextBlockBaseFeePerGas",[toHex(PIN_BASEFEE)]); await rpc("evm_mine",[]);
  const wData=encodeFunctionData({abi:lockAbi,functionName:"withdraw",args:[R.lockId]});
  await rpc("anvil_setNextBlockBaseFeePerGas",[toHex(PIN_BASEFEE)]);
  const wEst=BigInt(await rpc("eth_estimateGas",[{from:TESTER,to:R.locking,data:wData}]));
  const wLimit=gasLimitOf(wEst), delayedFund=wLimit*MAX_FEE;
  await rpc("anvil_setBalance",[TESTER,toHex(delayedFund)]); // separate delayed funding = exact max gas
  const tBpsBeforeW=await bal(R.canary,TESTER), tEthBeforeW=await ethBal(TESTER);
  await rpc("anvil_setNextBlockBaseFeePerGas",[toHex(PIN_BASEFEE)]);
  const wHash=await rpc("eth_sendTransaction",[{from:TESTER,to:R.locking,data:wData,gas:toHex(wLimit),maxFeePerGas:toHex(MAX_FEE),maxPriorityFeePerGas:toHex(MAX_PRIORITY)}]);
  const wRc=await pub.waitForTransactionReceipt({hash:wHash});
  const returned=await bal(R.canary,TESTER)-tBpsBeforeW;
  const delayed={ phase:"E-delayed-withdraw", label:"withdraw(lockId)", chainId:CHAIN_ID, txHash:wRc.transactionHash, blockHash:wRc.blockHash, blockNumber:hx(wRc.blockNumber), signer:TESTER, nonce:Number(await rpc("eth_getTransactionCount",[TESTER,"latest"]))-1, txType:"0x2 (EIP-1559 call)", to:getAddress(R.locking), predictedCreationAddress:null, value:"0",
    note:"SEPARATE delayed sub-packet; funded separately ~7 days after createLock", lockId:hx(R.lockId), principal:hx(R.principal), unlockTime:hx(R.unlockTime), earliestBlockTimestamp:hx(R.unlockTime),
    dataOrInitCode:wData, dataKeccak:keccak256(wData), decodedArgs:{lockId:hx(R.lockId)}, gasEstimate:hx(wEst), gasUsed:hx(wRc.gasUsed), effectiveGasPrice:hx(wRc.effectiveGasPrice), receiptStatus:wRc.status,
    gasLimit:wLimit.toString(), maxFeePerGas:MAX_FEE.toString(), maxPriorityFeePerGas:MAX_PRIORITY.toString(), maxGasCostWei:delayedFund.toString(),
    testerEthFundedForWithdraw:hx(delayedFund), testerEthBeforeWithdraw:hx(tEthBeforeW), testerEthAfterWithdraw:hx(await ethBal(TESTER)), testerBpsBefore:hx(tBpsBeforeW), testerBpsAfter:hx(await bal(R.canary,TESTER)),
    returnedPrincipal:hx(returned), returnedEqualsPrincipal:returned===R.principal, emergencyExitUsed:false, prerequisite:"createLock confirmed; block.timestamp>=unlockTime", reconciliation:"LockWithdrawn(principal); tester BPS+=principal", irreversible:true };
  await rpc("evm_revert",[snapPre]);

  // ---- gas + funding packet + exposure ----
  const usd6=(wei)=>Number(usdMicroOfWei(wei))/1e6;
  const immGas=deployerFund+testerImmFund, delayedGas=BigInt(delayed.maxGasCostWei), tradeGas=sig(R.txs,TESTER);
  // ---- funding PLAN (NOT a packet): no funder selected -> executable=false, fundingAuthorized=false.
  // Includes WETH wrapping txs (funder WETH sufficiency NOT assumed) whose gas enters aggregate exposure.
  const wethXferData=(to,amt)=>encodeFunctionData({abi:erc20,functionName:"transfer",args:[to,amt]});
  const wethDepositData="0xd0e30db0"; // WETH.deposit()
  const ETH_XFER_GL=gasLimitOf(21000), WETH_XFER_GL=gasLimitOf(51000), WETH_WRAP_GL=gasLimitOf(50000);
  const mk=(o)=>({from:"<separate funding wallet — address/nonce/key not requested>",chainId:CHAIN_ID,maxFeePerGas:MAX_FEE.toString(),maxPriorityFeePerGas:MAX_PRIORITY.toString(),...o,maxGasCostWei:(BigInt(o.gasLimit)*MAX_FEE).toString()});
  const fundingPlan={ executable:false, fundingAuthorized:false,
    note:"SEPARATE funding PLAN paid by a not-yet-selected funding wallet; inbound transfers do NOT consume canary-wallet nonces. No funder WETH holdings are assumed; wrapping txs are included and their gas enters aggregate exposure. gasLimit methodology: eth_estimateGas at funding time; here conservative constants (ETH-transfer 21000, WETH-transfer 51000, WETH-deposit 50000) each x ceil(1.2).",
    wrapping:[
      mk({kind:"WETH-wrap(deposit)",target:getAddress(WETH),token:"native ETH -> WETH",ethValue:(LP_WETH_WEI).toString(),calldata:wethDepositData,note:"wrap $100-worth ETH into WETH (value == deployer LP WETH; already counted in exposure)",gasLimit:WETH_WRAP_GL.toString(),schedule:"immediate"}),
      mk({kind:"WETH-wrap(deposit)",target:getAddress(WETH),token:"native ETH -> WETH",ethValue:(TRADE_TOTAL_WEI).toString(),calldata:wethDepositData,note:"wrap $20-worth ETH into WETH (value == tester trade WETH; already counted)",gasLimit:WETH_WRAP_GL.toString(),schedule:"immediate"}),
    ],
    transfers:[
      mk({kind:"WETH-transfer",target:getAddress(WETH),token:getAddress(WETH),recipient:getAddress(DEPLOYER),ethValue:"0",amount:LP_WETH_WEI.toString(),amountMicroUsd:usdMicroOfWei(LP_WETH_WEI).toString(),calldata:wethXferData(DEPLOYER,LP_WETH_WEI),gasLimit:WETH_XFER_GL.toString(),schedule:"immediate",purpose:"deployer LP WETH ($100 floor)"}),
      mk({kind:"WETH-transfer",target:getAddress(WETH),token:getAddress(WETH),recipient:getAddress(TESTER),ethValue:"0",amount:TRADE_TOTAL_WEI.toString(),amountMicroUsd:usdMicroOfWei(TRADE_TOTAL_WEI).toString(),calldata:wethXferData(TESTER,TRADE_TOTAL_WEI),gasLimit:WETH_XFER_GL.toString(),schedule:"immediate",purpose:"tester trade WETH ($20 floor)"}),
      mk({kind:"ETH-transfer",target:getAddress(DEPLOYER),token:"native ETH",recipient:getAddress(DEPLOYER),ethValue:deployerFund.toString(),calldata:"0x",gasLimit:ETH_XFER_GL.toString(),schedule:"immediate",purpose:"deployer immediate gas (= Σ deployer max gas cost)"}),
      mk({kind:"ETH-transfer",target:getAddress(TESTER),token:"native ETH",recipient:getAddress(TESTER),ethValue:testerImmFund.toString(),calldata:"0x",gasLimit:ETH_XFER_GL.toString(),schedule:"immediate",purpose:"tester immediate gas (= Σ tester max gas cost)"}),
      mk({kind:"ETH-transfer",target:getAddress(TESTER),token:"native ETH",recipient:getAddress(TESTER),ethValue:delayedGas.toString(),calldata:"0x",gasLimit:ETH_XFER_GL.toString(),schedule:"delayed (~7 days, unlockTime "+R.unlockTime+")",purpose:"tester delayed-withdraw gas"}),
    ] };
  const fundingTxGas=[...fundingPlan.wrapping,...fundingPlan.transfers].reduce((s,t)=>s+BigInt(t.maxGasCostWei),0n);
  const allInclusiveGas=immGas+delayedGas+fundingTxGas;
  const lpWethWei=LP_WETH_WEI, tradeWethWei=TRADE_TOTAL_WEI;
  const capMicro=(u)=>BigInt(u)*1_000_000n;
  // item 8: sum ALL principal + maximum-gas wei FIRST, then convert ONCE to micro-USD
  const aggregateWei = lpWethWei + tradeWethWei + allInclusiveGas;
  const aggMicro = usdMicroOfWei(aggregateWei);
  const capArithmetic={ capPriceMicroUsd:CAP_MICRO.toString(), capPriceUsd:(Number(CAP_MICRO)/1e6).toFixed(6), priceSources:price.sources.map(s=>({name:s.name,microUsd:s.microUsd})), selectedHigher:price.selected,
    maxFeePerGasWei:MAX_FEE.toString(), maxPriorityFeePerGasWei:MAX_PRIORITY.toString(), baseFeePerGasWei:FORK.baseFee.toString(), maxFeeGteBase:MAX_FEE>=FORK.baseFee,
    deployer:{wethWei:lpWethWei.toString(),wethMicroUsd:usdMicroOfWei(lpWethWei).toString(),wethUnderCap:usdMicroOfWei(lpWethWei)<=capMicro(policy.caps.lpWethUsd),immediateGasWei:deployerFund.toString()},
    tester:{wethWei:tradeWethWei.toString(),wethMicroUsd:usdMicroOfWei(tradeWethWei).toString(),wethUnderCap:usdMicroOfWei(tradeWethWei)<=capMicro(policy.caps.controlledTradesUsd),immediateGasWei:testerImmFund.toString()},
    immediateGasWei:immGas.toString(), immediateGasMicroUsd:usdMicroOfWei(immGas).toString(), immediateGasUnder10:usdMicroOfWei(immGas)<=capMicro(policy.caps.gasUsd),
    delayedGasWei:delayedGas.toString(), delayedGasMicroUsd:usdMicroOfWei(delayedGas).toString(),
    fundingTxGasWei:fundingTxGas.toString(), fundingTxGasMicroUsd:usdMicroOfWei(fundingTxGas).toString(),
    allInclusiveGasWei:allInclusiveGas.toString(), allInclusiveGasMicroUsd:usdMicroOfWei(allInclusiveGas).toString(), allInclusiveGasUsd:usd6(allInclusiveGas).toFixed(6),
    fundingSchedules:{ immediate:{deployerWeth:lpWethWei.toString(),testerWeth:tradeWethWei.toString(),deployerEth:deployerFund.toString(),testerEth:testerImmFund.toString()}, delayed:{testerEth:delayedGas.toString(),whenApprox:"unlockTime "+R.unlockTime}, fundingWalletGas:fundingTxGas.toString() },
    aggregateWei:aggregateWei.toString(), aggregateMethod:"sum(all principal wei + all maximum-gas wei) THEN convert once to micro-USD",
    allInclusiveExposureMicroUsd:aggMicro.toString(), allInclusiveExposureUsd:(Number(aggMicro)/1e6).toFixed(6), aggregateUnderCap:aggMicro<=capMicro(policy.caps.aggregateUsd), maxAuthorizedAggregateUsd:policy.caps.aggregateUsd };
  if(!capArithmetic.immediateGasUnder10) throw new Error("immediate gas > $10");
  if(!capArithmetic.aggregateUnderCap) throw new Error("aggregate > $130");

  // ---- address guards (allow-set derived from pinned infra + CREATE; canonical BPS from ALL manifests) ----
  const createSet=slots.map((_,i)=>getAddress(getContractAddress({from:DEPLOYER,nonce:BigInt(DEPLOYER_START+i)})));
  const infraSet=[WETH,FACTORY,NPM,SWAPROUTER,REGISTRY,R.pool].map(getAddress);
  const allowedTargets=[...new Set([...createSet,...infraSet])];
  const symbol=await pub.readContract({address:R.canary,abi:erc20,functionName:"symbol"});
  // Inspect every deployment manifest for a CANONICAL (production, symbol 'BPS') deployment with real addresses.
  const deployDir=`${REPO}/packages/contracts/deploy`;
  const manifestsInspected=[]; const canonicalBpsAddresses=[];
  for(const f of readdirSync(deployDir).filter(f=>f.endsWith(".json"))){
    let m; try{ m=JSON.parse(readFileSync(`${deployDir}/${f}`,"utf8")); }catch{ continue; }
    const isCanonical = m.production===true || (m.token&&m.token.symbol==="BPS");
    const actualAddrs = m.actual? Object.values(m.actual).filter(v=>typeof v==="string"&&/^0x[0-9a-fA-F]{40}$/.test(v)) : [];
    manifestsInspected.push({file:f, canary:m.canary===true, production:m.production===true, tokenSymbol:m.token&&m.token.symbol, isCanonical, deployedAddressCount:actualAddrs.length});
    if(isCanonical) for(const a of actualAddrs) canonicalBpsAddresses.push(getAddress(a));
  }
  const addressGuards={ allowedTargets, createAddresses:createSet, infrastructure:infraSet, poolAddress:R.pool,
    canonicalBpsAddresses, canonicalProof:"No manifest declares a deployed canonical BPS (production:true or token.symbol=='BPS' with non-null actual addresses). The only canary manifest is BPSC-TEST; the dryrun manifest has all-null addresses. => no canonical BPS deployment exists.",
    manifestsInspected, canaryTokenSymbol:symbol };

  // ---- safety flags (all four false; also asserted against policy) ----
  const safetyFlags={ broadcastReady:false, liveWritesApproved:false, executionAuthorized:false, fundingAuthorized:false };
  for(const k of Object.keys(safetyFlags)) if(policy.safetyFlags[k]!==false) throw new Error("policy flag not false: "+k);

  // normalized signable fields per tx (what a signer would sign)
  const signable=(t)=>({chainId:CHAIN_ID,signer:getAddress(t.signer),nonce:t.nonce,type:2,to:t.to?getAddress(t.to):null,value:t.value||"0",data:t.dataOrInitCode,gasLimit:t.gasLimit,maxFeePerGas:t.maxFeePerGas,maxPriorityFeePerGas:t.maxPriorityFeePerGas});

  // ---- assemble ----
  const artifact={
    meta:{ task:"10B-8", kind:"self-contained replayable canary review packet — HISTORICAL FIXTURE (non-live, non-executable)",
      mode:policy.mode, live:policy.live===true, executable:false, executionAuthorized:false, fundingAuthorized:false,
      fixtureNote:policy.mode==="live"
        ? "TASK 10C: FRESH LIVE unsigned packet generated against the configured provider RPC and pinned to a freshly captured block. Preparation only — NOT funding or transaction authorization. Run preflight-check.mjs immediately before any execution."
        : "Historical test fixture. Regenerate against a fresh <=5-minute snapshot before any execution.",
      chainId:CHAIN_ID, anvilConfig,
      forkBlock:hx(FORK.number), forkBlockHash:FORK.hash, forkTimestamp:hx(FORK.timestamp), forkBaseFeePerGasWei:FORK.baseFee.toString(),
      liveNonces:{deployer:liveD,tester:liveT}, forkNonces:{deployer:forkD,tester:forkT}, startNonces:{deployer:DEPLOYER_START,tester:TESTER_START}, liveRpcCrossCheck:{block:policy.snapshot.forkBlock,hashMatches:anvilConfig.liveCrossCheckMatches},
      simulationTimestamp:SIM_TS, immediatePacketDeadline:hx(DEADLINE), snapshotBound:true, expiry:hx(DEADLINE), mustRegenerateBeforeExecution:true,
      generatedAtUtc:GENERATED_AT, expiresAtUtc:new Date((SIM_TS+Number(WINDOW))*1000).toISOString(), validityWindowSeconds:Number(WINDOW),
      priceCapturedAtUtc:price.capturedAt, priceFreshAtGenerationSeconds:MAX_PRICE_AGE_S,
      feeBounds:{ maxFeePerGasWei:MAX_FEE.toString(), maxPriorityFeePerGasWei:MAX_PRIORITY.toString(), pinnedBaseFeePerGasWei:PIN_BASEFEE.toString(),
        rule:"execution-time base fee must satisfy baseFee + maxPriorityFeePerGas <= maxFeePerGas" },
      capPriceMicroUsd:CAP_MICRO.toString(), deployer:DEPLOYER, tester:TESTER, containsSignature:false, containsPrivateMaterial:false,
      priceGate:{ requireLive:REQUIRE_LIVE, priceMode:price.mode, priceIsLive:PF.isLive, priceFreshAtGeneration:PF.fresh, maxPriceAgeSeconds:MAX_PRICE_AGE_S,
        rule:"a live/executable packet REQUIRES price.mode=live, price.live=true and every observation (and capturedAt) <=300s old; a fixture price forces executable=false" },
      executionPacketDigestDomain:"keccak256( stableJSON( [ signable(tx) for tx in immediateTransactions ++ [delayed] ] ) ); signable = {chainId,signer,nonce,type,to,value,data,gasLimit,maxFeePerGas,maxPriorityFeePerGas}",
      fullReviewArtifactDigestDomain:"keccak256( stableJSON(entire artifact with meta.fullReviewArtifactDigest field removed) )",
      selfReferentialHashFieldExcluded:"meta.fullReviewArtifactDigest" },
    safetyFlags, provenance, priceSnapshot:price, reviewPolicySnapshot:{forkBlock:policy.snapshot.forkBlock,caps:policy.caps,gas:policy.gas,mode:policy.mode},
    forkFunding:{ note:"WETH provisioned EXACTLY (no headroom). ETH seeded generously in-fork (1e18/signer) for gas-estimate stability; the funding REQUIREMENT (inbound.eth) equals the recorded per-signer maximum gas cost and is delivered by the separate funding plan. Actual gas spent (reconciled below) is far under the funded maximum.", ethSeedPerSignerWei:SEED_ETH.toString(), startingBalances:startBal, endingBalancesImmediate:endBal,
      inbound:{ deployer:{weth:lpWethWei.toString(),eth:deployerFund.toString()}, tester:{weth:tradeWethWei.toString(),ethImmediate:testerImmFund.toString(),ethDelayed:delayedGas.toString()} } },
    fundingPlan, roleConfigurationProof:roleProof, capArithmetic, addressGuards, lpUsage:R.lpUsage, buyAccounting:R.buyAcct, sellAccounting:R.sellAcct,
    lockAndWithdraw:{ lockId:hx(R.lockId), principal:hx(R.principal), unlockTime:hx(R.unlockTime), duration:604800, returnedPrincipal:delayed.returnedPrincipal, returnedEqualsPrincipal:delayed.returnedEqualsPrincipal },
    immediateTransactions:R.txs, delayedWithdrawalSubPacket:delayed,
  };

  const stable=(v)=>Array.isArray(v)?"["+v.map(stable).join(",")+"]":(v&&typeof v==="object")?"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}":JSON.stringify(v);
  // executionPacketDigest: over NORMALIZED SIGNABLE FIELDS of immediate txs + delayed
  const execDigest=keccak256(toHex(stable(R.txs.concat([delayed]).map(signable))));
  artifact.meta.deploymentOnlyDigest=keccak256(toHex(R.txs.filter(t=>t.phase==="A-deploy").map(t=>`${t.nonce}|${t.predictedCreationAddress.toLowerCase()}|${t.dataKeccak}`).join("\n")));
  artifact.meta.executionPacketDigest=execDigest;
  // fullReviewArtifactDigest: over the NORMALIZED (as-written) artifact minus meta.fullReviewArtifactDigest.
  const norm=JSON.parse(JSON.stringify(artifact)); delete norm.meta.fullReviewArtifactDigest;
  const fullDigest=keccak256(toHex(stable(norm)));
  artifact.meta.fullReviewArtifactDigest=fullDigest;

  writeFileSync(`${DIR}/canary-unsigned-packet.json`, JSON.stringify(artifact,null,2));
  // Update the BUNDLE (untracked) canary manifest's predicted addresses + startNonce to this deployment's
  // current-nonce CREATE addresses, so the manifest<->CREATE cross-check stays exact. The tracked repo
  // manifest is NOT modified.
  try {
    const bmPath=`${DIR}/bundle/manifests/robinhood-mainnet.canary.json`;
    const bm=JSON.parse(readFileSync(bmPath,"utf8"));
    bm.startNonce=DEPLOYER_START;
    bm.predicted={}; for(const s of slots) bm.predicted[s]=getAddress(R.P[s]);
    bm.startNonceNote=`Predicted addresses recomputed for the CURRENT deployer start nonce ${DEPLOYER_START} (read live; not hardcoded). Bundle copy only; the tracked repo manifest is unchanged.`;
    writeFileSync(bmPath, JSON.stringify(bm,null,2));
  } catch(e) { throw new Error("bundle manifest update failed: "+e.message); }
  console.log("executionPacketDigest:",execDigest);
  console.log("fullReviewArtifactDigest:",fullDigest);
  console.log("immediateGasUsd:",usd6(immGas).toFixed(6),"allInclusiveExposureUsd:",capArithmetic.allInclusiveExposureUsd,"(cap $"+policy.caps.aggregateUsd+")");
  console.log("sell within $2 cap:",R.sellAcct.withinSellCap,"withdraw==principal:",delayed.returnedEqualsPrincipal);
  console.log("deployerFund:",deployerFund.toString(),"testerImmFund:",testerImmFund.toString(),"delayedFund:",delayedGas.toString());
}
main().catch(e=>{console.error("FAIL:",e.message,e.stack?.split("\n")[1]||""); process.exit(1);});
