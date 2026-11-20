import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ReqLab | API Request Testing Workspace",
    template: "%s | ReqLab",
  },
  description:
    "Build and send HTTP requests, configure query parameters, authorization, headers, and request bodies, then inspect API responses in a focused workspace.",
  applicationName: "ReqLab",
  keywords: [
    "API testing",
    "HTTP client",
    "API request builder",
    "REST API client",
    "JSON response viewer",
    "GET POST PUT DELETE",
  ],
  authors: [{ name: "Saniul Islam", url: "https://saniulislam.com" }],
  creator: "Saniul Islam",
  publisher: "Saniul Islam",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    title: "ReqLab | API Request Testing Workspace",
    description:
      "Build and send HTTP requests, then inspect API responses in a focused workspace.",
    siteName: "ReqLab",
  },
  twitter: {
    card: "summary",
    title: "ReqLab | API Request Testing Workspace",
    description:
      "Build and send HTTP requests, then inspect API responses in a focused workspace.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
