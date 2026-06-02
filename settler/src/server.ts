// Stelvin M4 Phase A — demo backend (RWA framing).
//
// Runs the SAME live flow as the CLI frontrunner-bot (real on-chain create/
// submit/decrypt/settle, real tlock) and streams it to the browser as
// Server-Sent Events. Scripted actors (the funded admin/alice/bob/mallory keys)
// — no browser wallet. tlock decrypt happens here (server-side). Reuses ./lib.ts.
//
// RWA pivot: the traded asset is a tokenized US T-bill (tUSTB) vs USDC, an
// institutional block trade. The contract runs in permissioned (KYC) mode —
// alice & bob are allowlisted; an un-KYC'd address (mallory) is rejected on-chain.

import express from "express"
import {
  E, inv, asInt, sleep, RWA,
  relayLatestRound, relayGet, getBalance, getOrderCiphertext,
  encryptOrder, decryptHex, fetchSigma, sha256hex, readOracleFairValue, type Order,
} from "./lib.js"

const PORT = Number(process.env.PORT ?? 8787)
const app = express()
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  next()
})

app.get("/api/health", (_req, res) => res.json({ ok: true, gate: E.GATE }))

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

    // ── RIGHT: Stelvin live on testnet ──
    // Permissioned (RWA/KYC) mode: allowlist the institutional desks (alice/bob).
    // Idempotent + admin-only, so the demo is self-contained against any deploy.
    try {
      inv(E.GATE, "admin", `set_permissioned --enabled true`)
      inv(E.GATE, "admin", `set_kyc --trader ${E.ALICE} --allowed true`)
      inv(E.GATE, "admin", `set_kyc --trader ${E.BOB} --allowed true`)
      emit("kyc", { permissioned: true, base: RWA.base, quote: RWA.quote })
    } catch (e) {
      emit("kyc", { permissioned: false, note: "gate not permissioned (legacy deploy)" })
    }

    const R = relayLatestRound() + 20
    const batchId = asInt(inv(E.GATE, "admin", `create_batch --reveal_round ${R}`))
    emit("batch_opened", { batchId, R })

    // tUSTB/USDC block trade, priced near par ($1.00 = NAV). Fixed prices — NAV
    // and the Noether oracle stay display-only references, never feed settle.
    const alice: Order = { side: "Buy", amount: 100, limit_price: 10_010_000 }  // 1.001
    const bob: Order = { side: "Sell", amount: 100, limit_price: 10_000_000 }   // 1.000
    const aHex = await encryptOrder(R, alice)
    const bHex = await encryptOrder(R, bob)
    const aoid = asInt(inv(E.GATE, "alice", `submit_order --trader ${E.ALICE} --batch_id ${batchId} --ciphertext ${aHex}`))
    const boid = asInt(inv(E.GATE, "bob", `submit_order --trader ${E.BOB} --batch_id ${batchId} --ciphertext ${bHex}`))
    const onchain = getOrderCiphertext(aoid)
    emit("orders_submitted", { aoid, boid, ciphertext: onchain.slice(0, 64), bytes: onchain.length / 2 })

    // RWA gate proof: an un-KYC'd address (mallory) is rejected on-chain.
    if (E.MALLORY) {
      let blocked = false
      try {
        inv(E.GATE, "mallory", `submit_order --trader ${E.MALLORY} --batch_id ${batchId} --ciphertext deadbeef`)
      } catch {
        blocked = true
      }
      emit("kyc_reject", { blocked })
    }

    // Bot really runs tlock decrypt each round until R lands on-chain.
    let attempts = 0
    while (!relayGet(R)) {
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
    const committed = relayGet(R)!
    emit("reveal", { R })

    const aDec = await decryptHex(getOrderCiphertext(aoid))
    const bDec = await decryptHex(getOrderCiphertext(boid))
    const sigma = await fetchSigma(R)
    if (sha256hex(sigma) !== committed) throw new Error("sigma encoding mismatch")
    emit("decrypted", { alice: aDec, bob: bDec })

    const aX0 = getBalance(E.ALICE, E.X_SAC), bU0 = getBalance(E.BOB, E.USDC_SAC)
    const revealed = JSON.stringify([
      { order_id: aoid, side: aDec.side, amount: String(aDec.amount), limit_price: String(aDec.limit_price) },
      { order_id: boid, side: bDec.side, amount: String(bDec.amount), limit_price: String(bDec.limit_price) },
    ])
    inv(E.GATE, "admin", `settle --batch_id ${batchId} --sigma_r ${sigma} --revealed '${revealed}'`)
    const clearing = JSON.parse(inv(E.GATE, "admin", `get_clearing --batch_id ${batchId}`).match(/\{.*\}/s)![0])
    const px = Number(clearing.price) / 1e7
    const navDeviationPct = +((Math.abs(px - RWA.nav) / RWA.nav) * 100).toFixed(2)
    emit("settled", {
      price: px,
      base: RWA.base,
      nav: RWA.nav,
      navDeviationPct,
      matched: Number(clearing.matched_volume),
      aliceGainBase: getBalance(E.ALICE, E.X_SAC) - aX0,
      bobGainUsdc: getBalance(E.BOB, E.USDC_SAC) - bU0,
      frontrunAttempts: attempts,
    })

    // Ecosystem composition: Noether SEP-40 oracle live read (non-blocking).
    // Shown as proof of composing with Stellar's oracle layer — the RWA fair
    // value above is NAV/par, not this liquid-pair price, so no deviation claim.
    const fv = readOracleFairValue("XLM")
    emit("oracle", fv ? { price: fv.price, source: fv.source, stale: fv.stale } : { unavailable: true })

    emit("done")
  } catch (e) {
    emit("error", { message: String((e as Error).message) })
  } finally {
    res.end()
  }
})

app.listen(PORT, () => console.log(`Stelvin demo backend on http://localhost:${PORT}  (gate ${E.GATE})`))
