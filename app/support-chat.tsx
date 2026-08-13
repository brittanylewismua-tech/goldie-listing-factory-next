"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { supportResponse, SupportTurn } from "./support-engine";

const SUGGESTIONS = ["A design failed", "Printify won’t connect", "My template won’t load", "My image won’t upload"];
const WELCOME: SupportTurn = { role:"support", text:"Hi 👋 I’m here to help with the Goldie Listing Factory. Tell me what happened or paste the error message you’re seeing, and we’ll work through it together." };

function initialMessages() {
  if (typeof window === "undefined") return [WELCOME];
  try {
    const parsed = JSON.parse(sessionStorage.getItem("goldie-listing-support-v2") ?? "[]") as SupportTurn[];
    return Array.isArray(parsed) && parsed.length ? parsed.slice(-30) : [WELCOME];
  } catch { return [WELCOME]; }
}

function SupportText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((part, index) => part.startsWith("**") ? <b key={index}>{part.slice(2, -2)}</b> : part)}</>;
}

export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat"|"contact">("chat");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<SupportTurn[]>(initialMessages);
  const [suggestions, setSuggestions] = useState(SUGGESTIONS);
  const [email, setEmail] = useState("");
  const [issue, setIssue] = useState("");
  const [screenshot, setScreenshot] = useState<File|null>(null);
  const [contactStatus, setContactStatus] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const answer = useCallback((value: string) => {
    const clean = value.trim();
    if (!clean) return;
    const response = supportResponse(clean, messages);
    setSuggestions(response.suggestions ?? []);
    setMessages([...messages, { role:"user", text:clean }, { role:"support", text:response.text, articleId:response.articleId }]);
    setQuery("");
  }, [messages]);

  useEffect(() => {
    try { sessionStorage.setItem("goldie-listing-support-v2", JSON.stringify(messages.slice(-30))); }
    catch { /* Conversation memory is optional when browser storage is blocked. */ }
  }, [messages]);

  useEffect(() => {
    const openWithError = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setOpen(true);
      setView("chat");
      if (detail) answer(detail);
    };
    window.addEventListener("goldie-support", openWithError);
    return () => window.removeEventListener("goldie-support", openWithError);
  }, [answer]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, open]);

  function submit(event: FormEvent) { event.preventDefault(); answer(query); }

  async function sendContact(event: FormEvent) {
    event.preventDefault();
    setContactStatus("");
    if (!/^\S+@\S+\.\S+$/.test(email)) { setContactStatus("Enter a valid email address."); return; }
    if (issue.trim().length < 5) { setContactStatus("Tell us what happened so we can help."); return; }
    if (screenshot && screenshot.size > 5 * 1024 * 1024) { setContactStatus("The optional screenshot must be 5 MB or smaller."); return; }
    setSending(true);
    try {
      const form = new FormData();
      form.append("email", email);
      form.append("message", issue.trim());
      form.append("page", window.location.href);
      form.append("conversation", messages.map((message) => `${message.role === "user" ? "Member" : "Goldie Support"}: ${message.text}`).join("\n\n"));
      if (screenshot) form.append("attachment", screenshot, screenshot.name);
      const response = await fetch("/api/support", { method:"POST", body:form });
      const result = await response.json() as { sent?:boolean; error?:string };
      if (!response.ok || !result.sent) throw new Error(result.error || "Message failed");
      setContactStatus("Sent. We’ll reply to the email you provided.");
      setIssue("");
      setScreenshot(null);
    } catch { setContactStatus("That message did not send. Email goldie@beawolfbiz.com directly."); }
    finally { setSending(false); }
  }

  return <div className="support-root">
    <button className="support-launcher" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="support-panel" aria-label="Open Goldie support"><span>G</span></button>
    {open && <section className="support-panel" id="support-panel" aria-label="Goldie support assistant">
      <header><nav><button className={view === "chat" ? "active" : ""} onClick={() => setView("chat")}>Chat</button><button className={view === "contact" ? "active" : ""} onClick={() => setView("contact")}>Contact Support</button></nav><button className="support-close" onClick={() => setOpen(false)} aria-label="Close support">×</button></header>
      {view === "chat" ? <>
        <div className="support-messages" aria-live="polite">{messages.map((message, index) => <div className={`support-message ${message.role}`} key={index}><SupportText text={message.text}/></div>)}{suggestions.length > 0 && <div className="support-suggestions">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => answer(suggestion)}>{suggestion}</button>)}</div>}<div ref={endRef}/></div>
        <form className="support-chat-form" onSubmit={submit}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask about an error or problem" aria-label="Support message"/><button disabled={!query.trim()} aria-label="Send">→</button></form>
      </> : <form className="support-contact-form" onSubmit={sendContact}>
        <p>Need a human? Tell us what happened and we’ll email you back as soon as we can.</p>
        <label htmlFor="support-email">Email address *</label><input id="support-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@email.com"/>
        <label htmlFor="support-issue">What happened? *</label><textarea id="support-issue" rows={6} value={issue} onChange={(event) => setIssue(event.target.value)} placeholder="Include the error message or what you expected to happen."/>
        <label htmlFor="support-screenshot">Screenshot of the error <span>optional</span></label><div className="screenshot-field"><input id="support-screenshot" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setScreenshot(event.target.files?.[0] ?? null)}/><label htmlFor="support-screenshot">{screenshot ? screenshot.name : "Choose screenshot"}</label><small>PNG, JPG or WebP · 5 MB maximum</small></div>
        <button className="contact-send" disabled={sending}>{sending ? "Sending…" : "Send message"}</button>{contactStatus && <div className="contact-status" role="status">{contactStatus}</div>}
      </form>}
    </section>}
  </div>;
}
