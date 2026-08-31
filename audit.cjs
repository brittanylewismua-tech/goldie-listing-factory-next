const fs=require("fs"),postcss=require("postcss");
const LOAD=["globals.css","factory-navigation.css","theme.css","lilac-theme.css","approved-functional.css","management-aesthetic.css","clarity-pass.css","interface-v2.css","batch-history.css","support.css","pricing-profile.css","factory-tools.css"];
function spec(sel){let a=0,b=0,c=0;const s=sel.replace(/::?[a-z-]+(\([^)]*\))?/g,m=>{if(/^::/.test(m)){c++;return " "}if(/^:(is|where|has|not)\(/.test(m))return " "+m.slice(m.indexOf("(")+1,-1)+" ";b++;return " "});
 (s.match(/#[\w-]+/g)||[]).forEach(()=>a++);(s.match(/\.[\w-]+|\[[^\]]+\]/g)||[]).forEach(()=>b++);
 (s.replace(/[#.][\w-]+|\[[^\]]+\]/g," ").match(/\b[a-z][\w-]*\b/gi)||[]).forEach(()=>c++);return [a,b,c]}
const cmp=(x,y)=>x[0]-y[0]||x[1]-y[1]||x[2]-y[2];
// every element+property my D818 block declares, described as an element chain
const CASES=[
 {name:"interior h1 colour", el:".app-shell.interior-shell .factory-main .factory-work .interior-page header h1", props:["color","font","font-family","font-size"]},
 {name:"interior h2", el:".app-shell.interior-shell .factory-work .interior-page section h2", props:["font","font-family","font-size","color"]},
 {name:"plan banner h2", el:".app-shell.interior-shell .factory-work .usage-page.interior-page .plan-banner h2", props:["color","font","font-family"]},
 {name:"plan banner p", el:".app-shell.interior-shell .factory-work .usage-page.interior-page .plan-banner p", props:["color"]},
 {name:"plan banner background", el:".app-shell.interior-shell .factory-work .usage-page.interior-page .plan-banner", props:["background","background-color"]},
 {name:"batch status chip", el:".app-shell.interior-shell .factory-work .management-page.interior-page .batch-history article .batch-status", props:["background","background-color","color","font","font-size","border-radius"]},
 {name:"batch history h2", el:".app-shell.interior-shell .factory-work .management-page.interior-page .batch-history article .batch-history-summary h2", props:["font","font-family","font-size","color"]},
 {name:"batch history small", el:".app-shell.interior-shell .factory-work .management-page.interior-page .batch-history article .batch-history-controls small", props:["font","font-size","color"]},
 {name:"usage card b", el:".app-shell.interior-shell .factory-work .usage-page.interior-page .usage-grid .usage-card b", props:["font","font-size","color"]},
 {name:"usage card h2", el:".app-shell.interior-shell .factory-work .usage-page.interior-page .usage-grid .usage-card h2", props:["font","font-family","font-size","color"]},
 {name:"bank chip", el:".app-shell.interior-shell .factory-work .management-page.keyword-page.interior-page .bank-grid article span", props:["background","background-color","color","font","font-size","border-radius"]},
 {name:"bank h3", el:".app-shell.interior-shell .factory-work .management-page.keyword-page.interior-page .bank-grid article h3", props:["font","font-family","font-size","color"]},
 {name:"interior wrapper box", el:".app-shell.interior-shell .factory-main .factory-work .management-page.interior-page", props:["max-width","padding","margin","min-height"]},
];
// crude matcher: does selector's compound chain appear in order within the element chain?
function matches(sel,el){
  if(/[>+~]/.test(sel))return null; // skip combinator-specific, report separately
  const parts=sel.trim().split(/\s+/);
  const chain=el.trim().split(/\s+/);
  let i=0;
  for(const p of parts){
    let hit=false;
    while(i<chain.length){const c=chain[i++];
      const toks=p.match(/[.#]?[\w-]+|\[[^\]]+\]|:[\w-]+(\([^)]*\))?/g)||[];
      if(toks.every(t=>t.startsWith(":")||c.includes(t)||(!/^[.#]/.test(t)&&c.split(".")[0]===t))){hit=true;break}}
    if(!hit)return false;
  }
  return true;
}
const out=[];
for(const cse of CASES){
  const cands=[];
  LOAD.forEach((f,fi)=>{
    if(!fs.existsSync("app/"+f))return;
    postcss.parse(fs.readFileSync("app/"+f,"utf8")).walkRules(rule=>{
      if(rule.parent.type==="atrule"&&/max-width/.test(rule.parent.params||""))return;
      rule.selectors.forEach(raw=>{
        const sel=raw.replace(/\s+/g," ").trim();
        if(matches(sel,cse.el)!==true)return;
        rule.nodes.filter(n=>n.type==="decl"&&cse.props.includes(n.prop)).forEach(d=>{
          cands.push({f,line:d.source.start.line,sel,prop:d.prop,val:d.value.replace(/\s+/g," "),imp:d.important===true,sp:spec(sel),fi});
        });
      });
    });
  });
  const byProp={};
  cands.forEach(c=>{(byProp[c.prop]=byProp[c.prop]||[]).push(c)});
  const lines=[];
  for(const [prop,list] of Object.entries(byProp)){
    list.sort((a,b)=>Number(a.imp)-Number(b.imp)||cmp(a.sp,b.sp)||a.fi-b.fi||a.line-b.line);
    const w=list[list.length-1];
    lines.push(`    ${prop}: ${w.val}${w.imp?" !important":""}   <- ${w.f}:${w.line}  ${w.sel}`);
  }
  out.push(`${cse.name}\n${lines.join("\n")||"    (nothing declares these)"}`);
}
console.log(out.join("\n\n"));
