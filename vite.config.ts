import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

function stripLoopbackViteEnv(mode: string): Record<string, string> {
  if (mode !== "production" && mode !== "store") return {};
  const define: Record<string, string> = {};
  for (const key of ["VITE_API_URL", "VITE_WS_URL"] as const) {
    const value = (process.env[key] || "").trim();
    if (/127\.0\.0\.1|localhost/i.test(value)) {
      delete process.env[key];
      define[`import.meta.env.${key}`] = JSON.stringify("");
    }
  }
  return define;
}

export default defineConfig(({ mode }) => {
  const loopbackEnvDefine = stripLoopbackViteEnv(mode);
  return {
  define: loopbackEnvDefine,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  esbuild: { target: "esnext" },
  optimizeDeps: { esbuildOptions: { target: "esnext" } },
  build: {
    sourcemap: mode !== "production" && mode !== "store",
    target: "esnext",
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: mode === "production" || mode === "store",
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-ui": ["lucide-react", "clsx", "tailwind-merge"],
          "vendor-motion": ["framer-motion"],
          "vendor-state": ["zustand"],
        },
      },
    },
  },
  server: {
    host: true,
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_PROXY_TARGET || "http://127.0.0.1:8080",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            if ("writeHead" in res) {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error: "unavailable",
                  message: "API server is not running. Start it with npm run dev:server.",
                }),
              );
            }
          });
        },
      },
      "/env.js": {
        target: process.env.VITE_DEV_PROXY_TARGET || "http://127.0.0.1:8080",
        changeOrigin: true,
      },
      "/live": {
        target: process.env.VITE_DEV_PROXY_TARGET || "http://127.0.0.1:8080",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts", "server/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
    environmentMatchGlobs: [
      ["src/**/*.test.tsx", "jsdom"],
      ["src/lib/api.origin.test.ts", "jsdom"],
    ],
  },
};
});
