import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { nodePolyfills } from "vite-plugin-node-polyfills"

// @stellar/stellar-sdk needs Buffer/global in the browser. nodePolyfills supplies
// them. The SDK is dynamically imported (see src/lib/wallet.ts), so it stays out
// of the initial landing bundle — only loaded when the user connects a wallet.
export default defineConfig({
  plugins: [react(), nodePolyfills({ globals: { Buffer: true, global: true, process: true } })],
  server: { port: 5173 },
})
