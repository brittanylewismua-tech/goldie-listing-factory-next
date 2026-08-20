# Goldie Listing Factory — stack + repo reference

## Stack

TypeScript web app.

- **React 19**
- **Vinext** (Next.js-compatible framework)
- **Vite**
- **Cloudflare Workers** — runtime
- **Cloudflare D1** — account and workflow data
- **Cloudflare R2** — uploaded artwork
- **Supabase** — Google / email authentication
- **Stripe** — subscriptions
- **Printify API** and **Etsy API**
- **FAL** — lifestyle mockup generation

## Local project

```
/Users/owner/.codex/.chatgpt-projects/g-p-6886498bd45c8191920edc13b90b4244/goldie-listing-factory-next
```

Key files:

| Path | What's in it |
|---|---|
| `app/page.tsx` | The main workflow — all 9 steps |
| `app/approved-functional.css` | Styles |
| `app/api/` | API routes |

Production: https://thegoldiesuite.com/listing-factory

## Note on access

I can't reach that path from this session — it's outside the connected folder (which is currently the Bachelorette Tee Designs folder). To let me read and edit the code directly, connect that project folder to the session.

Separately: `/keyword-banks` 404s. The Keyword Banks page is actually served at **`/keywords`** — worth checking whether anything links to the wrong path.
