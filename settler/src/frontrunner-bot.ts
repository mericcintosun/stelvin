// Stelvin M5 — frontrunner-bot demo (CLI, two panels). RWA framing, feeder-resilient.
//
// LEFT  : a SIMULATED transparent AMM. Real constant-product sandwich, for contrast.
// RIGHT : Stelvin LIVE on testnet. An institutional tUSTB/USDC block trade. A bot
//         reads the ACTUAL on-chain ciphertext and really runs tlock decrypt — and
//         fails ("too early") until round R. Permissioned (KYC): un-KYC'd rejected.
//
// Feeder resilience (ADR-019): if drand's on-chain feeder skips the target round R,
// the demo detects it and auto-retries with a fresh batch (recorded fallback:
// demo/sample-run.txt).

import {
  E, inv, asInt, sleep, RWA,
  relayLatestRound, relayGet, getBalance, getOrderCiphertext, getFees,
  encryptOrder, decryptHex, fetchSigma, sha256hex, readOracleFairValue, type Order,
} from "./lib.js"

const _log = console.log.bind(console)
console.log = (...a: unknown[]) => {
  if (typeof a[0] === "string" && a[0].startsWith("beacon received")) return
  _log(...a)
}
const MAX_ATTEMPTS = 3
const usd = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 })
const hr = (c = "─") => console.log(c.repeat(64))

function transparentDexSandwich() {
  console.log("\n\x1b[1m▌ LEFT — Transparent DEX (SIMULATED constant-product AMM)\x1b[0m")
  hr()
  const out = (amtIn: number, rIn: number, rOut: number) => (amtIn * rOut) / (rIn + amtIn)
  const Rx = 10000, Ru = 10000
  const aliceUSDC = 1000, botUSDC = 2000
  console.log(`pool: ${Rx} ${RWA.base} / ${Ru} USDC (price 1.00)`)
  console.log(`a desk broadcasts: buy ${RWA.base} with ${aliceUSDC} USDC  →  visible on the transparent AMM, cleartext`)
  const xFair = out(aliceUSDC, Ru, Rx)
  console.log(`\n🤖 bot SEES the block order and sandwiches it:`)
  const xBot = out(botUSDC, Ru, Rx); const Ru1 = Ru + botUSDC, Rx1 = Rx - xBot
  console.log(`   1. front-run: bot buys ${usd(xBot)} ${RWA.base} with ${botUSDC} USDC → price pushed up`)
  const xAlice = out(aliceUSDC, Ru1, Rx1); const Ru2 = Ru1 + aliceUSDC, Rx2 = Rx1 - xAlice
  console.log(`   2. the desk fills at the WORSE price: gets ${usd(xAlice)} ${RWA.base} (fair was ${usd(xFair)})`)
  const usdcBack = out(xBot, Rx2, Ru2)
  console.log(`   3. back-run: bot sells ${usd(xBot)} ${RWA.base} → ${usd(usdcBack)} USDC`)
  console.log(`\n\x1b[31m   ✗ bot profit: +${usd(usdcBack - botUSDC)} USDC   ·   the desk lost ${usd(xFair - xAlice)} ${RWA.base} to the sandwich\x1b[0m`)
}

async function stelvinSealedBatch(): Promise<number> {
  console.log("\n\x1b[1m▌ RIGHT — Stelvin (LIVE on testnet, real tlock · permissioned RWA)\x1b[0m")
  hr()
  try {
    inv(E.GATE, "admin", `set_permissioned --enabled true`)
    inv(E.GATE, "admin", `set_kyc --trader ${E.ALICE} --allowed true`)
    inv(E.GATE, "admin", `set_kyc --trader ${E.BOB} --allowed true`)
    inv(E.GATE, "admin", `set_fee_bps --bps ${RWA.feeBps}`)
    console.log(`permissioned (KYC) mode ON · ${RWA.base}/USDC · alice + bob allowlisted · venue fee ${RWA.feeBps} bps`)
  } catch {
    console.log(`(gate not permissioned — legacy deploy; continuing open)`)
  }

  const alice: Order = { side: "Buy", amount: RWA.block, limit_price: 10_010_000 }
  const bob: Order = { side: "Sell", amount: RWA.block, limit_price: 10_000_000 }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const R = relayLatestRound() + 20
    const batchId = asInt(inv(E.GATE, "admin", `create_batch --reveal_round ${R}`))
    console.log(`\nbatch #${batchId} opens, reveals at drand round R=${R}${attempt > 1 ? ` (retry ${attempt}/${MAX_ATTEMPTS})` : ""}`)

    const aHex = await encryptOrder(R, alice)
    const bHex = await encryptOrder(R, bob)
    const aoid = asInt(inv(E.GATE, "alice", `submit_order --trader ${E.ALICE} --batch_id ${batchId} --ciphertext ${aHex}`))
    const boid = asInt(inv(E.GATE, "bob", `submit_order --trader ${E.BOB} --batch_id ${batchId} --ciphertext ${bHex}`))
    console.log(`alice + bob submit TIMELOCK-SEALED block orders (order_id ${aoid}, ${boid})`)

    if (E.MALLORY && attempt === 1) {
      let blocked = false
      try { inv(E.GATE, "mallory", `submit_order --trader ${E.MALLORY} --batch_id ${batchId} --ciphertext deadbeef`) } catch { blocked = true }
      console.log(blocked
        ? `\x1b[36m   ✓ un-KYC'd address rejected on-chain (permissioned RWA venue)\x1b[0m`
        : `   (mallory not configured / open mode)`)
    }

    console.log(`\n🤖 same bot, watching Stelvin — it pulls the order straight from chain:`)
    const onchain = getOrderCiphertext(aoid)
    console.log(`   on-chain ciphertext: ${onchain.slice(0, 48)}…  (${onchain.length / 2} bytes, opaque)`)

    let attempts = 0
    let skipped = false
    while (!relayGet(R)) {
      if (relayLatestRound() > R + 4) { skipped = true; break }
      try {
        await decryptHex(onchain)
      } catch (e) {
        attempts++
        const left = Math.max(0, R - relayLatestRound())
        console.log(`   bot attempt #${attempts}: tlock decrypt → \x1b[33m${String((e as Error).message).slice(0, 52)}…\x1b[0m (~${left * 3}s left)`)
      }
      await sleep(3000)
    }
    if (skipped) {
      console.log(`   \x1b[33m⚠ drand feeder skipped round ${R} — auto-retrying with a fresh batch\x1b[0m`)
      continue
    }
    const committed = relayGet(R)!

    console.log(`\n   round R reached — the beacon publishes; NOW anyone can decrypt.`)
    const aDec = await decryptHex(getOrderCiphertext(aoid))
    const bDec = await decryptHex(getOrderCiphertext(boid))
    const sigma = await fetchSigma(R)
    if (sha256hex(sigma) !== committed) throw new Error("sigma encoding mismatch")

    const aX0 = getBalance(E.ALICE, E.X_SAC), bU0 = getBalance(E.BOB, E.USDC_SAC)
    const feesBefore = getFees(E.USDC_SAC)
    const revealed = JSON.stringify([
      { order_id: aoid, side: aDec.side, amount: String(aDec.amount), limit_price: String(aDec.limit_price) },
      { order_id: boid, side: bDec.side, amount: String(bDec.amount), limit_price: String(bDec.limit_price) },
    ])
    inv(E.GATE, "admin", `settle --batch_id ${batchId} --sigma_r ${sigma} --revealed '${revealed}'`)
    const clearing = JSON.parse(inv(E.GATE, "admin", `get_clearing --batch_id ${batchId}`).match(/\{.*\}/s)![0])
    const aX1 = getBalance(E.ALICE, E.X_SAC), bU1 = getBalance(E.BOB, E.USDC_SAC)
    const feeQuote = getFees(E.USDC_SAC) - feesBefore

    const px = Number(clearing.price) / 1e7
    const navDev = (Math.abs(px - RWA.nav) / RWA.nav) * 100
    console.log(`   settled on-chain at a SINGLE uniform price P* = $${px.toFixed(3)} ${RWA.base}/USDC`)
    console.log(`   alice +${aX1 - aX0} ${RWA.base} · bob +${bU1 - bU0} USDC · everyone filled at the same price`)
    console.log(`   \x1b[32mcleared within ${navDev.toFixed(2)}% of NAV ($${RWA.nav.toFixed(2)} par) — fair, zero MEV\x1b[0m`)
    console.log(`   \x1b[36mvenue fee: ${feeQuote} USDC (${RWA.feeBps} bps) → protocol revenue (real, on-chain)\x1b[0m`)

    const fv = readOracleFairValue("XLM")
    if (fv) console.log(`   \x1b[36mNoether SEP-40 oracle live: $${fv.price.toFixed(4)} XLM (${fv.source}${fv.stale ? ", stale" : ""}) — composing with Stellar's oracle layer\x1b[0m`)
    else console.log(`   Noether oracle reference unavailable (non-blocking)`)

    console.log(`\n\x1b[32m   ✓ bot frontrun attempts: ${attempts} — all failed (order was unreadable until R)\x1b[0m`)
    return attempts
  }

  console.log(`\n\x1b[33m   drand feeder skipped ${MAX_ATTEMPTS} rounds — use the recorded run (demo/sample-run.txt).\x1b[0m`)
  return 0
}

async function main() {
  hr("═")
  console.log("\x1b[1m  STELVIN — fair execution venue for Stellar DeFi traders & RWA/institutional flows\x1b[0m")
  console.log("  Frontrunner showdown: transparent DEX vs sealed batch.")
  console.log("  Two layers: (1) timelock hides orders pre-reveal,")
  console.log("  (2) uniform-price batch clearing removes intra-batch ordering edge.")
  hr("═")
  transparentDexSandwich()
  const attempts = await stelvinSealedBatch()
  hr("═")
  console.log("\x1b[1m  VERDICT\x1b[0m")
  console.log("  Transparent DEX : block order visible → bot sandwiches → desk loses.")
  console.log(`  Stelvin         : order sealed → bot blind (${attempts} failed reads) → fair price at NAV.`)
  console.log("  MEV isn't promised away — it's cryptographically impossible to react to.")
  hr("═")
}

main().catch((e) => { console.error("❌", e); process.exit(1) })
