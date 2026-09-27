import MasterbotFrame from "../masterbot-frame";

export const metadata = { title: "MasterBot Support" };

export default function MasterbotSupport() {
  return <MasterbotFrame>
    <p className="mb-eyebrow">SUPPORT</p>
    <h1>Get MasterBot connected.</h1>
    <h2>Membership is active but access is denied</h2>
    <p>Disconnect MasterBot in ChatGPT, then reconnect using the exact email address attached to your active The Wolf Method Mastermind membership.</p>
    <h2>The sign-in link did not arrive</h2>
    <p>Check spam and promotions, wait a few minutes, then request a fresh link. Each link is single-use. Open it in the same browser you started from.</p>
    <h2>Still need help?</h2>
    <p>Email <a href="mailto:goldie@beawolfbiz.com">goldie@beawolfbiz.com</a>. Include the email used for the mastermind and a screenshot of the error. Never send a password, sign-in link, access token, or payment-card information.</p>
    <p><a className="mb-button" href="/masterbot-access">Check MasterBot access</a></p>
  </MasterbotFrame>;
}
