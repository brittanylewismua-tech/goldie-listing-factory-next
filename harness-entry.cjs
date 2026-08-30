"use strict";

// harness-entry.tsx
var import_server = require("react-dom/server");

// app/factory-panel.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function FactoryPanel({
  index,
  title,
  description,
  state,
  tone = "done",
  open = false,
  onToggle,
  toggleLabel,
  toggleDisabled,
  toggleTitle,
  children
}) {
  const toneClass = tone === "attention" ? " is-attention" : tone === "optional" ? " is-optional" : tone === "pending" ? " is-pending" : " is-done";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: `factory-panel${toneClass}${open ? " is-open" : ""}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "factory-panel-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "factory-panel-index", "aria-hidden": "true", children: String(index).padStart(2, "0") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "factory-panel-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: title }),
        description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: description }) : null
      ] }),
      state ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "factory-panel-state", children: state }) : null,
      onToggle ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "factory-panel-toggle",
          "aria-expanded": open,
          disabled: toggleDisabled,
          title: toggleTitle,
          onClick: onToggle,
          children: toggleLabel ?? (open ? "Close" : "Open")
        }
      ) : null
    ] }),
    open && children ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "factory-panel-body", children }) : null
  ] });
}

// app/artwork-grid.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function ArtworkGrid({ items }) {
  if (!items.length) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "factory-art-grid", children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("article", { className: "factory-art-card", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "factory-art-preview", children: item.previewUrl ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { src: item.previewUrl, alt: "", decoding: "async", loading: "lazy" }) : null }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "factory-art-meta", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: item.name }),
        item.meta ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { className: item.metaClassName, children: item.meta }) : null
      ] }),
      item.onOpen ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: item.linkClassName ? `factory-link ${item.linkClassName}` : "factory-link", onClick: item.onOpen, children: item.openLabel ?? "View full size" }) : null
    ] })
  ] }, item.key)) });
}

// app/photo-layout.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function PhotoLayout({
  previewUrl,
  name,
  meta,
  children
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "factory-photo-layout", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("aside", { className: "factory-listing-identity", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "factory-design-large", children: previewUrl ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("img", { src: previewUrl, alt: `${name} artwork` }) : null }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: name }),
      meta ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { children: meta }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "factory-photo-column", children })
  ] });
}

// app/page-head.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function PageHead({
  title,
  copy,
  help,
  stepCount,
  summary,
  children
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "factory-page-head", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "factory-heading-with-help", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h1", { children: title }),
        help
      ] }),
      stepCount,
      copy ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: copy }) : null,
      children
    ] }),
    summary ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "factory-summary", children: summary }) : null
  ] });
}

// harness-entry.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var shirt = (label) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#fff"/><text x="100" y="95" font-family="Georgia" font-size="20" font-weight="800" fill="#b4464d" text-anchor="middle">LIFE IS</text><text x="100" y="120" font-family="Georgia" font-size="20" font-weight="800" fill="#b4464d" text-anchor="middle">BETTER</text><text x="100" y="145" font-family="Georgia" font-size="15" fill="#b4464d" text-anchor="middle">${label}</text></svg>`
)}`;
var page = /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("main", { className: "app-shell", "data-product-selected": "true", children: [
  /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("aside", { className: "topbar", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "brand", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("b", { children: "Goldie" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("nav", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("a", { href: "#", children: "Listing Factory" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("a", { href: "#", children: "Batch history" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("a", { href: "#", children: "Saved products" })
    ] })
  ] }),
  /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "factory-main", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("header", { className: "factory-top", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("b", { children: "Dachshund batch" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "Saved just now" }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "factory-work", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("section", { className: "hero workflow-hero", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        PageHead,
        {
          title: "Build the listing photos",
          copy: "Review the real Printify placement, choose production photos, and add your own finished lifestyle images\u2014all in one place per listing.",
          help: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "context-help-trigger", type: "button", children: "?" }),
          stepCount: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "hero-step-count", children: "Step 2 of 4 \xB7 Designs + images" }),
          summary: "2 listings \xB7 8 photos"
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(FactoryPanel, { index: 1, title: "Upload finished designs", description: "2 print-resolution PNG files \xB7 originals stored in this browser", state: "2 ready" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(FactoryPanel, { index: 2, title: "Review Printify placement", description: "Open every design full size before photos are chosen", state: "2 ready", open: true, onToggle: () => {
      }, toggleLabel: "Close", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        ArtworkGrid,
        {
          items: [
            { key: "a", previewUrl: shirt("Dachshund"), name: "dachshund-red.png", meta: "Listing 1 of 2 \xB7 312 DPI \xB7 good to print", openLabel: "Adjust in Printify", onOpen: () => {
            }, metaClassName: "placement-dpi", linkClassName: "placement-printify-link" },
            { key: "b", previewUrl: shirt("Corgi"), name: "corgi-navy.png", meta: "Listing 2 of 2 \xB7 298 DPI \xB7 review before printing", openLabel: "Adjust in Printify", onOpen: () => {
            }, metaClassName: "placement-dpi", linkClassName: "placement-printify-link" }
          ]
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(FactoryPanel, { index: 3, title: "Add your listing photos", description: "Drag them into the order buyers will see", state: "8 photos", open: true, onToggle: () => {
      }, toggleLabel: "Close", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(PhotoLayout, { previewUrl: shirt("Dachshund"), name: "dachshund-red.png", meta: "4 of 20 photos", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("section", { className: "listing-photo-order", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "photo-order-strip", children: ["Front flat lay", "Model front", "Size guide", "Close-up", "Folded", "Back", "Lifestyle", "Detail"].map((name, i) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("article", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("img", { src: shirt(String(i + 1)), alt: "" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("b", { children: i < 4 ? "Printify photo" : "Uploaded photo" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("small", { className: "photo-order-name", children: name })
      ] }, name)) }) }) }) })
    ] })
  ] })
] });
process.stdout.write((0, import_server.renderToStaticMarkup)(page));
