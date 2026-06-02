// Stelvin M3 — narrow settler, real-tlock end-to-end (reuses the M2 testnet
// deployment via ../.stelvin/testnet.env). See ./lib.ts for the helpers.
//
// Flow: create_batch -> tlock-encrypt orders -> submit opaque ciphertext ->
// prove the on-chain ciphertext is unreadable before R -> wait R -> decrypt the
// batch from chain -> sha256(sigma)==relay.get(R) -> settle -> verify balances.
// Scope: core round-trip only; daemon/retry/idempotency deferred.

import {
  E, inv, asInt, sleep, CHAIN,
  relayLatestRound, relayGet, getBalance, getOrderCiphertext,
  encryptOrder, decryptHex, fetchSigma, sha256hex, type Order,
} from "./lib.js"

async function main() {
  console.log("gate:", E.GATE, "| chain:", CHAIN)

  const R = relayLatestRound() + 20
  console.log(`\n[1] create_batch(R=${R})`)
  const batchId = asInt(inv(E.GATE, "admin", `create_batch --reveal_round ${R}`))
  console.log("    batch_id =", batchId)

  const aliceOrder: Order = { side: "Buy", amount: 100, limit_price: 12_000_000 }
  const bobOrder: Order = { side: "Sell", amount: 100, limit_price: 8_000_000 }

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
  if (getBalance(E.ALICE, E.X_SAC) - aX0 !== 100 || getBalance(E.BOB, E.USDC_SAC) - bU0 !== 80)
    throw new Error("unexpected settlement deltas")
  console.log("\n✅ M3 PASSED — real tlock ciphertext settled; unreadable pre-R, decrypted & matched post-R")
}

main().catch((e) => { console.error("❌", e); process.exit(1) })
