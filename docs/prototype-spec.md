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
