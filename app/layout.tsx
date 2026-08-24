import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { CampaignModal } from "@/components/site/campaign-modal";
import { SupportChat } from "@/components/site/support-chat";
import { jsonLdHtml } from "@/lib/json-ld";
import { getCampaigns } from "@/lib/products/queries";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "Sunspark Electrical and Solar",
    template: "%s | Sunspark Electrical and Solar"
  },
  description: "Shop electricals, electronics, and solar products in Nairobi with Sunspark Electrical and Solar.",
  keywords: [
    "electrical shop Nairobi",
    "electricals Nairobi CBD",
    "Duruma Road electricals",
    "cables Nairobi",
    "breakers switches sockets Kenya",
    "solar accessories Nairobi",
    "Sunspark Electrical and Solar"
  ],
  alternates: {
    canonical: siteConfig.url
  },
  openGraph: {
    title: "Sunspark Electrical and Solar",
    description: "Electricals, electronics, and solar products in Nairobi.",
    url: siteConfig.url,
    siteName: "Sunspark Electrical and Solar",
    images: [{ url: "/logo.jpg", width: 1200, height: 630 }]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/logo.jpg"
  }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const campaigns = await getCampaigns();
  const businessSchema = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: siteConfig.name,
    url: siteConfig.url,
    image: `${siteConfig.url}/logo.jpg`,
    telephone: siteConfig.phone,
    email: siteConfig.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: "Duruma Road, Downtown Tower, second floor, shop number 8",
      addressLocality: "Nairobi",
      addressCountry: "KE"
    },
    sameAs: [siteConfig.facebookUrl]
  };
  return (
    <html className={montserrat.variable} lang="en">
      <body>
        <script
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(businessSchema) }}
          type="application/ld+json"
        />
        <Header />
        <main>{children}</main>
        <Footer />
        <CampaignModal campaigns={campaigns} />
        <SupportChat />
      </body>
    </html>
  );
}
