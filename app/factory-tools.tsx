"use client";
import { useEffect, useState } from "react";

export type Pricing = { targetProfit: number; etsyFeePercent: number; fixedFee: number; listingFee: number; shippingCost: number; shippingCharged: number };
export type Recipe = { id: string; name: string; templateUrl: string; description: string; defaultTitle: string; defaultMockupTheme: string; pricing: Pricing };
export type KeywordList = { id: string; name: string; keywords: string[] };

export function SavedWorkflow({ templateUrl, description, defaultTitle, mockupTheme, pricing, onUseRecipe, onPricing, onMockupTheme }: { templateUrl: string; description: string; defaultTitle: string; mockupTheme: string; pricing: Pricing; onUseRecipe: (recipe: Recipe) => void; onPricing: (pricing: Pricing) => void; onMockupTheme: (value: string) => void }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]), [themes, setThemes] = useState<string[]>([]), [name, setName] = useState(""), [message, setMessage] = useState("");
  const reload = () => fetch("/api/product-recipes").then((r) => r.json()).then((r) => setRecipes(r.recipes || [])).catch(() => undefined);
  useEffect(() => { reload(); fetch("/api/mockups/library").then((r) => r.json()).then((r) => setThemes([...new Set((r.templates || []).map((t: { theme: string }) => t.theme))] as string[])).catch(() => undefined); }, []);
  async function save() {
    setMessage("");
    const response = await fetch("/api/product-recipes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, templateUrl, description, defaultTitle, defaultMockupTheme: mockupTheme, pricing }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setMessage(result.error || "Recipe could not be saved.");
    setName(""); setMessage("Recipe saved."); reload();
  }
  return <article className="step-card recipe-card"><div className="step-number">★</div><div className="step-content"><div className="step-heading"><div><p className="mini-label">PRODUCT RECIPES</p><h2>Start with a saved product recipe</h2></div></div><p className="step-copy">One click restores the Printify template, description, pricing rules, and default mockup set. You can still change anything for this batch.</p>
    <div className="recipe-grid">{recipes.map((recipe) => <button className="recipe-tile" key={recipe.id} onClick={() => onUseRecipe(recipe)}><b>{recipe.name}</b><span>{recipe.defaultMockupTheme || "No default mockup set"}</span><small>Use recipe →</small></button>)}{!recipes.length && <p className="empty-note">Your saved product recipes will live here.</p>}</div>
    <div className="recipe-builder"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this recipe (example: Bella Canvas 3001)"/><select value={mockupTheme} onChange={(e) => onMockupTheme(e.target.value)}><option value="">No default mockup set</option>{themes.map((theme) => <option key={theme}>{theme}</option>)}</select><button onClick={save} disabled={!name.trim() || !templateUrl.trim()}>Save current setup as recipe</button></div>
    <details className="pricing-box"><summary>Pricing rules for this recipe</summary><p>Set these once. Goldie calculates a different selling price for every Printify variant from that variant’s cost.</p><div className="pricing-grid">{([['targetProfit','Target profit'],['etsyFeePercent','Etsy fees %'],['fixedFee','Payment fixed fee'],['listingFee','Listing fee'],['shippingCost','Shipping cost'],['shippingCharged','Shipping charged']] as [keyof Pricing,string][]).map(([key,label]) => <label key={key}>{label}<input type="number" min="0" step="0.01" value={pricing[key]} onChange={(e) => onPricing({ ...pricing, [key]: Number(e.target.value) })}/></label>)}</div></details>{message && <p className="field-warning">{message}</p>}
  </div></article>;
}

export function KeywordBank({ onAdd }: { onAdd: (keyword: string) => void }) {
  const [lists, setLists] = useState<KeywordList[]>([]), [name, setName] = useState(""), [raw, setRaw] = useState(""), [active, setActive] = useState("");
  const reload = () => fetch("/api/keyword-lists").then((r) => r.json()).then((r) => setLists(r.lists || [])).catch(() => undefined);
  useEffect(reload, []);
  const words = raw.split(/[\n,;\t]+/).map((v) => v.trim()).filter(Boolean);
  async function save() { await fetch("/api/keyword-lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, keywords: words }) }); setName(""); setRaw(""); reload(); }
  const chosen = lists.find((list) => list.id === active);
  return <details className="keyword-bank"><summary>Keyword bank + eRank import</summary><p>Paste a column from eRank or import comma-separated phrases, name the list, and save it for future batches.</p><div className="keyword-save"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Keyword list name"/><textarea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Paste keywords or CSV here" rows={3}/><button disabled={!name.trim() || !words.length} onClick={save}>Save keyword list</button></div><select value={active} onChange={(e) => setActive(e.target.value)}><option value="">Choose a saved keyword list</option>{lists.map((list) => <option value={list.id} key={list.id}>{list.name}</option>)}</select>{chosen && <div className="keyword-chips">{chosen.keywords.map((word) => <button key={word} onClick={() => onAdd(word)}>+ {word}</button>)}</div>}</details>;
}
