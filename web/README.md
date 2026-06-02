# Stelvin web — frontrunner showdown (M4 Phase A)

A browser version of the [`npm run demo`](../settler) CLI: two live panels that
make the value visible for the demo video.

- **LEFT** — a *simulated* transparent AMM where a bot sandwiches a visible order
  (real constant-product mechanics; bot profits, victim loses).
- **RIGHT** — **Stelvin live on testnet**: the same bot pulls the actual on-chain
  ciphertext and the server really runs `tlock` decrypt, failing *"too early"* with
  a live countdown until the drand beacon publishes round R, then the batch settles
  at one uniform price.

**Phase A = visual only (no wallet).** Scripted actors (the funded admin/alice/bob
keys) drive the chain via a thin backend that reuses the settler's
[`lib.ts`](../settler/src/lib.ts) and streams progress over Server-Sent Events.
tlock decryption runs server-side, so the frontend needs no crypto bundling.
Wallet-connect + interactive deposit/submit (and passkey) are Phase B.

## Run

Two processes (the frontend talks to the backend on `:8787`):

```sh
# 1) backend (reuses the M2 deployment in ../.stelvin/testnet.env)
cd settler && npm install && npm run server

# 2) frontend
cd web && npm install && npm run dev   # http://localhost:5173
```

Click **run live demo**. A run takes ~60–90s (it waits for the real drand round R).
The backend is the same logic as the CLI demo, so `demo/sample-run.txt` is a valid
backup clip if the feeder ever lags during a live pitch.
