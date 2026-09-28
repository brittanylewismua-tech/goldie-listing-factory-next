import "./design-lab.css";
import { requireChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

const Arrow = () => <span aria-hidden="true">↗</span>;

export default async function DesignLab() {
  if (process.env.NODE_ENV === "production") {
    await requireChatGPTUser("/design-lab");
  }

  return (
    <main className="goldie-lab">
      <section className="lab-intro">
        <div>
          <p className="lab-kicker">Goldie UI system / 01</p>
          <h1>Sharp enough for the product we built.</h1>
          <p className="lab-deck">
            Black, white, hot pink. Editorial scale. Dense when the data matters.
            Quiet when the seller needs to decide.
          </p>
        </div>
        <div className="lab-intro-meta">
          <span>Sans serif only</span>
          <span>High contrast</span>
          <span>Real product patterns</span>
        </div>
      </section>

      <section className="lab-section">
        <div className="lab-section-head">
          <p>01 / Type + actions</p>
          <span>The interface should feel confident before color does anything.</span>
        </div>

        <div className="lab-type-grid">
          <div className="lab-type-display">
            <span>Display</span>
            <strong>Know what moved.</strong>
          </div>
          <div className="lab-type-stack">
            <div><span>Page title</span><h2>Market Watch</h2></div>
            <div><span>Section title</span><h3>What changed overnight</h3></div>
            <div><span>Body</span><p>See the listings, shops, and product families that changed while you were away.</p></div>
            <div><span>Metadata</span><small>LAST CHECKED 18 MINUTES AGO</small></div>
          </div>
        </div>

        <div className="lab-actions">
          <button className="lab-button lab-button-primary">Start a new batch</button>
          <button className="lab-button lab-button-dark">Open research</button>
          <button className="lab-button lab-button-quiet">View all</button>
          <button className="lab-link-button">See sold listings <Arrow/></button>
        </div>
      </section>

      <section className="lab-section">
        <div className="lab-section-head">
          <p>02 / Shop pulse</p>
          <span>Performance should read in seconds, without becoming a finance dashboard.</span>
        </div>

        <div className="lab-pulse">
          <div className="lab-pulse-main">
            <p className="lab-kicker light">SHE'S A WOLF CLOTHING · LAST 30 DAYS</p>
            <strong>$8,492</strong>
            <span>Revenue</span>
          </div>
          <div className="lab-pulse-stat"><strong>127</strong><span>Orders</span></div>
          <div className="lab-pulse-stat"><strong>$66.87</strong><span>Avg. order</span></div>
          <div className="lab-pulse-stat"><strong>83</strong><span>Listings live</span></div>
          <a className="lab-pulse-link" href="#listing-strip">See what sold <Arrow/></a>
        </div>
      </section>

      <section className="lab-section">
        <div className="lab-section-head">
          <p>03 / Intelligence</p>
          <span>Goldie should report discoveries, not introduce its own features.</span>
        </div>

        <div className="lab-intel-grid">
          <article className="lab-intel lab-intel-feature">
            <div className="lab-intel-number">01</div>
            <div>
              <p className="lab-kicker light">MARKET WATCH</p>
              <h2>Halloween moved hard overnight.</h2>
              <p>109 listings in a niche you follow started showing momentum since your last look.</p>
              <a href="/market-watch">See the movement <Arrow/></a>
            </div>
            <div className="lab-mini-posters" aria-hidden="true">
              <div className="poster p1">GHOST<br/>MODE</div>
              <div className="poster p2">HEX<br/>CLUB</div>
              <div className="poster p3">SPOOKY<br/>SEASON</div>
            </div>
          </article>

          <article className="lab-intel lab-intel-compact">
            <p className="lab-kicker">YOUR SHOP</p>
            <strong>“Feminist” is carrying the most revenue.</strong>
            <div className="lab-spark" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/></div>
            <span>$3,184 all time · $942 last 90 days</span>
          </article>

          <article className="lab-intel lab-intel-compact pink">
            <p className="lab-kicker">HOT LIST</p>
            <strong>T-shirts led Etsy yesterday.</strong>
            <span>842 units across the listings Goldie tracks</span>
            <a href="/hot-list">View what sold <Arrow/></a>
          </article>
        </div>
      </section>

      <section className="lab-section" id="listing-strip">
        <div className="lab-section-head">
          <p>04 / Product imagery</p>
          <span>Real listing imagery should create energy instead of six tiny equal cards.</span>
        </div>

        <div className="lab-listings">
          <article className="lab-listing lab-listing-lead">
            <div className="listing-art art-a"><span>HOT GIRLS<br/>READ BOOKS</span></div>
            <div className="listing-caption"><strong>42 sold</strong><span>in 30 days</span></div>
          </article>
          <article className="lab-listing">
            <div className="listing-art art-b"><span>BOOK<br/>CLUB</span></div>
            <div className="listing-caption"><strong>26 sold</strong><span>in 30 days</span></div>
          </article>
          <article className="lab-listing">
            <div className="listing-art art-c"><span>FEMINIST<br/>AGENDA</span></div>
            <div className="listing-caption"><strong>19 sold</strong><span>in 30 days</span></div>
          </article>
        </div>
      </section>

      <section className="lab-section">
        <div className="lab-section-head">
          <p>05 / Dense information</p>
          <span>Tables should feel like product UI, not exported spreadsheets.</span>
        </div>

        <div className="lab-table">
          <div className="lab-table-head">
            <span>World</span><span>Live listings</span><span>Last 90</span><span>All time</span>
          </div>
          {[
            ["Feminist", "24", "$942", "$3,184"],
            ["Bookish", "18", "$714", "$2,621"],
            ["Dog Mom", "12", "$366", "$1,427"],
            ["Halloween", "9", "$228", "$841"],
          ].map((row, index) => (
            <a href="/shop-map?tab=themes" className="lab-table-row" key={row[0]}>
              <div><b>{row[0]}</b><i style={{width:`${92-index*17}%`}}/></div>
              <span>{row[1]}</span><strong>{row[2]}</strong><span>{row[3]}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="lab-section">
        <div className="lab-section-head">
          <p>06 / Forms + states</p>
          <span>Operational screens stay calmer than discovery screens.</span>
        </div>

        <div className="lab-form-grid">
          <div className="lab-form-card">
            <label>
              <span>Phrase to check</span>
              <input placeholder="sometimes the king is a woman"/>
            </label>
            <button className="lab-button lab-button-primary">Check trademark</button>
            <div className="lab-status"><i/> Register checked today</div>
          </div>

          <div className="lab-state-stack">
            <div className="lab-state"><b>Watching</b><span>7 keywords · 3 shops · 2 niches</span></div>
            <div className="lab-state attention"><b>1 phrase needs review</b><span>Trademark Tracker</span></div>
            <div className="lab-state empty"><b>Nothing new here</b><span>We will show movement when there is something worth seeing.</span></div>
          </div>
        </div>
      </section>

      <section className="lab-section">
        <div className="lab-section-head">
          <p>07 / Navigation language</p>
          <span>Tools can stay easy to find without turning Home into a feature directory.</span>
        </div>

        <nav className="lab-directory" aria-label="Goldie tools">
          {[
            ["Listing Factory","Build Etsy listings in bulk","/listing-factory"],
            ["Research","Understand a niche before you build","/market-watch/research"],
            ["Market Watch","See what is moving","/market-watch"],
            ["Shop Watch","Follow shops that matter","/market-watch?tab=shops"],
            ["Shop Map","See what your own shop is made of","/shop-map"],
            ["Trademark Check","Screen phrases before you print","/trademark"],
          ].map(([name,desc,href]) => (
            <a href={href} key={name}><b>{name}</b><span>{desc}</span><Arrow/></a>
          ))}
        </nav>
      </section>
    </main>
  );
}
