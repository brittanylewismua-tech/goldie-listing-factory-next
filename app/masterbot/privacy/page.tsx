import MasterbotFrame from "../masterbot-frame";

export const metadata = { title: "MasterBot Privacy Policy" };

export default function MasterbotPrivacy() {
  return <MasterbotFrame>
    <p className="mb-eyebrow">PRIVACY POLICY</p>
    <h1>How MasterBot handles information.</h1>
    <p>This policy applies to MasterBot, operated by Brittany Lewis under Be A Wolf Biz.</p>
    <h2>Information we process</h2>
    <ul>
      <li>Account information: your email address and authentication identifier.</li>
      <li>Membership information: whether the same email has active access to The Wolf Method Mastermind, received from Kajabi when you purchase or your access changes. MasterBot does not receive your Kajabi password or payment-card number.</li>
      <li>Tool requests: the MasterBot mode requested. The shop details, screenshots and text you share stay in your ChatGPT conversation; MasterBot&apos;s server does not receive or store them.</li>
      <li>Security and service records: connection tokens, timestamps, technical errors, and records needed to prevent abuse and keep the service operating.</li>
    </ul>
    <h2>How we use information</h2>
    <p>We use this information to authenticate you, verify membership, provide requested MasterBot functions, secure the service, troubleshoot failures, and comply with legal obligations.</p>
    <h2>Service providers</h2>
    <p>MasterBot relies on service providers for authentication, hosting, membership verification, and the ChatGPT connection, including OpenAI, Cloudflare, Supabase, Google (if you choose Google sign-in) and Kajabi. Their own privacy terms also apply to information they process.</p>
    <h2>Sharing and sale</h2>
    <p>We do not sell personal information. We disclose information to service providers as needed to operate MasterBot, or when required by law, security, or enforcement of our terms.</p>
    <h2>Retention and deletion</h2>
    <p>Account and membership records are kept while your membership is active and for as long afterward as needed for access, security, support and legal requirements. Access tokens expire and refresh tokens are rotated. You may request deletion of MasterBot-linked account data by contacting support.</p>
    <h2>Your choices</h2>
    <p>You may disconnect MasterBot in ChatGPT, stop using the service, or request access, correction, or deletion of information associated with your account. Some security or legal records may need to be retained where required.</p>
    <h2>Contact</h2>
    <p>Email <a href="mailto:goldie@beawolfbiz.com">goldie@beawolfbiz.com</a> or use the <a href="/masterbot/support">MasterBot support page</a>.</p>
    <p>Effective September 27, 2026</p>
  </MasterbotFrame>;
}
