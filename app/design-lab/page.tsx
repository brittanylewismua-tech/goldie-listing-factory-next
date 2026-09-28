import "./design-lab.css";
import { requireChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

const Arrow=()=> <span aria-hidden="true">→</span>;

export default async function DesignLab(){
  if(process.env.NODE_ENV==="production") await requireChatGPTUser("/design-lab");
  return <>
    <link rel="preconnect" href="https://fonts.googleapis.com"/>
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
    <main className="g2">
      <header className="g2-head">
        <div>
          <p className="eyebrow">Goldie design system / reference pass 02</p>
          <h1>Built like a serious tool. Still looks like Goldie.</h1>
          <span className="rule"/>
        </div>
        <p className="lede">World Builder gives us the brand language. Shopify gives us de-layering. Linear gives us restraint. Goldie keeps the density and Etsy-specific intelligence.</p>
      </header>

      <section className="specimen">
        <div className="section-label"><b>01</b><span>Core language</span></div>
        <div className="card-grid">
          <article className="signature-card">
            <div className="dots"><i/><i/><i/></div>
            <p className="eyebrow">Market Watch</p>
            <h2>What changed while you were away</h2>
            <p>109 listings in Halloween started showing momentum since your last check.</p>
            <a href="/market-watch">Open Market Watch <Arrow/></a>
          </article>
          <article className="quiet-panel">
            <p className="eyebrow">Type scale</p>
            <h1 className="sample-h1">Your shop</h1>
            <h2 className="sample-h2">What sold this month</h2>
            <h3 className="sample-h3">Top listings</h3>
            <p className="sample-body">Readable, compact, and comfortable enough for long working sessions.</p>
            <small>LAST SYNCED 18 MINUTES AGO</small>
          </article>
        </div>
      </section>

      <section className="specimen">
        <div className="section-label"><b>02</b><span>Homepage pulse</span></div>
        <article className="shop-pulse card">
          <div className="pulse-main">
            <div className="dots"><i/><i/><i/></div>
            <p className="eyebrow">She’s A Wolf Clothing · last 30 days</p>
            <strong>$8,492</strong>
            <span>revenue</span>
          </div>
          <div className="metric"><b>127</b><span>orders</span></div>
          <div className="metric"><b>$66.87</b><span>avg. order</span></div>
          <div className="metric"><b>83</b><span>listings live</span></div>
          <a href="/shop-map">Open your shop <Arrow/></a>
        </article>
      </section>

      <section className="specimen">
        <div className="section-label"><b>03</b><span>Goldie notices</span></div>
        <div className="notice-grid">
          <article className="card hover notice-card">
            <div className="notice-top"><span className="numeral">01</span><span className="chip">market watch</span></div>
            <h2>Halloween is moving again.</h2>
            <p>109 new listings started showing momentum. 68 are now repeating across multiple shops.</p>
            <a href="/market-watch">See the movement <Arrow/></a>
          </article>
          <article className="card hover notice-card">
            <div className="notice-top"><span className="numeral">02</span><span className="chip">your shop</span></div>
            <h2>“Feminist” is your strongest world.</h2>
            <p>$942 in the last 90 days across 24 live listings.</p>
            <a href="/shop-map?tab=themes">Open Shop Map <Arrow/></a>
          </article>
          <article className="card hover notice-card">
            <div className="notice-top"><span className="numeral">03</span><span className="chip accent">hot list</span></div>
            <h2>T-shirts led Etsy yesterday.</h2>
            <p>842 units across listings Goldie tracks.</p>
            <a href="/hot-list">View what sold <Arrow/></a>
          </article>
        </div>
      </section>

      <section className="specimen">
        <div className="section-label"><b>04</b><span>Listing imagery</span></div>
        <div className="listing-grid">
          <article className="listing-card card hover">
            <div className="fake-photo rose">HOT GIRLS<br/>READ BOOKS</div>
            <div><b>42 sold</b><span>last 30 days</span></div>
          </article>
          <article className="listing-card card hover">
            <div className="fake-photo black">BOOK<br/>CLUB</div>
            <div><b>26 sold</b><span>last 30 days</span></div>
          </article>
          <article className="listing-card card hover">
            <div className="fake-photo cream">FEMINIST<br/>AGENDA</div>
            <div><b>19 sold</b><span>last 30 days</span></div>
          </article>
        </div>
      </section>

      <section className="specimen">
        <div className="section-label"><b>05</b><span>Dense data</span></div>
        <div className="data-panel">
          <div className="data-head"><span>World</span><span>Live</span><span>Last 90</span><span>All time</span></div>
          {[
            ["Feminist","24","$942","$3,184","92%"],
            ["Bookish","18","$714","$2,621","76%"],
            ["Dog Mom","12","$366","$1,427","54%"],
            ["Halloween","9","$228","$841","39%"],
          ].map(r=><a href="/shop-map?tab=themes" className="data-row" key={r[0]}>
            <div><b>{r[0]}</b><i><span style={{width:r[4]}}/></i></div><span>{r[1]}</span><strong>{r[2]}</strong><span>{r[3]}</span>
          </a>)}
        </div>
      </section>

      <section className="specimen">
        <div className="section-label"><b>06</b><span>Controls</span></div>
        <div className="control-card card">
          <label><span>Phrase to check</span><input placeholder="sometimes the king is a woman"/></label>
          <button className="btn primary">Check trademark</button>
          <button className="btn ghost">Save phrase</button>
          <span className="status-dot">Register checked today</span>
        </div>
      </section>

      <section className="specimen">
        <div className="section-label"><b>07</b><span>Navigation density</span></div>
        <nav className="directory">
          {[
            ["Listing Factory","Build Etsy listings in bulk","/listing-factory"],
            ["Research","Understand a niche before you build","/market-watch/research"],
            ["Market Watch","See what is moving","/market-watch"],
            ["Shop Watch","Follow shops that matter","/market-watch?tab=shops"],
            ["Shop Map","See what your own shop is made of","/shop-map"],
            ["Trademark Check","Screen phrases before you print","/trademark"],
          ].map(([name,desc,href])=><a href={href} key={name}><b>{name}</b><span>{desc}</span><Arrow/></a>)}
        </nav>
      </section>
    </main>
  </>;
}
