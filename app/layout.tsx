import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/manrope";
import "@fontsource/dm-serif-display";
/* D528 - ConfirmHost was mounted inside the Listing Factory only, so on Batch
   History, Keyword Banks and the Mockup Library confirmAction returned a promise
   that never settled: no dialog, no action, no error. Delete 20 batches did
   nothing at all. Verified on the live page - the click registered, no dialog
   appeared, and all 20 batches were still there. One host, at the root. */
import ConfirmHost from "./confirm-dialog";
import NewBuildNotice from "./new-build-notice";
import "./globals.css";
import "./factory-navigation.css";
import "./theme.css";
import "./lilac-theme.css";
import "./approved-functional.css";
import "./management-aesthetic.css";
import "./clarity-pass.css"
import "./interface-v2.css";
import ReliableNavigation from "./reliable-navigation";
import MobileShell from "./mobile-shell";
import "./mobile-shell.css";
import "./suite-redesign.css";
import "./approved-redesign-components.css";
import "./production-repair.css";
import "./command-workspace.css";
import "./suite-shell-2026.css";
import "./command-design-system.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  /*
    NO PRODUCT NAME, BECAUSE THERE IS NOT ONE YET.

    This said "Goldie Listing Factory", then "Goldie". The umbrella product
    name has not been chosen, and a tab title is exactly the kind of place a
    temporary stand-in quietly becomes permanent — so it says what the
    software does rather than what it is called.

    Individual pages set their own titles from their own feature names, which
    is what a member actually sees almost all of the time; this is only the
    fallback. Replace it, and NEUTRAL_FALLBACK_TITLE, when the name exists.
  */
  const title = "Goldie Suite";
  const description = "Etsy seller tools: bulk listing creation, market evidence, "
    + "your own shop's numbers, and a trademark check before you print.";
  return {
    metadataBase: new URL(origin),
    title: { default: title, template: `%s | ${title}` },
    description,
    openGraph: { title, description },
    twitter: { card: "summary", title, description },
  };
}

/*
  viewport-fit=cover is what lets the app paint into the notch and the home
  indicator area instead of sitting inside two grey bars. It only works if the
  layout then respects the safe-area insets, which mobile-shell.css does.
*/
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c0a0e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const diagnostics = `(function(){function send(kind,message,source,line,column,stack){try{navigator.sendBeacon('/api/client-errors',new Blob([JSON.stringify({kind:kind,message:String(message||'Unknown browser startup error'),source:String(source||''),line:Number(line||0),column:Number(column||0),url:String(location.pathname+location.search),stack:String(stack||'')})],{type:'application/json'}))}catch(_){}}window.addEventListener('error',function(event){send('error',event.message,event.filename,event.lineno,event.colno,event.error&&event.error.stack)});window.addEventListener('unhandledrejection',function(event){var reason=event.reason;send('unhandledrejection',reason&&reason.message?reason.message:String(reason||'Unhandled promise rejection'),'','','',reason&&reason.stack)})})();`;
  return <html lang="en"><head>
    {/* Keep install metadata in the actual head. The runtime streams generated
        link metadata into a body div, where Chrome ignores the manifest. */}
    <link rel="manifest" href="/manifest.webmanifest"/>
    <link rel="icon" href="/goldie-g.png"/>
    <link rel="apple-touch-icon" href="/apple-touch-icon.png"/>
    <meta name="mobile-web-app-capable" content="yes"/>
    <meta name="apple-mobile-web-app-capable" content="yes"/>
    <meta name="apple-mobile-web-app-title" content="Goldie Suite"/>
    <meta name="apple-mobile-web-app-status-bar-style" content="black"/>
    <script dangerouslySetInnerHTML={{__html:diagnostics}}/>
  </head><body><ReliableNavigation/>{children}<MobileShell/><ConfirmHost/><NewBuildNotice/></body></html>;
}
