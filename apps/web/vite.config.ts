import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
      "/openapi": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
  optimizeDeps: {
    exclude: ["@leitura/common"],
  },
  build: {
    outDir: "dist",
  },
});