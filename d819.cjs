const fs=require("fs"),postcss=require("postcss");
const f="app/clarity-pass.css";const root=postcss.parse(fs.readFileSync(f,"utf8"));
let removed=[];
root.walkRules(r=>{
  const s=r.selector.replace(/\s+/g," ");
  if(s==="\.management-page h1, .mockupHero h1")return;
  if(/^\.management-page h1,\s*\.mockupHero h1$/.test(s)){removed.push(s);r.replaceWith(postcss.parse(
`/* D819 · deleted. This set the interior page title in DM Serif 34px with six
   !important declarations, and the comment above it said the management pages
   "are not being migrated". They are now: they render the shell, and their
   title is the shell's Inter 700 29px, which is the preview's. */`).nodes[0]);return}
  if(/workflow-stage h2:not\(\.factory-publish-box \*\)/.test(s)&&/management-page h2/.test(s)){removed.push(s);r.replaceWith(postcss.parse(
`/* D819 · deleted, and this is the rule that made D816 false. It set every card
   and panel title in the shell to Manrope 800 18px with !important on the
   family, the size, the weight, the leading, the tracking and the colour.
   D816 declared Inter for .factory-work h3 and could never win.

   Confirmed on the live build, on step 3, with el.matches() against the real
   stylesheets: five rules set font-family on "What Etsy needs" - four say Inter
   and one says Manrope with !important, and the important one wins. It computed
   to Manrope 800 18px while the preview computes to Inter 700 14px.

   interface-v2 owns card titles: .factory-form-card > h3, .task-panel-lead h3,
   .task-panel-heading h3 and .factory-checklist-card > h3 are 700 14px/1.3
   Inter, read from the prototype. h2 keeps 18px, in Inter, declared below. */`).nodes[0]);return}
});
fs.writeFileSync(f,root.toString());
console.log("removed:\n"+removed.join("\n"));
