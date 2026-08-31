const fs=require("fs"),postcss=require("postcss");
const files=fs.readdirSync("app").filter(f=>f.endsWith(".css"));
const hits=[];
for(const f of files){
  postcss.parse(fs.readFileSync("app/"+f,"utf8")).walkDecls(d=>{
    if(!d.important)return;
    if(!/^(font|font-family|font-size|font-weight|color)$/.test(d.prop))return;
    const sel=(d.parent.selector||"").replace(/\s+/g," ");
    if(!/app-shell|management-page|usage-page|keyword-page|managementOnly|interior/.test(sel))return;
    hits.push(`${f}:${d.source.start.line}  ${d.prop}:${d.value.slice(0,40)}  <-  ${sel.slice(0,90)}`);
  });
}
console.log(hits.length+" important typography declarations reaching the shell or the interior\n");
console.log(hits.join("\n"));
