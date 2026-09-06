import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// IBM Plex ist für technische und industrielle Kontexte gezeichnet: offene
// Punzen, ruhige Ziffern, eine echte Tabellenziffernvariante. Der Mono-Schnitt
// bleibt Kennungen vorbehalten – Auftrags- und Rechnungsnummern, die man
// vorliest oder abtippt.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Klarwerk – Digitaler Mitarbeiter für Handwerksbetriebe",
    template: "%s – Klarwerk",
  },
  description:
    "Klarwerk liest eingehende Anfragen, versteht sie, bereitet Aufträge, Termine und Antworten vor und reduziert Büroarbeit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
