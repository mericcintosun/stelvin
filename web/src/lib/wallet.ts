// Wallet + read-only chain access (Phase B, slice 1).
//
// Everything here pulls in @stellar/stellar-sdk + @stellar/freighter-api, which
// are heavy — so this module is ONLY ever loaded via dynamic import() (from the
// WalletPanel on click), keeping the SDK out of the landing bundle.
//
// Slice 1 is read-only: connect Freighter, then read the connected address's
// on-chain KYC status + standing balances via RPC simulation (no signing, no
// state change). Signing + self-submit is slice 2.

import { ADDRESSES, NETWORK, RWA } from "../data/content"

export type AccountStatus = {
  permissioned: boolean
  kyc: boolean
  tustb: number
  usdc: number
}

// ── Freighter connect (freighter-api v6: each call resolves to an object that
//    may carry an `error` string) ──
export async function connectFreighter(): Promise<string> {
  const api = await import("@stellar/freighter-api")
  const conn = await api.isConnected()
  if ("error" in conn && conn.error) throw new Error(String(conn.error))
  if (!("isConnected" in conn) || !conn.isConnected) {
    throw new Error("Freighter not detected — install the extension and reload")
  }
  const access = await api.requestAccess()
  if ("error" in access && access.error) throw new Error(String(access.error))
  if (!access.address) throw new Error("no address returned from Freighter")
  return access.address
}

// ── Read-only contract views via RPC simulation ──
// A read-only simulate needs only a syntactically valid source account; it does
// not need to exist on-chain, so we wrap the address in `Account(addr, "0")`
// instead of fetching its sequence.
async function simRead(method: string, args: unknown[], sourceAddr: string): Promise<unknown> {
  const sdk = await import("@stellar/stellar-sdk")
  const { rpc, Contract, TransactionBuilder, BASE_FEE, Account, Address, scValToNative } = sdk
  const server = new rpc.Server(NETWORK.rpc)
  const src = new Account(sourceAddr, "0")
  const scArgs = args.map((a) => new Address(a as string).toScVal())
  const tx = new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: NETWORK.passphrase })
    .addOperation(new Contract(ADDRESSES.batchGate).call(method, ...scArgs))
    .setTimeout(30)
    .build()
  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) throw new Error(`simulation failed: ${sim.error}`)
  if (!sim.result) throw new Error("no simulation result")
  return scValToNative(sim.result.retval)
}

export async function readAccountStatus(address: string): Promise<AccountStatus> {
  const [permissioned, kyc, tustb, usdc] = await Promise.all([
    simRead("get_permissioned", [], address) as Promise<boolean>,
    simRead("is_kyc", [address], address) as Promise<boolean>,
    simRead("get_balance", [address, ADDRESSES.tustbSac], address) as Promise<bigint>,
    simRead("get_balance", [address, ADDRESSES.usdcSac], address) as Promise<bigint>,
  ])
  return {
    permissioned: Boolean(permissioned),
    kyc: Boolean(kyc),
    tustb: Number(tustb ?? 0),
    usdc: Number(usdc ?? 0),
  }
}

// ─────────────────────── Write path (Phase B slice 2) ───────────────────────
// build → simulate → assemble → Freighter sign → submit → poll. The connected
// desk is the tx SOURCE, so the contract's `require_auth` (and the SAC transfer's
// `from.require_auth`) are satisfied by the source-account signature — no separate
// auth-entry signing needed. sendTransaction returns PENDING; we poll to SUCCESS.

async function freighterSign(xdrStr: string, address: string): Promise<string> {
  const api = await import("@stellar/freighter-api")
  const signed = await api.signTransaction(xdrStr, { networkPassphrase: NETWORK.passphrase, address })
  if (signed && typeof signed === "object" && "error" in signed && signed.error) throw new Error(String(signed.error))
  const x = (signed as { signedTxXdr?: string }).signedTxXdr
  if (!x) throw new Error("Freighter returned no signed transaction")
  return x
}

async function submitSigned(signedXdr: string): Promise<string> {
  const { rpc, TransactionBuilder } = await import("@stellar/stellar-sdk")
  const server = new rpc.Server(NETWORK.rpc)
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK.passphrase)
  const sent = await server.sendTransaction(tx)
  if (sent.status === "ERROR") throw new Error(`send failed: ${JSON.stringify(sent.errorResult ?? sent.status)}`)
  let got = await server.getTransaction(sent.hash)
  for (let i = 0; i < 30 && got.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    got = await server.getTransaction(sent.hash)
  }
  if (got.status !== "SUCCESS") throw new Error(`transaction ${got.status}`)
  return sent.hash
}

async function invokeGate(method: string, scArgs: unknown[], address: string): Promise<string> {
  const sdk = await import("@stellar/stellar-sdk")
  const { rpc, Contract, TransactionBuilder, BASE_FEE } = sdk
  const server = new rpc.Server(NETWORK.rpc)
  const account = await server.getAccount(address)
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK.passphrase })
    .addOperation(new Contract(ADDRESSES.batchGate).call(method, ...(scArgs as Parameters<InstanceType<typeof Contract>["call"]>[1][])))
    .setTimeout(120)
    .build()
  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) throw new Error(`simulation failed: ${sim.error}`)
  const prepared = rpc.assembleTransaction(tx, sim).build()
  const signed = await freighterSign(prepared.toXDR(), address)
  return submitSigned(signed)
}

/** Deposit `amount` (atomic) of `asset` into the standing balance. */
export async function deposit(address: string, asset: string, amount: number): Promise<string> {
  const { Address, nativeToScVal } = await import("@stellar/stellar-sdk")
  return invokeGate(
    "deposit_funds",
    [new Address(address).toScVal(), new Address(asset).toScVal(), nativeToScVal(BigInt(amount), { type: "i128" })],
    address,
  )
}

/** Withdraw `amount` (atomic) of `asset` from the standing balance. */
export async function withdraw(address: string, asset: string, amount: number): Promise<string> {
  const { Address, nativeToScVal } = await import("@stellar/stellar-sdk")
  return invokeGate(
    "withdraw",
    [new Address(address).toScVal(), new Address(asset).toScVal(), nativeToScVal(BigInt(amount), { type: "i128" })],
    address,
  )
}

export type SealOrder = { side: "Buy" | "Sell"; amount: number; limit_price: number }

/** tlock-encrypt the order to round R client-side, then submit the opaque
 *  ciphertext on-chain — the desk seals its own order; no one (us included) can
 *  read it until R. Encoding matches the settler (on-chain Bytes = UTF-8 of the
 *  age-armored ciphertext). */
export async function submitSealedOrder(
  address: string,
  batchId: number,
  revealRound: number,
  order: SealOrder,
): Promise<string> {
  const { Address, nativeToScVal } = await import("@stellar/stellar-sdk")
  const tl = await import("tlock-js")
  const armored = await tl.timelockEncrypt(revealRound, Buffer.from(JSON.stringify(order)), tl.mainnetClient())
  const bytes = Buffer.from(armored, "utf8")
  return invokeGate(
    "submit_order",
    [new Address(address).toScVal(), nativeToScVal(batchId, { type: "u32" }), nativeToScVal(bytes, { type: "bytes" })],
    address,
  )
}

/** Classic trustlines for the test assets, so the demo faucet can mint to a
 *  fresh desk. Signed by the desk via Freighter. */
export async function establishTrustlines(address: string): Promise<string> {
  const { rpc, Asset, Operation, TransactionBuilder, BASE_FEE } = await import("@stellar/stellar-sdk")
  const server = new rpc.Server(NETWORK.rpc)
  const account = await server.getAccount(address)
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK.passphrase })
    .addOperation(Operation.changeTrust({ asset: new Asset(RWA.base, ADDRESSES.assetIssuer) }))
    .addOperation(Operation.changeTrust({ asset: new Asset(RWA.quote, ADDRESSES.assetIssuer) }))
    .setTimeout(120)
    .build()
  return submitSigned(await freighterSign(tx.toXDR(), address))
}
