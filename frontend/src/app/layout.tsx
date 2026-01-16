import type { Metadata } from "next";
import { Inter, Fira_Code } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const firaCode = Fira_Code({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HAL - Local AI System",
  description: "Multi-user local AI system with RAG, memory, and sub-agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${firaCode.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
