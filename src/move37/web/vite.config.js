import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@move37/sdk": fileURLToPath(new URL("../sdk/node/src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/v1": {
        target: process.env.MOVE37_VITE_API_PROXY_TARGET || "http://localhost:18080",
        changeOrigin: true,
      },
      "/health": {
        target: process.env.MOVE37_VITE_API_PROXY_TARGET || "http://localhost:18080",
        changeOrigin: true,
      },
    },
  },
});
