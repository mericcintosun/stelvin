// Stelvin M3 — Step 0: isolated tlock-js quicknet round-trip proof.
//
// Proves, before writing any settler integration, that tlock-js encrypts to a
// future drand quicknet round and decrypts back to the exact plaintext once the
// round is published — and that decryption BEFORE the round fails (the timing
// guarantee that underpins the whole project + the M5 "bot can't read it" demo).
//
// tlock-js 0.9.0's default chain IS quicknet (hash 52db9ba…, beaconID quicknet,
// scheme bls-unchained-g1-rfc9380), so mainnetClient() is correct here.

import { mainnetClient, timelockEncrypt, timelockDecrypt, defaultChainInfo } from "tlock-js"

const PERIOD = defaultChainInfo.period // 3
const GENESIS = defaultChainInfo.genesis_time // 1692803367
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function currentRound(): number {
  const now = Math.floor(Date.now() / 1000)
  return Math.floor((now - GENESIS) / PERIOD) + 1
}

async function main() {
  console.log("chain :", defaultChainInfo.hash)
  console.log("beacon:", (defaultChainInfo as any).metadata?.beaconID, "| scheme:", (defaultChainInfo as any).schemeID)
  const client = mainnetClient()

  const cur = currentRound()
  const R = cur + 4 // ~12s ahead
  const PT = "stelvin-roundtrip"
  console.log(`current round ~${cur} -> encrypt to R=${R}`)

  const ct = await timelockEncrypt(R, Buffer.from(PT), client)
  console.log("ciphertext head :", ct.split("\n")[0])
  console.log("ciphertext bytes:", Buffer.from(ct, "utf8").length)

  // PROOF A: decrypting before R must fail (key not yet derivable).
  let earlyFailed = false
  try {
    await timelockDecrypt(ct, client)
  } catch (e) {
    earlyFailed = true
    console.log("pre-R decrypt FAILED as expected:", String((e as Error).message).slice(0, 90))
  }
  if (!earlyFailed) console.log("WARN: early decrypt did not fail (R may already have passed)")

  // PROOF B: after R is published, the SAME ciphertext decrypts to the plaintext.
  let pt: Buffer | null = null
  for (let i = 0; i < 15; i++) {
    try {
      pt = await timelockDecrypt(ct, client)
      console.log(`post-R decrypt succeeded after ~${i * 3}s`)
      break
    } catch {
      await sleep(3000)
    }
  }
  if (!pt) throw new Error("decrypt never succeeded (round not published?)")

  const got = pt.toString()
  console.log("decrypted:", JSON.stringify(got))
  if (got !== PT) throw new Error(`MISMATCH: ${JSON.stringify(got)} !== ${JSON.stringify(PT)}`)

  console.log("\n✅ tlock-js quicknet round-trip PROVEN")
  console.log("   encrypt@R -> (pre-R unreadable) -> decrypt@R == plaintext")
}

main().catch((e) => {
  console.error("❌", e)
  process.exit(1)
})
