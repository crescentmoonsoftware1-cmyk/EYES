





import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import SmoothScroll from "@/components/SmoothScroll";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "EYES - Everything You Ever Said",
  description: "Your digital memory dashboard. Monitor, audit, and explore everything across your connected platforms.",
  keywords: ["digital memory", "reputation monitoring", "audit", "privacy"],
  verification: {
    google: 'Uk096nnnTBgf1xGTAbnaRkvN90RjJrVd7HekhqyNTHU',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=DM+Mono:wght@300;400;500&family=Outfit:wght@300;400;500;600;700&family=Syne:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <Script id="theme-script" strategy="beforeInteractive">
          {`
            (function() {
              try {
                const savedTheme = localStorage.getItem('eyes-theme');
                if (savedTheme) {
                  document.documentElement.setAttribute('data-theme', savedTheme);
                }
              } catch (e) {}
            })();
          `}
        </Script>
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

