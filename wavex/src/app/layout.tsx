import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Navbar from "@/components/Navbar";
import { AppProvider } from "@/contexts/AppContext";
import { ConversationProvider } from "@/providers/ConversationProvider";
import FloatingWidget from "@/components/FloatingWidget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wavex",
  description: "Live Translation App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ConversationProvider>
          <AppProvider>
            <Header/>
            <Navbar/>
            {children}
            <FloatingWidget />
          </AppProvider>
        </ConversationProvider>
      </body>
    </html>
  );
}
