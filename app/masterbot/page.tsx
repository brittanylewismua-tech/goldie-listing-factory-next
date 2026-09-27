import MasterbotFrame from "./masterbot-frame";

export const metadata = { title: "MasterBot | Etsy shop review and strategy" };

export default function MasterbotPage() {
  return <MasterbotFrame>
    <p className="mb-eyebrow">MASTERBOT</p>
    <h1>The CEO of Etsy Empire Building.</h1>
    <p>MasterBot is Brittany Lewis&apos;s Etsy strategy partner inside ChatGPT, included with The Wolf Method Mastermind. It reviews your shop against the evidence you provide, turns the review into a Shop Summary Sheet, builds daily, weekly or monthly execution plans, interprets your own validated keyword lists, and helps you reset your CEO mindset when the numbers get loud.</p>
    <div className="mb-card">
      <h2 style={{marginTop:0}}>How to use MasterBot</h2>
      <ol>
        <li>Open ChatGPT (chatgpt.com or the app).</li>
        <li>Click + in the message box, find MasterBot, and click Connect.</li>
        <li>Sign in with the email you use for The Wolf Method Mastermind.</li>
        <li>Start a chat — for example: “Review my Etsy shop with MasterBot.”</li>
      </ol>
      <a className="mb-button" href="/masterbot-access">Check my access</a>
    </div>
    <p>MasterBot gives strategy and analysis in text only. It never generates designs or images, never invents keywords, and works only from what you share with it.</p>
  </MasterbotFrame>;
}
