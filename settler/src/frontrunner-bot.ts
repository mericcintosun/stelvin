// Stelvin M5 — frontrunner-bot demo (CLI, two panels, side by side). RWA framing.
//
// LEFT  : a SIMULATED transparent AMM. The sandwich is real mechanics
//         (front-run -> victim slips -> back-run), shown for contrast. Clearly
//         labeled as a simulation — not a strawman.
// RIGHT : Stelvin LIVE on testnet. An institutional tUSTB/USDC block trade. A bot
//         reads the ACTUAL on-chain ciphertext and really runs tlock decrypt —
//         and fails ("too early") until round R. The contract runs in
//         permissioned (KYC) mode: an un-KYC'd address is rejected on-chain.
//
// Honesty: Stelvin protects with TWO layers — (1) timelock hides order contents
// before reveal; (2) uniform-price batch clearing removes intra-batch ordering
// advantage. The RIGHT panel proves layer (1) live on-chain. The RWA gate
// (permissioned KYC) makes the institutional/RWA framing real, not cosmetic.

import {
  E, inv, asInt, sleep, RWA,
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
  let Rx = 10000, Ru = 10000 // 10k base / 10k USDC, price 1.0
  const aliceUSDC = 1000, botUSDC = 2000

  console.log(`pool: ${Rx} ${RWA.base} / ${Ru} USDC (price 1.00)`)
  console.log(`a desk broadcasts: buy ${RWA.base} with ${aliceUSDC} USDC  →  visible in the mempool, cleartext`)
  const xFair = out(aliceUSDC, Ru, Rx)

  console.log(`\n🤖 bot SEES the block order and sandwiches it:`)
  const xBot = out(botUSDC, Ru, Rx); const Ru1 = Ru + botUSDC, Rx1 = Rx - xBot
  console.log(`   1. front-run: bot buys ${usd(xBot)} ${RWA.base} with ${botUSDC} USDC → price pushed up`)
  const xAlice = out(aliceUSDC, Ru1, Rx1); const Ru2 = Ru1 + aliceUSDC, Rx2 = Rx1 - xAlice
  console.log(`   2. the desk fills at the WORSE price: gets ${usd(xAlice)} ${RWA.base} (fair was ${usd(xFair)})`)
  const usdcBack = out(xBot, Rx2, Ru2)
  console.log(`   3. back-run: bot sells ${usd(xBot)} ${RWA.base} → ${usd(usdcBack)} USDC`)

  const botProfit = usdcBack - botUSDC
  const aliceLoss = xFair - xAlice
  console.log(`\n\x1b[31m   ✗ bot profit: +${usd(botProfit)} USDC   ·   the desk lost ${usd(aliceLoss)} ${RWA.base} to the sandwich\x1b[0m`)
}

// ── RIGHT: Stelvin live — an institutional RWA block trade, sealed ──
async function stelvinSealedBatch() {
  console.log("\n\x1b[1m▌ RIGHT — Stelvin (LIVE on testnet, real tlock · permissioned RWA)\x1b[0m")
  hr()

  // Permissioned (RWA/KYC) mode: allowlist the institutional desks. Idempotent +
  // admin-only, so the demo is self-contained against any deploy.
  try {
    inv(E.GATE, "admin", `set_permissioned --enabled true`)
    inv(E.GATE, "admin", `set_kyc --trader ${E.ALICE} --allowed true`)
    inv(E.GATE, "admin", `set_kyc --trader ${E.BOB} --allowed true`)
    console.log(`permissioned (KYC) mode ON · ${RWA.base}/USDC · alice + bob allowlisted`)
  } catch {
    console.log(`(gate not permissioned — legacy deploy; continuing open)`)
  }

  // Contract floor is est_current_round + 12, and the ledger clock runs a few
  // rounds ahead of the feeder, so +20 is the safe margin (proven in M2/M3).
  const R = relayLatestRound() + 20
  const batchId = asInt(inv(E.GATE, "admin", `create_batch --reveal_round ${R}`))
  console.log(`batch #${batchId} opens, reveals at drand round R=${R}`)

  // tUSTB/USDC block trade priced near par ($1.00 NAV). Prices are FIXED (not
  // oracle-derived) — NAV and the Noether oracle stay display-only references.
  const alice: Order = { side: "Buy", amount: 100, limit_price: 10_010_000 }  // 1.001
  const bob: Order = { side: "Sell", amount: 100, limit_price: 10_000_000 }   // 1.000
  const aHex = await encryptOrder(R, alice)
  const bHex = await encryptOrder(R, bob)
  const aoid = asInt(inv(E.GATE, "alice", `submit_order --trader ${E.ALICE} --batch_id ${batchId} --ciphertext ${aHex}`))
  const boid = asInt(inv(E.GATE, "bob", `submit_order --trader ${E.BOB} --batch_id ${batchId} --ciphertext ${bHex}`))
  console.log(`alice + bob submit TIMELOCK-SEALED block orders (order_id ${aoid}, ${boid})`)

  // RWA gate proof: an un-KYC'd address (mallory) is rejected on-chain.
  if (E.MALLORY) {
    let blocked = false
    try {
      inv(E.GATE, "mallory", `submit_order --trader ${E.MALLORY} --batch_id ${batchId} --ciphertext deadbeef`)
    } catch {
      blocked = true
    }
    console.log(
      blocked
        ? `\x1b[36m   ✓ un-KYC'd address rejected on-chain (permissioned RWA venue)\x1b[0m`
        : `   (mallory not configured / open mode — KYC gate not exercised)`,
    )
  }

  console.log(`\n🤖 same bot, watching Stelvin — it pulls the order straight from chain:`)
  const onchain = getOrderCiphertext(aoid)
  console.log(`   on-chain ciphertext: ${onchain.slice(0, 48)}…  (${onchain.length / 2} bytes, opaque)`)

  // Gate on the ON-CHAIN relay having round R — that's what settle() needs.
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
  if (sha256hex(sigma) !== committed) throw new Error("sigma encoding mismatch")

  const aX0 = getBalance(E.ALICE, E.X_SAC), bU0 = getBalance(E.BOB, E.USDC_SAC)
  const revealed = JSON.stringify([
    { order_id: aoid, side: aDec.side, amount: String(aDec.amount), limit_price: String(aDec.limit_price) },
    { order_id: boid, side: bDec.side, amount: String(bDec.amount), limit_price: String(bDec.limit_price) },
  ])
  inv(E.GATE, "admin", `settle --batch_id ${batchId} --sigma_r ${sigma} --revealed '${revealed}'`)
  const clearing = JSON.parse(inv(E.GATE, "admin", `get_clearing --batch_id ${batchId}`).match(/\{.*\}/s)![0])
  const aX1 = getBalance(E.ALICE, E.X_SAC), bU1 = getBalance(E.BOB, E.USDC_SAC)

  const px = Number(clearing.price) / 1e7
  const navDev = (Math.abs(px - RWA.nav) / RWA.nav) * 100
  console.log(`   settled on-chain at a SINGLE uniform price P* = $${px.toFixed(3)} ${RWA.base}/USDC`)
  console.log(`   alice +${aX1 - aX0} ${RWA.base} · bob +${bU1 - bU0} USDC · everyone filled at the same price`)
  console.log(`   \x1b[32mcleared within ${navDev.toFixed(2)}% of NAV ($${RWA.nav.toFixed(2)} par) — fair, zero MEV\x1b[0m`)

  // Ecosystem composition — Noether SEP-40 oracle live read (display-only, non-blocking).
  const fv = readOracleFairValue("XLM")
  if (fv) {
    console.log(`   \x1b[36mNoether SEP-40 oracle live: $${fv.price.toFixed(4)} XLM (source: ${fv.source}${fv.stale ? ", stale" : ""}) — composing with Stellar's oracle layer\x1b[0m`)
  } else {
    console.log(`   Noether oracle reference unavailable (non-blocking)`)
  }

  console.log(`\n\x1b[32m   ✓ bot frontrun attempts: ${attempts} — all failed (order was unreadable until R)\x1b[0m`)
  return attempts
}

async function main() {
  hr("═")
  console.log("\x1b[1m  STELVIN — fair execution venue for tokenized RWAs & institutional flows\x1b[0m")
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
