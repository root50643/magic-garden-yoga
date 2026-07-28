import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Local development stays at `/`. The Pages workflow supplies
  // `/magic-garden-yoga/` through VITE_BASE_PATH for its production build.
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
  worker: {
    format: "es",
  },
});
