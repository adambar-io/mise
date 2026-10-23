# Mise

A free, no-account recipe keeper that runs as an installable web app (PWA). Static files only, hosted on GitHub Pages.

- **Import** from a link (schema.org Recipe data), via a bookmarklet, or by typing it in
- **Library** with search, tags, favorites, serving scaling (fractions handled)
- **Cook mode**: big text, tap steps to dim them, auto-detected timers (with sound/vibration), screen stays awake
- **Groceries**: add a recipe's scaled ingredients, check off, clear
- **Android share target**: share a recipe link from Chrome straight into Mise
- **Backup**: JSON export/import. Data lives in the browser's localStorage on each device

## Run locally

```
npx http-server -c-1 .
```

## Deploy (free)

1. Push to GitHub, then Settings → Pages → Source: **GitHub Actions**. The workflow in `.github/workflows/pages.yml` publishes on every push to `main`.
2. Link import needs a CORS proxy (browsers block cross-site fetches, and the public proxies are unreliable). Deploy the free Cloudflare Worker:
   ```
   cd worker && npx wrangler deploy
   ```
   Paste its URL in Mise → Settings. Without it, use the bookmarklet (works everywhere, including iPhone).

## Roadmap

- Sync across devices (private GitHub Gist or Cloudflare KV)
- Meal planner
- Photo scan of cookbook pages (Claude vision, bring-your-own key)
- Mela `.melarecipes` import
- Store photos on-device (currently hotlinked)
