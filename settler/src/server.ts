// Stelvin M4 Phase A — demo backend (RWA framing, feeder-resilient).
//
// Runs the SAME live flow as the CLI frontrunner-bot (real on-chain create/
// submit/decrypt/settle, real tlock) and streams it to the browser as
// Server-Sent Events. Scripted actors (funded admin/alice/bob/mallory keys).
//
// Feeder resilience (ADR-019): drand's on-chain feeder occasionally SKIPS the
// target round R (latest advances past R while get(R) stays null). The demo
// detects that, emits `feeder_skip`, and AUTO-RETRIES with a fresh batch — so a
// skipped round never surfaces as an error on stage. A recorded fallback run
// lives in demo/sample-run.txt.

import express from "express"
import {
  E, inv, asInt, sleep, RWA,
  relayLatestRound, relayGet, getBalance, getOrderCiphertext, getFees,
  encryptOrder, decryptHex, fetchSigma, sha256hex, readOracleFairValue, type Order,
} from "./lib.js"

const PORT = Number(process.env.PORT ?? 8787)
const MAX_ATTEMPTS = 3
const app = express()
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  next()
})

app.get("/api/health", (_req, res) => res.json({ ok: true, gate: E.GATE }))

// Demo desk onboarding (Phase B · slice 2a): allowlist a connected wallet address.
// DEMO ONLY — in production this is the RWA issuer / compliance role.
app.get("/api/kyc", (req, res) => {
  const address = String(req.query.address ?? "")
  if (!/^G[A-Z0-9]{55}$/.test(address)) return res.status(400).json({ ok: false, error: "invalid address" })
  try {
    inv(E.GATE, "admin", `set_kyc --trader ${address} --allowed true`)
    res.json({ ok: true })
  } catch (e) {
    res.json({ ok: false, error: String((e as Error).message) })
  }
})

app.get("/api/demo", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.flushHeaders()
  const emit = (type: string, data: Record<string, unknown> = {}) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)

  try {
    // ── LEFT: transparent AMM sandwich (real constant-product mechanics) ──
    const out = (a: number, ri: number, ro: number) => (a * ro) / (ri + a)
    const Rx = 10000, Ru = 10000, aliceUSDC = 1000, botUSDC = 2000
    emit("left_init", { rx: Rx, ru: Ru, aliceUSDC, botUSDC })
    const xFair = out(aliceUSDC, Ru, Rx)
    const xBot = out(botUSDC, Ru, Rx); const Ru1 = Ru + botUSDC, Rx1 = Rx - xBot
    const xAlice = out(aliceUSDC, Ru1, Rx1); const Ru2 = Ru1 + aliceUSDC, Rx2 = Rx1 - xAlice
    const usdcBack = out(xBot, Rx2, Ru2)
    emit("left_result", {
      xFair: +xFair.toFixed(2), xBot: +xBot.toFixed(2), xAlice: +xAlice.toFixed(2),
      usdcBack: +usdcBack.toFixed(2),
      botProfit: +(usdcBack - botUSDC).toFixed(2), aliceLoss: +(xFair - xAlice).toFixed(2),
    })

    // ── RIGHT: Stelvin live. Permissioned (RWA/KYC) + venue fee, idempotent. ──
    try {
      inv(E.GATE, "admin", `set_permissioned --enabled true`)
      inv(E.GATE, "admin", `set_kyc --trader ${E.ALICE} --allowed true`)
      inv(E.GATE, "admin", `set_kyc --trader ${E.BOB} --allowed true`)
      inv(E.GATE, "admin", `set_fee_bps --bps ${RWA.feeBps}`)
      emit("kyc", { permissioned: true, base: RWA.base, quote: RWA.quote, feeBps: RWA.feeBps })
    } catch {
      emit("kyc", { permissioned: false, note: "gate not permissioned (legacy deploy)" })
    }

    const alice: Order = { side: "Buy", amount: RWA.block, limit_price: 10_010_000 } // 1.001
    const bob: Order = { side: "Sell", amount: RWA.block, limit_price: 10_000_000 } // 1.000

    let settledOk = false
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !settledOk; attempt++) {
      const R = relayLatestRound() + 20
      const batchId = asInt(inv(E.GATE, "admin", `create_batch --reveal_round ${R}`))
      emit("batch_opened", { batchId, R, attempt })

      const aHex = await encryptOrder(R, alice)
      const bHex = await encryptOrder(R, bob)
      const aoid = asInt(inv(E.GATE, "alice", `submit_order --trader ${E.ALICE} --batch_id ${batchId} --ciphertext ${aHex}`))
      const boid = asInt(inv(E.GATE, "bob", `submit_order --trader ${E.BOB} --batch_id ${batchId} --ciphertext ${bHex}`))
      const onchain = getOrderCiphertext(aoid)
      emit("orders_submitted", { aoid, boid, ciphertext: onchain.slice(0, 64), bytes: onchain.length / 2 })

      // RWA gate proof: an un-KYC'd address (mallory) is rejected on-chain (once).
      if (E.MALLORY && attempt === 1) {
        let blocked = false
        try { inv(E.GATE, "mallory", `submit_order --trader ${E.MALLORY} --batch_id ${batchId} --ciphertext deadbeef`) } catch { blocked = true }
        emit("kyc_reject", { blocked })
      }

      // Bot runs real tlock decrypt each round until R lands on-chain — OR the
      // feeder skips R (latest passes it without storing it), which we detect.
      let attempts = 0
      let skipped = false
      while (!relayGet(R)) {
        if (relayLatestRound() > R + 4) { skipped = true; break }
        try {
          await decryptHex(onchain)
        } catch (e) {
          attempts++
          emit("bot_attempt", {
            n: attempts,
            message: String((e as Error).message).slice(0, 80),
            secondsLeft: Math.max(0, R - relayLatestRound()) * 3,
          })
        }
        await sleep(3000)
      }
      if (skipped) {
        emit("feeder_skip", { R, attempt, remaining: MAX_ATTEMPTS - attempt })
        continue // fresh batch + round
      }

      const committed = relayGet(R)!
      emit("reveal", { R })

      const aDec = await decryptHex(getOrderCiphertext(aoid))
      const bDec = await decryptHex(getOrderCiphertext(boid))
      const sigma = await fetchSigma(R)
      if (sha256hex(sigma) !== committed) throw new Error("sigma encoding mismatch")
      emit("decrypted", { alice: aDec, bob: bDec })

      const aX0 = getBalance(E.ALICE, E.X_SAC), bU0 = getBalance(E.BOB, E.USDC_SAC)
      const feesBefore = getFees(E.USDC_SAC)
      const revealed = JSON.stringify([
        { order_id: aoid, side: aDec.side, amount: String(aDec.amount), limit_price: String(aDec.limit_price) },
        { order_id: boid, side: bDec.side, amount: String(bDec.amount), limit_price: String(bDec.limit_price) },
      ])
      inv(E.GATE, "admin", `settle --batch_id ${batchId} --sigma_r ${sigma} --revealed '${revealed}'`)
      const clearing = JSON.parse(inv(E.GATE, "admin", `get_clearing --batch_id ${batchId}`).match(/\{.*\}/s)![0])
      const px = Number(clearing.price) / 1e7
      const navDeviationPct = +((Math.abs(px - RWA.nav) / RWA.nav) * 100).toFixed(2)
      const feeQuote = getFees(E.USDC_SAC) - feesBefore // real on-chain venue fee
      emit("settled", {
        price: px, base: RWA.base, nav: RWA.nav, navDeviationPct,
        matched: Number(clearing.matched_volume),
        aliceGainBase: getBalance(E.ALICE, E.X_SAC) - aX0,
        bobGainUsdc: getBalance(E.BOB, E.USDC_SAC) - bU0,
        feeQuote, feeBps: RWA.feeBps, frontrunAttempts: attempts, batchId,
      })

      // Ecosystem composition: Noether SEP-40 oracle live read (non-blocking).
      const fv = readOracleFairValue("XLM")
      emit("oracle", fv ? { price: fv.price, source: fv.source, stale: fv.stale } : { unavailable: true })
      settledOk = true
    }

    if (!settledOk) {
      emit("feeder_exhausted", { attempts: MAX_ATTEMPTS })
    }
    emit("done")
  } catch (e) {
    emit("error", { message: String((e as Error).message) })
  } finally {
    res.end()
  }
})

app.listen(PORT, () => console.log(`Stelvin demo backend on http://localhost:${PORT}  (gate ${E.GATE})`))
