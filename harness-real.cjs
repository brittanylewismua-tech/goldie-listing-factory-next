"use strict";

// harness-real.tsx
var import_server = require("react-dom/server");

// app/final-listing-review.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
function batchHasMixedProducts(drafts2) {
  return new Set(drafts2.map((d) => d.productName || "")).size > 1;
}
function readableDesignName(name) {
  const base = (name || "").replace(/\.[a-z0-9]+$/i, "");
  const tidy = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return tidy || name || "Untitled design";
}
function FinalListingReview({ drafts: drafts2, files: files2, selections, defaultIndices, preparedMockupCounts, batchSizeGuide, productName, onRetry, onEdit }) {
  const selectable = drafts2.filter((draft) => draft.status === "Created" && draft.id);
  const reviewNeeded = (draft) => {
    const design = files2.find((file) => file.id === draft.clientId) || files2.find((file) => file.name === draft.name);
    return !design || design.title.trim().length < 100 || design.tags.length < 13;
  };
  const [selectedIds, setSelectedIds] = (0, import_react.useState)(() => selectable.filter((draft) => !reviewNeeded(draft)).map((draft) => draft.id));
  const selected = new Set(selectedIds), allSelected = selectable.length > 0 && selectable.every((draft) => selected.has(draft.id));
  const mixedProducts = batchHasMixedProducts(drafts2);
  const groups = [...drafts2.reduce((map, draft) => {
    const key = draft.name || draft.clientId;
    map.set(key, [...map.get(key) || [], draft]);
    return map;
  }, /* @__PURE__ */ new Map()).entries()];
  const knownIds = (0, import_react.useRef)(/* @__PURE__ */ new Set());
  const sellerChose = (0, import_react.useRef)(false);
  const availableKey = selectable.map((draft) => draft.id).sort().join(",");
  (0, import_react.useEffect)(() => {
    const available = availableKey ? availableKey.split(",") : [];
    const fresh = sellerChose.current ? [] : available.filter((id) => !knownIds.current.has(id) && !reviewNeeded(selectable.find((draft) => draft.id === id)));
    available.forEach((id) => knownIds.current.add(id));
    setSelectedIds((current) => {
      const kept = current.filter((id) => available.includes(id));
      return fresh.length ? [.../* @__PURE__ */ new Set([...kept, ...fresh])] : kept;
    });
  }, [availableKey]);
  (0, import_react.useEffect)(() => {
    window.dispatchEvent(new CustomEvent("goldie-publish-selection", { detail: selectedIds }));
  }, [selectedIds]);
  function changeSelection(ids) {
    sellerChose.current = true;
    window.dispatchEvent(new Event("goldie-publish-selection-touched"));
    setSelectedIds(ids);
  }
  function toggle(id) {
    if (selected.has(id)) {
      changeSelection(selectedIds.filter((value) => value !== id));
      return;
    }
    const draft = selectable.find((item) => item.id === id);
    if (draft && reviewNeeded(draft) && !window.confirm("This listing still needs a title or tag review. Include it in this publish anyway?")) return;
    changeSelection([...selectedIds, id]);
  }
  function contentReview(design) {
    const shortTitle = !design || design.title.trim().length < 100;
    const missingTags = !design || design.tags.length < 13;
    return { shortTitle, missingTags, needed: shortTitle || missingTags };
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "final-listing-review", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "final-listing-review-heading", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "mini-label", children: productName ? `LISTINGS ON ${productName.toUpperCase()}` : "EVERY LISTING IN THIS BATCH" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Choose exactly which listings to publish" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        selectedIds.length,
        " of ",
        selectable.length,
        " selected"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "final-select-all", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: allSelected, onChange: () => changeSelection(allSelected ? [] : selectable.filter((draft) => !reviewNeeded(draft)).map((draft) => draft.id)) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Select every listing that is ready" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "final-design-groups", children: groups.map(([designName, group]) => {
      const attention = group.filter((draft) => {
        const design = files2.find((file) => file.id === draft.clientId) || files2.find((file) => file.name === draft.name);
        return draft.status !== "Created" || !draft.id || (selections[draft.id] ?? defaultIndices).length + (preparedMockupCounts[draft.id] || 0) === 0 || contentReview(design).needed;
      }).length;
      const artwork = (() => {
        for (const draft of group) {
          const design = files2.find((file) => file.id === draft.clientId) || files2.find((file) => file.name === draft.name);
          if (design?.previewUrl) return design.previewUrl;
        }
        return "";
      })();
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: "final-design-group", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: (() => {
            for (const draft of group) {
              const design = files2.find((file) => file.id === draft.clientId) || files2.find((file) => file.name === draft.name);
              const named = design?.title?.trim() || draft.title?.trim();
              if (named) return named;
            }
            return readableDesignName(designName);
          })() }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", { children: [
            group.length,
            " ",
            group.length === 1 ? "listing" : "listings"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { className: attention ? "needs-attention" : "ready", children: attention ? `${attention} ${attention === 1 ? "needs" : "need"} a look` : "\u2713 Ready" })
        ] }),
        artwork ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "final-design-art", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { src: artwork, alt: `Design ${readableDesignName(designName)}`, loading: "lazy", decoding: "async" }) }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "final-listing-grid", children: group.map((draft) => {
          const design = files2.find((file) => file.id === draft.clientId) || files2.find((file) => file.name === draft.name), selectedCount = draft.id ? (selections[draft.id] ?? defaultIndices).length : defaultIndices.length, mockupCount = draft.id ? preparedMockupCounts[draft.id] || 0 : 0, hasPhoto = selectedCount + mockupCount > 0, publishable = draft.status === "Created" && hasPhoto, review = contentReview(design), reviewMessage = review.shortTitle && review.missingTags ? "Title and tags need review" : review.shortTitle ? "Title needs review" : "Tags need review";
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: `final-listing-card ${publishable ? review.needed ? "review-needed" : "" : "failed"}`, children: [
            draft.id && draft.status === "Created" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "final-listing-select", "aria-label": `Select ${design?.title || draft.title || draft.name} for publishing`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: selected.has(draft.id), onChange: () => toggle(draft.id) }) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "final-listing-select-placeholder" }),
            draft.previewUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { loading: "lazy", src: draft.previewUrl, alt: `Preview for ${design?.title || draft.title || draft.name}` }) : design ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { loading: "lazy", src: design.previewUrl, alt: `Preview for ${design.title || design.name}` }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "final-listing-no-image", children: "No preview" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              mixedProducts && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { className: "final-product-name", children: draft.productName || "Saved product" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: design?.title || draft.title || draft.name }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
                (design?.title || draft.title || draft.name).length,
                "/140 characters \xB7 ",
                design?.tags?.length || 0,
                "/13 tags \xB7 ",
                selectedCount + mockupCount,
                " ",
                selectedCount + mockupCount === 1 ? "photo" : "photos",
                design?.sizeGuideName || batchSizeGuide ? " \xB7 size guide ready" : ""
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: !publishable ? "needs-attention" : review.needed ? "content-review" : "ready", children: !publishable ? draft.status !== "Created" ? `! ${draft.error || "Draft needs attention"}` : "! Add at least one listing photo" : review.needed ? `! ${reviewMessage} \xB7 publishing is still available` : "\u2713 Ready for final publish" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "final-listing-links", children: [
              draft.status !== "Created" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => onRetry?.(draft.clientId) || window.dispatchEvent(new CustomEvent("goldie-retry-listing", { detail: draft.clientId })), children: "Retry this listing" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => onEdit("details"), children: "Edit title" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => onEdit("mockups"), children: "Edit images" })
              ] }),
              draft.editorUrl && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: draft.editorUrl, target: "_blank", rel: "noopener noreferrer", children: "View in Printify \u2197" })
            ] })
          ] }, `${draft.productName || "product"}:${draft.clientId}`);
        }) })
      ] }, designName);
    }) })
  ] });
}

// harness-real.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var art = (l) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#fbf7fa"/><text x="100" y="110" font-family="Georgia" font-size="18" fill="#b4464d" text-anchor="middle">${l}</text></svg>`)}`;
var drafts = [
  { clientId: "a", id: "p1", name: "dachshund-red.png", title: "Life Is Better With A Dachshund Sweatshirt, Dog Mom Gift, Comfort Colors 1566", status: "Created", previewUrl: art("Dachshund"), editorUrl: "https://printify.com/x", productName: "Unisex Garment-Dyed Sweatshirt" },
  { clientId: "b", id: "p2", name: "paws.png", title: "My Best Friend Has Paws Sweatshirt, Dog Lover Gift", status: "Created", previewUrl: art("Paws"), editorUrl: "https://printify.com/y", productName: "Unisex Garment-Dyed Sweatshirt" },
  { clientId: "c", id: "p3", name: "corgi.png", title: "Corgi Mom Crewneck", status: "Created", previewUrl: art("Corgi"), editorUrl: "https://printify.com/z", productName: "Unisex Garment-Dyed Sweatshirt" }
];
var files = [
  { id: "a", name: "dachshund-red.png", title: "Life Is Better With A Dachshund Sweatshirt, Dog Mom Gift, Comfort Colors 1566", tags: Array.from({ length: 13 }, (_, i) => `tag${i}`), previewUrl: art("Dachshund") },
  { id: "b", name: "paws.png", title: "My Best Friend Has Paws Sweatshirt, Dog Lover Gift", tags: Array.from({ length: 13 }, (_, i) => `tag${i}`), previewUrl: art("Paws") },
  { id: "c", name: "corgi.png", title: "Corgi Mom Crewneck", tags: Array.from({ length: 12 }, (_, i) => `tag${i}`), previewUrl: art("Corgi") }
];
process.stdout.write((0, import_server.renderToStaticMarkup)(
  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    FinalListingReview,
    {
      drafts,
      files,
      selections: { p1: [0, 1], p2: [0, 1], p3: [0] },
      defaultIndices: [0, 1],
      preparedMockupCounts: { p1: 6, p2: 6, p3: 5 },
      batchSizeGuide: "size-guide.png",
      productName: "Unisex Garment-Dyed Sweatshirt",
      onEdit: () => {
      }
    }
  )
));
