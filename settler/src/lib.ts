// Stelvin settler — shared library (chain helpers + tlock). Imported by both
// src/settler.ts (the e2e settler) and src/frontrunner-bot.ts (the M5 demo).

import { execSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { mainnetClient, timelockEncrypt, timelockDecrypt, defaultChainInfo } from "tlock-js"

export const NET = "testnet"
export const PRICE_SCALE = 10_000_000 // 1e7, matches the contract + Noether oracle's 7 decimals
export const CHAIN = defaultChainInfo.hash // quicknet (tlock-js 0.9 default)
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
export const ENVF = resolve(ROOT, ".stelvin", "testnet.env")
export const client = mainnetClient()
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type Order = { side: "Buy" | "Sell"; amount: number; limit_price: number }

// RWA framing: the base asset is a tokenized US T-bill (tUSTB), quote is USDC.
// RWA fair value ≈ NAV ≈ par ($1.00). `block` is the demo block-trade size, large
// enough that the on-chain venue fee is non-trivially visible. `feeBps` = 2 bps,
// matching CoW Protocol's volume fee for a stable/correlated pair (display-only
// NAV reference; the fee itself is real & on-chain — ADR-018).
export const RWA = { base: "tUSTB", quote: "USDC", nav: 1.0, block: 10_000, feeBps: 2 }

export function getFees(asset: string): number {
  return asInt(inv(E.GATE, "admin", `get_fees --asset ${asset}`))
}

export function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync(ENVF, "utf8").split("\n")) {
    const m = line.match(/^(\w+)=(.+)$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}
export const E = loadEnv()

// stellar CLI: result -> stdout, logs/events -> stderr (so 2>/dev/null = clean result).
export function inv(contract: string, source: string, args: string): string {
  const cmd = `stellar contract invoke --id ${contract} --source ${source} --network ${NET} -- ${args} 2>/dev/null`
  return execSync(cmd, { encoding: "utf8", maxBuffer: 1 << 24 }).trim()
}
const unquote = (s: string) => s.replace(/^"|"$/g, "")
export const asInt = (s: string) => parseInt(unquote(s).match(/-?\d+/)?.[0] ?? "NaN", 10)

export function relayLatestRound(): number {
  return parseInt(inv(E.RELAY, "admin", "latest").match(/\[(\d+)/)?.[1] ?? "NaN", 10)
}
export function relayGet(round: number): string | null {
  return inv(E.RELAY, "admin", `get --round ${round}`).match(/[0-9a-f]{64}/)?.[0] ?? null
}
export function getBalance(trader: string, asset: string): number {
  return asInt(inv(E.GATE, "admin", `get_balance --trader ${trader} --asset ${asset}`))
}
export function getOrderCiphertext(orderId: number): string {
  const out = inv(E.GATE, "admin", `get_order --order_id ${orderId}`)
  return JSON.parse(out.match(/\{.*\}/s)?.[0] ?? "{}").ciphertext as string
}
export function getBatch(batchId: number): { reveal_round: number; status: string; order_ids: number[] } | null {
  const out = inv(E.GATE, "admin", `get_batch --batch_id ${batchId}`)
  const m = out.match(/\{.*\}/s)
  if (!m) return null
  const j = JSON.parse(m[0])
  return {
    reveal_round: Number(j.reveal_round),
    status: String(j.status),
    order_ids: (j.order_ids ?? []).map(Number),
  }
}

export async function encryptOrder(R: number, o: Order): Promise<string> {
  const ct = await timelockEncrypt(R, Buffer.from(JSON.stringify(o)), client)
  return Buffer.from(ct, "utf8").toString("hex") // on-chain Bytes (hex)
}
export async function decryptHex(ctHex: string): Promise<Order> {
  const armored = Buffer.from(ctHex, "hex").toString("utf8")
  const pt = await timelockDecrypt(armored, client)
  return JSON.parse(pt.toString()) as Order
}
export async function fetchSigma(R: number): Promise<string> {
  const j = await (await fetch(`https://api.drand.sh/${CHAIN}/public/${R}`)).json()
  return j.signature as string // 48-byte compressed hex
}
export const sha256hex = (hex: string) => createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex")

// ── Noether SEP-40 oracle (ecosystem-fit, DISPLAY-ONLY, non-blocking) ────────
// Reads Noether's deployed on-chain Oracle Adapter (SCF #41 perp DEX) as a
// fair-value reference. Permissionless, no API key; `--send=no` = read-only
// simulation, no tx. This NEVER throws and NEVER affects settle — any failure
// (paused/stale/unreachable/parse) returns null and the demo continues.
export const NOETHER_ORACLE = "CBDH7R4PBFHMN4AER74O4RG7VHUWUMFI67UKDIY6ISNQP4H5KFKMSBS4"
export function readOracleFairValue(asset = "XLM"): { price: number; source: string; stale: boolean } | null {
  try {
    const out = execSync(
      `stellar contract invoke --id ${NOETHER_ORACLE} --source admin --network ${NET} --send=no -- get_price --asset ${asset} 2>/dev/null`,
      { encoding: "utf8", timeout: 20000 },
    )
    const m = out.match(/\{[^{}]*"price"[^{}]*\}/)
    if (!m) return null
    const d = JSON.parse(m[0])
    const price = Number(d.price) / PRICE_SCALE
    if (!Number.isFinite(price) || price <= 0) return null
    const age = Math.floor(Date.now() / 1000) - Number(d.timestamp)
    return { price, source: String(d.source), stale: age > 60 }
  } catch {
    return null
  }
}
