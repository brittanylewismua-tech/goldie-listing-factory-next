import { NextResponse } from "next/server";

const PRINTIFY_API = "https://api.printify.com/v1";
type Shop = { id: number; title: string };
type Product = { id: string; title: string; blueprint_id: number; print_provider_id: number; variants?: Array<{ is_enabled?: boolean }> };

async function printify<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${PRINTIFY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(response.status === 401 ? "Printify did not accept that token." : `Printify returned ${response.status}.`);
  return response.json() as Promise<T>;
}

function productIdFromUrl(value: string) {
  return (value.match(/\/editor\/([a-zA-Z0-9]+)/) || value.match(/\/products\/([a-zA-Z0-9]+)/))?.[1] ?? "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string; productUrl?: string };
    const token = body.token?.trim();
    if (!token) return NextResponse.json({ error: "Enter a Printify token." }, { status: 400 });
    const shops = await printify<Shop[]>("/shops.json", token);
    if (!body.productUrl) return NextResponse.json({ connected: true, shops: shops.map(({ id, title }) => ({ id, title })) });

    const productId = productIdFromUrl(body.productUrl.trim());
    if (!productId) return NextResponse.json({ error: "That is not a recognized Printify product-editor link." }, { status: 400 });

    let found: { shop: Shop; product: Product } | undefined;
    for (const shop of shops) {
      const response = await fetch(`${PRINTIFY_API}/shops/${shop.id}/products/${productId}.json`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" }, cache: "no-store",
      });
      if (response.ok) { found = { shop, product: (await response.json()) as Product }; break; }
    }
    if (!found) return NextResponse.json({ error: "This product was not found in any shop connected to that Printify account." }, { status: 404 });

    let provider = `Provider ${found.product.print_provider_id}`;
    try {
      const providers = await printify<Array<{ id: number; title: string }>>(`/catalog/blueprints/${found.product.blueprint_id}/print_providers.json`, token);
      provider = providers.find((item) => item.id === found!.product.print_provider_id)?.title ?? provider;
    } catch {}

    return NextResponse.json({ product: { id: found.product.id, title: found.product.title, provider, enabledVariants: found.product.variants?.filter((variant) => variant.is_enabled).length ?? 0, shop: found.shop.title } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Printify could not be reached." }, { status: 500 });
  }
}
