import type { Metadata } from "next";
import { Inter, Prompt } from "next/font/google";
import "../globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Build Your Van | Papago Vans",
  description:
    "Configure your custom Mercedes Sprinter camper conversion. Choose a floor plan, pick a build package, and get your Build Sheet.",
};

/* Google Tag Manager, Google's own install (owner 2026-10-05), the same
   container papagovans.com and go.papagovans.com carry. It runs only on
   build.papagovans.com, so preview deployments stay out of the live
   analytics and ad accounts. The snippet inside the check is Google's. */
const GTM_ID = "GTM-M2K8LFSC";
const gtm = `if (location.hostname === "build.papagovans.com") {
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');
}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${prompt.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: gtm }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <noscript>
          <iframe src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`} height="0" width="0" style={{ display: "none", visibility: "hidden" }} />
        </noscript>
        {children}
      </body>
    </html>
  );
}
