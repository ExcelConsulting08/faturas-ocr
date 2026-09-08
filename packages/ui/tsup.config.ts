import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  // React vem do consumidor: incluí-lo aqui daria duas cópias em memória.
  external: ["react", "react-dom"],
  // Os tokens acompanham o build para quem consome o kit sem Tailwind próprio.
  publicDir: false,
  onSuccess: "node scripts/copy-tokens.mjs",
});
