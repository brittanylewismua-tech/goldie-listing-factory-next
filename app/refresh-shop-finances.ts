export async function refreshShopFinances(request: typeof fetch = fetch) {
  const post = async (path: string) => {
    const response = await request(path, { method: "POST" });
    const body = await response.json().catch(() => ({})) as {
      error?: string; complete?: boolean; errors?: string[];
      ledger?: { windowsOutstanding?: number };
    };
    if (!response.ok || body.error) throw new Error(body.error || "Your numbers could not be refreshed. Try again.");
    return body;
  };
  let result;
  for (let pass = 0; pass < 4; pass += 1) {
    result = await post("/api/shop-map/financial/ingest?windows=25&receipts=40&orders=10");
    if (!result.complete) {
      if (Number(result.ledger?.windowsOutstanding) > 0 && !result.errors?.length) continue;
      throw new Error(result.errors?.[0] || "Some financial records could not be refreshed. Try again.");
    }
    await post("/api/shop-map/financial/reconcile");
    return;
  }
  throw new Error("More financial history needs to load. Refresh again to continue.");
}
