import type { Metadata, Viewport } from "next";
import { DM_Sans, Sora, Geist_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const sora = Sora({ variable: "--font-sora", subsets: ["latin"] });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.biendecider.com"),
  title: "BienDecider",
  description: "Vous décidez. Votre activité avance. Votre équipe IA prépare diagnostic, plan d'action et contenus. Vous gardez le dernier mot.",
  applicationName: "BienDecider",
  icons: { icon: "/brand/symbol.svg", apple: "/brand/apple-touch-icon.png" },
  openGraph: {
    title: "BienDecider",
    description: "Vous décidez. Votre activité avance. Votre équipe IA, avec votre validation à chaque étape.",
    siteName: "BienDecider",
    locale: "fr_FR",
    type: "website",
  },
};

// Le clavier virtuel réduit la page plutôt que de la recouvrir (Android) : la conversation avec Paul reste au-dessus du clavier.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${dmSans.variable} ${sora.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
