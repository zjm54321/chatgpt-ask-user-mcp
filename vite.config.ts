// SPDX-License-Identifier: GPL-3.0-only
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: "esbuild",
    lib: {
      entry: resolve(__dirname, "src/widget/index.tsx"),
      formats: ["es"],
      fileName: () => "widget.js"
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith(".css") ? "widget.css" : "[name]-[hash][extname]"
      }
    }
  }
});
