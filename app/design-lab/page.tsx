"use client";

import {useMemo,useState} from "react";
import "./design-lab.css";

type Direction="mymind"|"rose"|"lilac";

const DIRECTIONS:{id:Direction;name:string;note:string}[]=[
  {id:"mymind",name:"Reference balance",note:"Closest to the sampled peach, lilac and periwinkle ratio."},
  {id:"rose",name:"Rosewater glass",note:"Slightly pinker with a warmer skincare finish."},
  {id:"lilac",name:"Lilac atmosphere",note:"More cool color movement without becoming purple software."},
];

export default function DesignLab(){
  const [direction,setDirection]=useState<Direction>("mymind");
  const [orbScale,setOrbScale]=useState(132);
  const [orbX,setOrbX]=useState(59);
  const [orbY,setOrbY]=useState(46);
  const [orbBlur,setOrbBlur]=useState(72);
  const [glass,setGlass]=useState(56);
  const [color,setColor]=useState(88);
  const style=useMemo(()=>({
    "--orb-scale":`${orbScale}%`,"--orb-x":`${orbX}%`,"--orb-y":`${orbY}%`,
    "--orb-blur":`${orbBlur}px`,"--glass":`${glass/100}`,"--color":`${color/100}`,
  }) as React.CSSProperties,[orbScale,orbX,orbY,orbBlur,glass,color]);

  return <main className={`design-lab ${direction}`} style={style}>
    <div className="atmosphere" aria-hidden="true"><i/><i/><i/></div>
    <aside className="lab-sidebar">
      <div className="goldie-lockup"><span aria-hidden="true">✦</span><img src="/goldie-wordmark-clean.png" alt="Goldie"/><small>GPT</small></div>
      <nav>
        <a className="active"><b>▢</b>Listing Factory</a>
        <a><b>◷</b>Batch History</a>
        <a><b>⌘</b>Keyword Banks</a>
        <a><b>▧</b>Mockup Sets</a>
        <a><b>◇</b>Usage</a>
      </nav>
    </aside>

    <section className="lab-workspace">
      <header className="lab-progress">
        <span>STEP 1 OF 9</span><div><i/></div>
        <p>Connect Printify</p><button>View all steps⌄</button>
      </header>
      <div className="task-zone">
        <article className="glass-task">
          <div className="link-mark">↗</div>
          <h1>Connect Printify</h1>
          <p>Connect the Printify shop where Goldie should create your product drafts.</p>
          <button className="connect-button">Connect Printify</button>
          <button className="token-link">How to get your Printify token <span>›</span></button>
          <small>◇ <span>Encrypted and saved securely.</span></small>
        </article>
        <p className="time-note">◷ <span>This takes about 2 minutes.</span></p>
      </div>
      <footer className="lab-footer"><button disabled>Continue</button></footer>
    </section>

    <section className="lab-controls" aria-label="Design controls">
      <div className="direction-tabs">{DIRECTIONS.map(item=><button key={item.id} className={direction===item.id?"active":""} onClick={()=>setDirection(item.id)}><b>{item.name}</b><small>{item.note}</small></button>)}</div>
      <div className="sliders">
        <label>Orb size <b>{orbScale}%</b><input type="range" min="90" max="190" value={orbScale} onChange={e=>setOrbScale(+e.target.value)}/></label>
        <label>Horizontal <b>{orbX}%</b><input type="range" min="20" max="85" value={orbX} onChange={e=>setOrbX(+e.target.value)}/></label>
        <label>Vertical <b>{orbY}%</b><input type="range" min="15" max="80" value={orbY} onChange={e=>setOrbY(+e.target.value)}/></label>
        <label>Softness <b>{orbBlur}</b><input type="range" min="30" max="130" value={orbBlur} onChange={e=>setOrbBlur(+e.target.value)}/></label>
        <label>Glass opacity <b>{glass}%</b><input type="range" min="25" max="88" value={glass} onChange={e=>setGlass(+e.target.value)}/></label>
        <label>Color intensity <b>{color}%</b><input type="range" min="45" max="125" value={color} onChange={e=>setColor(+e.target.value)}/></label>
      </div>
    </section>
  </main>
}
