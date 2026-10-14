import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Cloudflare plugin runs the Worker (worker/index.ts) and a local D1 database
// inside `npm run dev`, so the whole app works on your laptop with one command.
export default defineConfig({
  plugins: [react(), cloudflare()],
});
