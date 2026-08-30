import type { Metadata } from "next";
import { headers } from "next/headers";
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

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  const title = "Goldie Listing Factory";
  const description = "Batch-create unpublished Printify product drafts from finished designs and a saved product template.";
  return {
    metadataBase: new URL(origin),
    title,
    description,
    icons: { icon: "/goldie-g.png", shortcut: "/goldie-g.png" },
    openGraph: { title, description },
    twitter: { card: "summary", title, description },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const diagnostics = `(function(){function send(kind,message,source,line,column,stack){try{navigator.sendBeacon('/api/client-errors',new Blob([JSON.stringify({kind:kind,message:String(message||'Unknown browser startup error'),source:String(source||''),line:Number(line||0),column:Number(column||0),url:String(location.pathname+location.search),stack:String(stack||'')})],{type:'application/json'}))}catch(_){}}window.addEventListener('error',function(event){send('error',event.message,event.filename,event.lineno,event.colno,event.error&&event.error.stack)});window.addEventListener('unhandledrejection',function(event){var reason=event.reason;send('unhandledrejection',reason&&reason.message?reason.message:String(reason||'Unhandled promise rejection'),'','','',reason&&reason.stack)})})();`;
  return <html lang="en"><head><script dangerouslySetInnerHTML={{__html:diagnostics}}/></head><body><ReliableNavigation/>{children}<ConfirmHost/><NewBuildNotice/></body></html>;
}
