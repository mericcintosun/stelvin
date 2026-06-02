// Stelvin settler — shared library (chain helpers + tlock). Imported by both
// src/settler.ts (the e2e settler) and src/frontrunner-bot.ts (the M5 demo).

import { execSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { mainnetClient, timelockEncrypt, timelockDecrypt, defaultChainInfo } from "tlock-js"

export const NET = "testnet"
export const CHAIN = defaultChainInfo.hash // quicknet (tlock-js 0.9 default)
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
export const ENVF = resolve(ROOT, ".stelvin", "testnet.env")
export const client = mainnetClient()
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type Order = { side: "Buy" | "Sell"; amount: number; limit_price: number }

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
