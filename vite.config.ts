/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Three pages: the notch, Settings and command bar windows.
  build: {
    rollupOptions: {
      input: {
        notch: fileURLToPath(new URL("./index.html", import.meta.url)),
        settings: fileURLToPath(new URL("./settings.html", import.meta.url)),
        commandBar: fileURLToPath(new URL("./command-bar.html", import.meta.url)),
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    // 3. tell Vite to ignore watching `src-tauri`
    watch: { ignored: ["**/src-tauri/**"] },
  },

  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // The first test of a file pays for importing Radix/Tailwind components (several seconds on this machine),
    // and SettingsApp pulls in the most — it has timed out at 15s under load, taking 20.5s.
    //
    // Note for whoever reads a run summary: this machine intermittently fails to spawn a worker
    // ("spawn EPERM", one file dropped). Vitest reports it as `Errors 1 error` and a non-zero exit, but the
    // "Tests N passed" line still looks green — so check the exit code, not just that line.
    testTimeout: 30_000,
  },
}));
