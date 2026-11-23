import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import { AppHeader } from "@/components/app/bits";
import { ServiceWorkerRegister } from "@/components/app/sw-register";
import { Toaster } from "@/components/ui/sonner";
import { THEME_COLORS, THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Hanken_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Accountably",
  appleWebApp: { capable: true, title: "Accountably", statusBarStyle: "default" },
  description:
    "Lock in together. Set weekly goals with a few friends and see each other follow through.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Where supported, the page shrinks to make room for the keyboard instead
  // of being pushed up underneath it.
  interactiveWidget: "resizes-content",
  themeColor: THEME_COLORS.light,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script below sets a class on <html> before React loads, so the
    // server's markup and the browser's legitimately differ there.
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {/* One phone-width column, centred on larger screens. */}
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <AppHeader />
          {children}
        </div>
        <Toaster position="top-center" />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
