// Wallet + read-only chain access (Phase B, slice 1).
//
// Everything here pulls in @stellar/stellar-sdk + @stellar/freighter-api, which
// are heavy — so this module is ONLY ever loaded via dynamic import() (from the
// WalletPanel on click), keeping the SDK out of the landing bundle.
//
// Slice 1 is read-only: connect Freighter, then read the connected address's
// on-chain KYC status + standing balances via RPC simulation (no signing, no
// state change). Signing + self-submit is slice 2.

import { ADDRESSES, NETWORK } from "../data/content"

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
