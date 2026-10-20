import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Développement seulement : l'indicateur Next recouvrait la barre du parcours en bas d'écran sur téléphone
  // (charte, section 2). Les erreurs de compilation et d'exécution restent affichées.
  devIndicators: false,
};

export default nextConfig;
