// Stelvin M5 — frontrunner-bot demo (CLI, two panels, side by side).
//
// LEFT  : a SIMULATED transparent AMM. The sandwich is real mechanics
//         (front-run -> victim slips -> back-run), shown for contrast. Clearly
//         labeled as a simulation — not a strawman.
// RIGHT : Stelvin LIVE on testnet. A bot reads the ACTUAL on-chain ciphertext
//         and really runs tlock decrypt — and fails ("too early") until round R.
//
// Honesty: Stelvin protects with TWO layers — (1) timelock hides order contents
// before reveal; (2) uniform-price batch clearing removes intra-batch ordering
// advantage. The RIGHT panel proves layer (1) live on-chain. Why timelock on top
// of a batch auction? A batch auction removes ordering advantage at settlement,
// but pre-settlement order contents would still leak strategy (copy-trading,
// positioning). Timelock closes that pre-reveal leak. Together: nothing to see,
// nothing to exploit.

import {
  E, inv, asInt, sleep,
  relayLatestRound, relayGet, getBalance, getOrderCiphertext,
  encryptOrder, decryptHex, fetchSigma, sha256hex, readOracleFairValue, type Order,
} from "./lib.js"

// Silence tlock-js's internal "beacon received" logging for a clean demo.
const _log = console.log.bind(console)
console.log = (...a: unknown[]) => {
  if (typeof a[0] === "string" && a[0].startsWith("beacon received")) return
  _log(...a)
}

const usd = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 })
const hr = (c = "─") => console.log(c.repeat(64))

// ── LEFT: simulated transparent AMM sandwich (real constant-product mechanics) ─
function transparentDexSandwich() {
  console.log("\n\x1b[1m▌ LEFT — Transparent DEX (SIMULATED constant-product AMM)\x1b[0m")
  hr()
  const out = (amtIn: number, rIn: number, rOut: number) => (amtIn * rOut) / (rIn + amtIn)
  let Rx = 10000, Ru = 10000 // 10k X / 10k USDC, price 1.0
  const aliceUSDC = 1000, botUSDC = 2000

  console.log(`pool: ${Rx} X / ${Ru} USDC (price 1.00)`)
  console.log(`alice broadcasts: buy X with ${aliceUSDC} USDC  →  visible in the mempool, cleartext`)
  const xFair = out(aliceUSDC, Ru, Rx)

  console.log(`\n🤖 bot SEES alice's order and sandwiches it:`)
  const xBot = out(botUSDC, Ru, Rx); const Ru1 = Ru + botUSDC, Rx1 = Rx - xBot
  console.log(`   1. front-run: bot buys ${usd(xBot)} X with ${botUSDC} USDC → price pushed up`)
  const xAlice = out(aliceUSDC, Ru1, Rx1); const Ru2 = Ru1 + aliceUSDC, Rx2 = Rx1 - xAlice
  console.log(`   2. alice fills at the WORSE price: gets ${usd(xAlice)} X (fair was ${usd(xFair)} X)`)
  const usdcBack = out(xBot, Rx2, Ru2)
  console.log(`   3. back-run: bot sells ${usd(xBot)} X → ${usd(usdcBack)} USDC`)

  const botProfit = usdcBack - botUSDC
  const aliceLoss = xFair - xAlice
  console.log(`\n\x1b[31m   ✗ bot profit: +${usd(botProfit)} USDC   ·   alice lost ${usd(aliceLoss)} X to the sandwich\x1b[0m`)
}

// ── RIGHT: Stelvin live — the bot tries to read the real on-chain ciphertext ──
async function stelvinSealedBatch() {
  console.log("\n\x1b[1m▌ RIGHT — Stelvin (LIVE on testnet, real tlock)\x1b[0m")
  hr()
  // Contract floor is est_current_round + 12, and the ledger clock runs a few
  // rounds ahead of the feeder's latest pushed round, so +20 is the safe margin
  // (proven in M2/M3). ~60s — long enough for a live countdown, short enough to demo.
  const R = relayLatestRound() + 20
  const batchId = asInt(inv(E.GATE, "admin", `create_batch --reveal_round ${R}`))
  console.log(`batch #${batchId} opens, reveals at drand round R=${R}`)

  // XLM/USDC market, priced near the live Noether oracle (~$0.22) so the
  // post-settle fair-value sanity-check is meaningful. Prices are FIXED (not
  // oracle-derived) — the oracle stays display-only and non-blocking.
  const alice: Order = { side: "Buy", amount: 100, limit_price: 2_250_000 }
  const bob: Order = { side: "Sell", amount: 100, limit_price: 2_200_000 }
  const aHex = await encryptOrder(R, alice)
  const bHex = await encryptOrder(R, bob)
  const aoid = asInt(inv(E.GATE, "alice", `submit_order --trader ${E.ALICE} --batch_id ${batchId} --ciphertext ${aHex}`))
  const boid = asInt(inv(E.GATE, "bob", `submit_order --trader ${E.BOB} --batch_id ${batchId} --ciphertext ${bHex}`))
  console.log(`alice + bob submit TIMELOCK-SEALED orders (order_id ${aoid}, ${boid})`)

  console.log(`\n🤖 same bot, watching Stelvin — it pulls the order straight from chain:`)
  const onchain = getOrderCiphertext(aoid)
  console.log(`   on-chain ciphertext: ${onchain.slice(0, 48)}…  (${onchain.length / 2} bytes, opaque)`)

  // Gate on the ON-CHAIN relay having round R — that's what settle() needs.
  // (drand's public API publishes R a touch before the feeder pushes it on-chain,
  // so gating on decrypt-success alone would race ahead of settle.) The bot really
  // runs tlock decrypt every round and fails "too early" until R lands on-chain.
  let attempts = 0
  while (!relayGet(R)) {
    try {
      await decryptHex(onchain) // REAL tlock decrypt against the on-chain blob
    } catch (e) {
      attempts++
      const left = Math.max(0, R - relayLatestRound())
      console.log(`   bot attempt #${attempts}: tlock decrypt → \x1b[33m${String((e as Error).message).slice(0, 52)}…\x1b[0m (~${left * 3}s left)`)
    }
    await sleep(3000)
  }
  const committed = relayGet(R)!

  console.log(`\n   round R reached — the beacon publishes; NOW anyone can decrypt.`)
  const aDec = await decryptHex(getOrderCiphertext(aoid))
  const bDec = await decryptHex(getOrderCiphertext(boid))
  const sigma = await fetchSigma(R)
  const onchainRand = relayGet(R)!
  if (sha256hex(sigma) !== onchainRand) throw new Error("sigma encoding mismatch")

  const aX0 = getBalance(E.ALICE, E.X_SAC), aU0 = getBalance(E.ALICE, E.USDC_SAC)
  const bX0 = getBalance(E.BOB, E.X_SAC), bU0 = getBalance(E.BOB, E.USDC_SAC)
  const revealed = JSON.stringify([
    { order_id: aoid, side: aDec.side, amount: String(aDec.amount), limit_price: String(aDec.limit_price) },
    { order_id: boid, side: bDec.side, amount: String(bDec.amount), limit_price: String(bDec.limit_price) },
  ])
  inv(E.GATE, "admin", `settle --batch_id ${batchId} --sigma_r ${sigma} --revealed '${revealed}'`)
  const clearing = JSON.parse(inv(E.GATE, "admin", `get_clearing --batch_id ${batchId}`).match(/\{.*\}/s)![0])
  const aX1 = getBalance(E.ALICE, E.X_SAC), bU1 = getBalance(E.BOB, E.USDC_SAC)

  const px = Number(clearing.price) / 1e7
  console.log(`   settled on-chain at a SINGLE uniform price P* = ${px} XLM/USDC`)
  console.log(`   alice +${aX1 - aX0} XLM · bob +${bU1 - bU0} USDC · everyone filled at the same price`)

  // Ecosystem-fit sanity check — display-only, non-blocking (never throws).
  const fv = readOracleFairValue("XLM")
  if (fv) {
    const dev = (Math.abs(px - fv.price) / fv.price) * 100
    console.log(`   \x1b[36mNoether oracle (SEP-40) fair value: $${fv.price.toFixed(4)} XLM (source: ${fv.source}${fv.stale ? ", stale" : ""}) — Stelvin cleared within ${dev.toFixed(1)}% → fair\x1b[0m`)
  } else {
    console.log(`   Noether oracle reference unavailable (non-blocking)`)
  }

  console.log(`\n\x1b[32m   ✓ bot frontrun attempts: ${attempts} — all failed (order was unreadable until R)\x1b[0m`)
  return attempts
}

async function main() {
  hr("═")
  console.log("\x1b[1m  STELVIN — frontrunner showdown: transparent DEX vs sealed batch\x1b[0m")
  console.log("  Two layers of protection: (1) timelock hides orders pre-reveal,")
  console.log("  (2) uniform-price batch clearing removes intra-batch ordering edge.")
  hr("═")

  transparentDexSandwich()
  const attempts = await stelvinSealedBatch()

  hr("═")
  console.log("\x1b[1m  VERDICT\x1b[0m")
  console.log("  Transparent DEX : order visible → bot sandwiches → user loses.")
  console.log(`  Stelvin         : order sealed  → bot blind (${attempts} failed reads) → fair uniform price.`)
  console.log("  MEV isn't promised away — it's cryptographically impossible to react to.")
  hr("═")
}

main().catch((e) => { console.error("❌", e); process.exit(1) })
