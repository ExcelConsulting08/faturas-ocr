import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  // React vem do consumidor: incluí-lo aqui daria duas cópias em memória.
  external: ["react", "react-dom"],
  // O CSS é gerado à parte pelo Tailwind (ver script build:css).
  publicDir: false,
});
