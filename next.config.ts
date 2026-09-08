import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // O limite por omissão são 1 MB, insuficiente para fotografias de
      // faturas. 4 MB fica abaixo do teto de 4,5 MB que a Vercel impõe ao
      // corpo dos pedidos — as imagens são na mesma comprimidas no browser
      // antes do envio, isto é apenas a rede de segurança.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
