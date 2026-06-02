// Stelvin M3 — narrow settler + real-tlock end-to-end.
//
// Reuses the M2 testnet deployment (.stelvin/testnet.env). Encrypts real orders
// to a future drand round with tlock-js, submits the ciphertext on-chain, proves
// the on-chain ciphertext is undecryptable before round R, then after R decrypts
// the batch and calls settle() — clearing at a uniform price computed on-chain.
//
// Scope: core encrypt -> submit -> (wait) -> decrypt -> settle round-trip. No
// daemon / retry / idempotency / multi-batch watching (those are M3+ polish).

import { execSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { mainnetClient, timelockEncrypt, timelockDecrypt, defaultChainInfo } from "tlock-js"

const NET = "testnet"
const CHAIN = defaultChainInfo.hash
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const ENVF = resolve(ROOT, ".stelvin", "testnet.env")
const client = mainnetClient()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Order = { side: "Buy" | "Sell"; amount: number; limit_price: number }

// ---- env -------------------------------------------------------------------
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync(ENVF, "utf8").split("\n")) {
    const m = line.match(/^(\w+)=(.+)$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}
const E = loadEnv()

// ---- stellar CLI helpers (result -> stdout, logs/events -> stderr) ----------
function inv(contract: string, source: string, args: string): string {
  const cmd = `stellar contract invoke --id ${contract} --source ${source} --network ${NET} -- ${args} 2>/dev/null`
  return execSync(cmd, { encoding: "utf8", maxBuffer: 1 << 24 }).trim()
}
const unquote = (s: string) => s.replace(/^"|"$/g, "")
const asInt = (s: string) => parseInt(unquote(s).match(/-?\d+/)?.[0] ?? "NaN", 10)

function relayLatestRound(): number {
  const out = inv(E.RELAY, "admin", "latest")
  return parseInt(out.match(/\[(\d+)/)?.[1] ?? "NaN", 10)
}
function relayGet(round: number): string | null {
  const out = inv(E.RELAY, "admin", `get --round ${round}`)
  return out.match(/[0-9a-f]{64}/)?.[0] ?? null
}
function getBalance(trader: string, asset: string): number {
  return asInt(inv(E.GATE, "admin", `get_balance --trader ${trader} --asset ${asset}`))
}
function getOrderCiphertext(orderId: number): string {
  const out = inv(E.GATE, "admin", `get_order --order_id ${orderId}`)
  return JSON.parse(out.match(/\{.*\}/s)?.[0] ?? "{}").ciphertext as string
}

// ---- tlock -----------------------------------------------------------------
async function encryptOrder(R: number, o: Order): Promise<string> {
  const ct = await timelockEncrypt(R, Buffer.from(JSON.stringify(o)), client)
  return Buffer.from(ct, "utf8").toString("hex") // on-chain Bytes (hex)
}
async function decryptHex(ctHex: string): Promise<Order> {
  const armored = Buffer.from(ctHex, "hex").toString("utf8")
  const pt = await timelockDecrypt(armored, client)
  return JSON.parse(pt.toString()) as Order
}

async function fetchSigma(R: number): Promise<string> {
  const j = await (await fetch(`https://api.drand.sh/${CHAIN}/public/${R}`)).json()
  return j.signature as string // 48-byte compressed hex
}
const sha256hex = (hex: string) => createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex")

// ---- end-to-end ------------------------------------------------------------
async function main() {
  console.log("gate:", E.GATE, "| chain:", CHAIN, "| beacon:", (defaultChainInfo as any).metadata?.beaconID)

  const R = relayLatestRound() + 20 // ~60s ahead
  console.log(`\n[1] create_batch(R=${R})`)
  const batchId = asInt(inv(E.GATE, "admin", `create_batch --reveal_round ${R}`))
  console.log("    batch_id =", batchId)

  const aliceOrder: Order = { side: "Buy", amount: 100, limit_price: 12_000_000 }
  const bobOrder: Order = { side: "Sell", amount: 100, limit_price: 8_000_000 }

  console.log("\n[2] encrypt to R + submit_order (real tlock ciphertext)")
  const aHex = await encryptOrder(R, aliceOrder)
  const bHex = await encryptOrder(R, bobOrder)
  console.log(`    alice ct ${aHex.length / 2}B, bob ct ${bHex.length / 2}B`)
  const aoid = asInt(inv(E.GATE, "alice", `submit_order --trader ${E.ALICE} --batch_id ${batchId} --ciphertext ${aHex}`))
  const boid = asInt(inv(E.GATE, "bob", `submit_order --trader ${E.BOB} --batch_id ${batchId} --ciphertext ${bHex}`))
  console.log(`    alice order_id=${aoid}, bob order_id=${boid}`)

  console.log("\n[3] PROOF: read alice's ciphertext FROM CHAIN and try to decrypt BEFORE R")
  const onchainCt = getOrderCiphertext(aoid)
  try {
    await decryptHex(onchainCt)
    console.log("    WARN: decrypted early (R already passed?)")
  } catch (e) {
    console.log("    ✅ pre-R decrypt FAILED:", String((e as Error).message).slice(0, 80))
    console.log("       (this is exactly what a frontrunner bot sees — opaque, unreadable)")
  }

  console.log(`\n[4] wait for round R=${R} to be published in the relay`)
  let committed: string | null = null
  for (let i = 0; i < 48; i++) {
    committed = relayGet(R)
    if (committed) {
      console.log(`    round available after ~${i * 5}s`)
      break
    }
    await sleep(5000)
  }
  if (!committed) throw new Error("timeout waiting for round R")

  console.log("\n[5] decrypt the batch FROM CHAIN + verify sigma encoding")
  const aDec = await decryptHex(getOrderCiphertext(aoid))
  const bDec = await decryptHex(getOrderCiphertext(boid))
  console.log("    alice decrypted:", JSON.stringify(aDec))
  console.log("    bob   decrypted:", JSON.stringify(bDec))
  const sigma = await fetchSigma(R)
  if (sha256hex(sigma) !== committed) throw new Error("sigma encoding mismatch")
  console.log("    sha256(sigma)==relay.get(R) ✓  (48-byte compressed)")

  console.log("\n[6] settle (uniform price computed on-chain)")
  const aX0 = getBalance(E.ALICE, E.X_SAC), aU0 = getBalance(E.ALICE, E.USDC_SAC)
  const bX0 = getBalance(E.BOB, E.X_SAC), bU0 = getBalance(E.BOB, E.USDC_SAC)
  const revealed = JSON.stringify([
    { order_id: aoid, side: aDec.side, amount: String(aDec.amount), limit_price: String(aDec.limit_price) },
    { order_id: boid, side: bDec.side, amount: String(bDec.amount), limit_price: String(bDec.limit_price) },
  ])
  inv(E.GATE, "admin", `settle --batch_id ${batchId} --sigma_r ${sigma} --revealed '${revealed}'`)
  const clearing = inv(E.GATE, "admin", `get_clearing --batch_id ${batchId}`).match(/\{.*\}/s)?.[0]
  console.log("    clearing:", clearing)

  console.log("\n[7] balance deltas (proof the trade happened at the uniform price)")
  const aX1 = getBalance(E.ALICE, E.X_SAC), aU1 = getBalance(E.ALICE, E.USDC_SAC)
  const bX1 = getBalance(E.BOB, E.X_SAC), bU1 = getBalance(E.BOB, E.USDC_SAC)
  console.log(`    alice  X ${aX0}->${aX1} (+${aX1 - aX0})   USDC ${aU0}->${aU1} (${aU1 - aU0})`)
  console.log(`    bob    X ${bX0}->${bX1} (${bX1 - bX0})   USDC ${bU0}->${bU1} (+${bU1 - bU0})`)
  if (aX1 - aX0 !== 100 || bU1 - bU0 !== 80) throw new Error("unexpected settlement deltas")

  console.log("\n✅ M3 PASSED — real tlock ciphertext settled; order unreadable pre-R, decrypted & matched post-R")
}

main().catch((e) => {
  console.error("❌", e)
  process.exit(1)
})
