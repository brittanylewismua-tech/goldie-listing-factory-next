# Prototype spec — goldie-ux-preview-site @ aad9208, public/prototype.html, theme peach-glass

Read from the live prototype's own CSSOM (`r.style.cssText`), not from a screenshot
and not from taste. Every production rule that claims to match the preview cites
its line here.

## Step 1 — product
| selector | declarations |
| --- | --- |
| `.goldie-product-grid` | `display:grid; grid-template-columns:repeat(3,1fr); gap:12px` |
| `.goldie-product` | `border:1px solid #ded5db; border-radius:10px; padding:12px; background:#fff; cursor:pointer` |
| `.goldie-product.chosen` | `border:2px solid #6c3a5c; padding:11px; background:#fbf7fa` |
| `.goldie-product-image` | `height:116px; border-radius:8px; background:linear-gradient(145deg,#f5f2f4,#e8e1e6); display:grid; place-items:center; margin-bottom:11px; color:#8d7c87; font-size:12px` |

## Step 2 — artwork + photos
| selector | declarations |
| --- | --- |
| `.goldie-art-grid` | 2 columns, gap 12 |
| `.goldie-art-card` | `#fff; 1px #ded1d8; radius 10; overflow hidden` |
| `.goldie-art-preview` | `height:190px; background:#f0ecef` |
| `.goldie-photo-layout` | `display:grid; grid-template-columns:190px 698px; gap:18px` |
| `.goldie-listing-identity` | `width:190px; padding-right:18px` |
| `.goldie-design-large` | `width:171px; height:150px; border-radius:9px; background:#f1edef` |
| identity `strong` | `700 13px/1.35` |
| identity `small` | `11px; color:#796a74; margin-top:5px` |
| `.goldie-photos` | 4 columns, gap 8 |
| `.goldie-photo` | `height:91px; border-radius:8px; border:1px solid #ddd5da` |
| `.goldie-photo.selected` | `border:2px solid #6d3b5e` |

## Step 3 — listing details
| selector | declarations |
| --- | --- |
| `.goldie-listing-grid` | `display:grid; grid-template-columns:1.15fr .85fr; gap:14px` |
| `.goldie-form-card` | `background:rgba(255,252,254,.92); border:1px solid #e4cedb; border-radius:12px; padding:18px; box-shadow:0 5px 18px rgba(90,48,79,.07)` |
| `.goldie-form-card h3` | `font-size:14px; margin:0 0 14px` |
| `.goldie-field` | `margin-bottom:13px` |
| `.goldie-field label` | `display:flex; justify-content:space-between; font-size:11px; font-weight:750; margin-bottom:6px; color:#55434f` |
| `.goldie-input` | `border:1px solid #d8cfd5; border-radius:8px; background:#fff; padding:10px 11px; font-size:12px; color:#3b2b36; line-height:1.4; min-height:38px` |
| `.goldie-tags` | `display:flex; flex-wrap:wrap; gap:5px` |
| `.goldie-tag` | `background:#f1ebef; color:#5a4152; border-radius:6px; padding:5px 7px; font-size:10px` |
| `.goldie-checklist` | `display:grid; gap:8px` |
| `.goldie-check` | `display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #eee9ec; padding:8px 0; font-size:12px` |

## Step 4 — review + publish
| selector | declarations |
| --- | --- |
| `.goldie-review` | `display:grid; grid-template-columns:minmax(0,1fr) 290px; gap:16px` |
| `.goldie-review-list` | `display:grid; gap:10px` |
| `.goldie-review-row` | `background:#fff; border:1px solid #ded6dc; border-radius:10px; padding:13px; display:grid; grid-template-columns:44px minmax(0,1fr) auto; gap:11px; align-items:center` |
| `.goldie-thumb` | `width:44px; height:44px; background:#f0ecef; border-radius:7px; display:grid; place-items:center` |
| `.goldie-review-row strong` | `font-size:12px; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis` |
| `.goldie-review-row small` | `font-size:10px; color:#766772; display:block; margin-top:3px` |
| `.goldie-publish-box` | `background:#2d1d29; color:#fff; border-radius:12px; padding:20px; align-self:start; position:sticky; top:16px` |
| `.goldie-publish-box small` | `color:#c7b8c3; font-size:10px; text-transform:uppercase; letter-spacing:.08em` |
| `.goldie-publish-box h3` | `font-size:20px; margin:7px 0 5px` |
| `.goldie-publish-box p` | `font-size:11px; color:#c8b9c4; line-height:1.55; margin:0 0 16px` |
| `.goldie-primary` | `width:100%; border:0; border-radius:8px; background:#f3dbe9; color:#3d2637; font-weight:800; padding:12px` |

## Shared
| selector | declarations |
| --- | --- |
| `.goldie-page-head` | `display:flex; gap:20px; align-items:flex-end; justify-content:space-between; margin-bottom:25px` |
| `.goldie-page-head h1` | `700 29px/32.48; letter-spacing:-1.015px` |
| `.goldie-page-head p` | `14px/21.7; color:#6e606a` |
| `.goldie-summary` | `background:#fff7fa; border:1px solid #dfcbd6; border-radius:8px; padding:8px 11px; font-size:12px; color:#57384b` |
| `.goldie-help-trigger` | `25px circle; 850 12px; color:#5d3151; border:1px solid rgba(75,40,62,.22); background:rgba(255,255,255,.72)` |
| `.goldie-state` | `11px 750; color:#37704c; background:#edf7f0; border:1px solid #cae5d2; padding:6px 9px; radius:7px` |
| `.goldie-link` | `border:0; background:transparent; color:#6b365a; font:750 11px; padding:0` |

## Shell chrome (measured D734–D737)

| selector | declarations |
| --- | --- |
| `.goldie-sidebar` | `background:linear-gradient(rgba(255,250,253,.58),rgba(255,246,251,.36)); border-right:1px solid rgba(255,255,255,.72); backdrop-filter:blur(20px) saturate(1.12); padding:36px 26px 25px` |
| `.goldie-nav` item | `padding:12px 14px; radius 14; 650 13px`; active `background:rgba(255,255,255,.62)`, inactive `color:rgba(74,42,62,.62)` |
| `.goldie-restart` | `margin:12px 2px 0; padding:10px 12px; border:1px solid rgba(74,42,62,.14); radius 12; background:rgba(255,255,255,.38); 750 11px; text-align:left` |
| `.goldie-meter` | `background:rgba(255,255,255,.36); border:1px solid rgba(255,255,255,.65); radius 16; padding:13px 14px` |
| meter label | `750 9px; uppercase; letter-spacing .08em; rgba(74,42,62,.6)` |
| meter figure | `700 15px; #4b283e; margin:4px 0 8px` |
| `.goldie-meter-track` | `height:5px; radius 99; rgba(74,42,62,.12)` |
| `.goldie-top` | `height:64px; padding:0 34px; background:rgba(255,248,252,.72); border-bottom:1px solid rgba(176,127,153,.18); backdrop-filter:blur(14px)` |
| `.goldie-avatar` | `34x34; radius 50%; background:#4b283e; 800 11px; letter-spacing .04em` |
| `.goldie-progress` | `grid; repeat(4,1fr); border-bottom:1px solid #ddd5da; margin-bottom:32px` |
| `.goldie-progress button` | `padding:0 4px 15px; 750 11px; uppercase; letter-spacing .04em; #83737e` |
| `.goldie-work` | `max-width:1020px; margin:auto; padding:34px 38px 0` |
| `.goldie-footer` | `sticky bottom:0; width:calc(100vw - 288px); margin:18px 0 0 calc(.5*(100% + 288px - 100vw)); padding:14px max(38px,50vw - 616px); background:rgba(255,255,255,.96); border-top:1px solid #d9cbd3; box-shadow:0 -8px 24px rgba(75,40,62,.07); backdrop-filter:blur(10px)` |
| `.goldie-footer small` | `11px; #776873` |
| `.goldie-next` | `radius 8; background:#5d3151; #fff; padding:11px 18px; weight 750` |
| `.goldie-site-footer` | `padding:24px 34px; border-top:1px solid rgba(143,100,124,.17); background:rgba(255,248,251,.54); flex; space-between; gap 26; #76616f; backdrop-filter:blur(12px)` |

Base typeface throughout is `Inter, ui-sans-serif, system-ui, -apple-system,
sans-serif` at normal tracking. The only serif is the Goldie wordmark.

## Where production keeps its own answer

The preview is the spec except where a production capability already settled
the question. Each of these is deliberate, and each is guarded by a test:

| what | prototype | production, and why |
| --- | --- | --- |
| artwork beside the photos | 171×150 | 240×210 — D684 settled that 180 was too small to judge a design by |
| publish-list titles | one line, ellipsis | wrap in full — D98, the last place the whole title can be read |
| step number under the title | absent | present — D416, it is what stops Connect reading as step one |
| review list | flat rows | collapsed disclosures — D562, the artwork shows once at a size worth judging and nothing opens itself |
| forward button | one per screen | one per screen, plus the gate reason beside it — D375/D107 |
| site footer, right end | ends 34px from the pane edge | ends 88px from it — D779. The support launcher is fixed 16px from that corner and 60px wide, so at 34px the copyright year sits underneath it. The prototype has the same collision; it is only invisible there because its footer is below the fold at the scroll position it was drawn at. This is the one place the preview is copied with a correction rather than exactly. |
| site footer, links | Support · Privacy · Terms | omitted — D779. There is no `/privacy` or `/terms` route in this app, and three links where two 404 is worse than none. |
