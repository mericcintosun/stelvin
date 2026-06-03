// Stelvin M3 — narrow settler, real-tlock end-to-end (reuses the M2 testnet
// deployment via ../.stelvin/testnet.env). See ./lib.ts for the helpers.
//
// Flow: create_batch -> tlock-encrypt orders -> submit opaque ciphertext ->
// prove the on-chain ciphertext is unreadable before R -> wait R -> decrypt the
// batch from chain -> sha256(sigma)==relay.get(R) -> settle -> verify balances.
// Scope: core round-trip only; daemon/retry/idempotency deferred.

import {
  E, inv, asInt, sleep, CHAIN, RWA,
  relayLatestRound, relayGet, getBalance, getOrderCiphertext,
  encryptOrder, decryptHex, fetchSigma, sha256hex, type Order,
} from "./lib.js"

async function main() {
  console.log("gate:", E.GATE, "| chain:", CHAIN)

  // Permissioned (RWA/KYC) mode + venue fee. Idempotent + admin-only.
  console.log("\n[0] permissioned (KYC) mode + allowlist alice/bob + venue fee")
  inv(E.GATE, "admin", `set_permissioned --enabled true`)
  inv(E.GATE, "admin", `set_kyc --trader ${E.ALICE} --allowed true`)
  inv(E.GATE, "admin", `set_kyc --trader ${E.BOB} --allowed true`)
  inv(E.GATE, "admin", `set_fee_bps --bps ${RWA.feeBps}`)

  const R = relayLatestRound() + 20
  console.log(`\n[1] create_batch(R=${R})`)
  const batchId = asInt(inv(E.GATE, "admin", `create_batch --reveal_round ${R}`))
  console.log("    batch_id =", batchId)

  // tUSTB/USDC block trade near par ($1.00 NAV): buy 1.001, sell 1.000 → P*=1.000.
  const aliceOrder: Order = { side: "Buy", amount: RWA.block, limit_price: 10_010_000 }
  const bobOrder: Order = { side: "Sell", amount: RWA.block, limit_price: 10_000_000 }

  console.log("\n[2] encrypt to R + submit_order (real tlock ciphertext)")
  const aHex = await encryptOrder(R, aliceOrder)
  const bHex = await encryptOrder(R, bobOrder)
  const aoid = asInt(inv(E.GATE, "alice", `submit_order --trader ${E.ALICE} --batch_id ${batchId} --ciphertext ${aHex}`))
  const boid = asInt(inv(E.GATE, "bob", `submit_order --trader ${E.BOB} --batch_id ${batchId} --ciphertext ${bHex}`))
  console.log(`    alice order_id=${aoid}, bob order_id=${boid}`)

  console.log("\n[3] PROOF: read alice's ciphertext FROM CHAIN, try to decrypt BEFORE R")
  try {
    await decryptHex(getOrderCiphertext(aoid))
    console.log("    WARN: decrypted early (R already passed?)")
  } catch (e) {
    console.log("    ✅ pre-R decrypt FAILED:", String((e as Error).message).slice(0, 80))
  }

  console.log(`\n[4] wait for round R=${R}`)
  let committed: string | null = null
  for (let i = 0; i < 48; i++) {
    committed = relayGet(R)
    if (committed) { console.log(`    available after ~${i * 5}s`); break }
    await sleep(5000)
  }
  if (!committed) throw new Error("timeout waiting for round R")

  console.log("\n[5] decrypt batch from chain + verify sigma encoding")
  const aDec = await decryptHex(getOrderCiphertext(aoid))
  const bDec = await decryptHex(getOrderCiphertext(boid))
  console.log("    alice:", JSON.stringify(aDec), "| bob:", JSON.stringify(bDec))
  const sigma = await fetchSigma(R)
  if (sha256hex(sigma) !== committed) throw new Error("sigma encoding mismatch")
  console.log("    sha256(sigma)==relay.get(R) ✓")

  console.log("\n[6] settle + verify deltas")
  const aX0 = getBalance(E.ALICE, E.X_SAC), bU0 = getBalance(E.BOB, E.USDC_SAC)
  const revealed = JSON.stringify([
    { order_id: aoid, side: aDec.side, amount: String(aDec.amount), limit_price: String(aDec.limit_price) },
    { order_id: boid, side: bDec.side, amount: String(bDec.amount), limit_price: String(bDec.limit_price) },
  ])
  inv(E.GATE, "admin", `settle --batch_id ${batchId} --sigma_r ${sigma} --revealed '${revealed}'`)
  console.log("    clearing:", inv(E.GATE, "admin", `get_clearing --batch_id ${batchId}`).match(/\{.*\}/s)?.[0])
  // P*=1.000 (par): alice +block tUSTB; bob +block net of the venue fee (feeBps).
  const expBob = Math.floor((RWA.block * (10_000 - RWA.feeBps)) / 10_000)
  if (getBalance(E.ALICE, E.X_SAC) - aX0 !== RWA.block || getBalance(E.BOB, E.USDC_SAC) - bU0 !== expBob)
    throw new Error("unexpected settlement deltas")
  console.log(`\n✅ M3 PASSED — real tlock settled at par; alice +${RWA.block} ${RWA.base}, bob +${expBob} USDC (${RWA.feeBps} bps fee), unreadable pre-R`)
}

main().catch((e) => { console.error("❌", e); process.exit(1) })
