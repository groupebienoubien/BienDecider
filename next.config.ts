import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Développement seulement : la barre du parcours occupe le bas de l'écran sur téléphone (charte, section 2).
  devIndicators: { position: "top-left" },
};

export default nextConfig;
