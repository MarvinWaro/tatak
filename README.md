# Tatak

A free digital stamp card for coffee stalls. It replaces the paper loyalty card that runs out, gets lost, or tears.

- **Customer:** scans the shop's QR poster once, picks an order on their phone, and shows the screen to the barista.
- **Barista:** presses and holds **Hold to stamp** on the customer's phone. The order, items, date and time are saved and the stamps are added. With 10 stamps the customer gets a free coffee.
- **Admin:** menu, daily sales (per item, per hour, per day), order log with void, customers, settings, and a printable QR poster.

Everything runs on Cloudflare's free plan. The only thing you pay for is a domain, and you can skip that at first.

## Stack

| Part | What |
| --- | --- |
| Pages | React 19 + Vite, plain CSS (`src/styles.css`) |
| API | One Cloudflare Worker (`worker/`), a small router, Zod validation |
| Database | Cloudflare D1 (SQLite), raw SQL, ULID primary keys |
| Hosting | Cloudflare Workers with static assets |

Only `/api/*` runs the Worker. Page loads, JavaScript and CSS are static files, which Cloudflare serves free and unlimited.

## Run it on your laptop

You need Node.js 20 or newer.

```bash
npm install
npm run db:migrate:local   # creates the tables in a local database
npm run dev                # http://localhost:5173
```

Open http://localhost:5173, choose **Set up my shop**, add a few menu items, then open your customer link (`/s/your-shop`) in a second browser or a private window to act as a customer.

`npm run dev` runs the Worker and a local D1 database inside Vite, so there's nothing else to start.

## Deploy to Cloudflare (free)

```bash
npx wrangler login                 # opens the browser once
npx wrangler d1 create tatak       # prints a database_id
```

Paste the printed `database_id` into `wrangler.jsonc` (replace `REPLACE_WITH_YOUR_DATABASE_ID`), then:

```bash
npm run db:migrate:remote
npm run deploy
```

Your app is live at `https://tatak.<your-account>.workers.dev`.

**Custom domain (optional):** buy the domain in Cloudflare (Domain Registration), then go to Workers & Pages → tatak → Settings → Domains & Routes → Add → Custom domain. HTTPS is set up automatically. Print the QR poster *after* this, because the poster encodes the link it was printed from.

**Auto-deploy (optional):** in Workers & Pages → tatak → Settings → Builds, connect your GitHub repo. Every push to `main` then builds and deploys. Use `npm run build` as the build command and `npx wrangler deploy` as the deploy command.

## Free plan limits

The free plan resets daily at 00:00 UTC, which is 8:00 AM in Manila.

| Limit | Free plan | One stamped order uses about |
| --- | --- | --- |
| Worker requests | 100,000 / day | 2 to 4 |
| D1 rows written | 100,000 / day | 8 to 12 |
| D1 rows read | 5,000,000 / day | small |

That's room for roughly 8,000 stamped orders a day, so a busy stall with a few hundred uses a small slice. If the limit is ever reached, the app shows "Stamps work again after 8:00 AM" instead of an error page. The paid plan is US$5/month if you outgrow it.

## How the barista approval works (and its limit)

The barista approves by pressing and holding a button on the customer's own phone. That keeps the stall hardware-free, but a customer could press it themselves. These guards limit the damage, and all are in **Settings**:

- **Minutes between stamped orders** per card (default 10).
- **Most stamps per card per day** (default 5). Orders past the limit are still saved for sales, but get no extra stamps.
- **Opening hours**: stamps only work during the hours you set.
- **Void and pause**: every order shows in **Orders** with its time, so the barista can void a fake one (stamps come off) or pause a card in **Customers**.

Every order records `approved_via = 'tap'`. A PIN or NFC tap can be added later as another value without changing the database.

## Customer cards

- A card is created when the customer taps **Get my stamp card**. Their phone keeps a 16-character backup code; the server stores only its SHA-256 hash.
- On a new phone, the customer chooses **I already have a card on another phone** and types the backup code.
- The short code on the card (for example `K7Q4MZ`) is what the barista searches for in **Customers**.

## Project layout

```
migrations/0001_init.sql   database tables
shared/types.ts            API shapes used by both sides
worker/
  index.ts                 Worker entry and error handling
  router.ts                tiny path router
  auth.ts                  passwords (PBKDF2) and sessions
  views.ts                 row-to-API mapping, card view query
  routes/card.ts           customer: shop, card, order, redeem
  routes/auth.ts           sign up, log in, log out, password
  routes/admin.ts          settings, menu, customers
  routes/reports.ts        sales report, orders, CSV, void
src/
  pages/CustomerPage.tsx   the customer's card, order picker, barista screen
  pages/admin/*            Sales, Orders, Menu, Customers, Settings, Poster
  components/StampCard.tsx the yellow card with violet ink stamps
  components/HoldButton.tsx press-and-hold approval
```

## Notes

- Times are stored in UTC milliseconds; reports and opening hours use the shop's time zone (`Asia/Manila`).
- Money is stored in centavos. Order items copy the name and price at order time, so changing a price later doesn't change old reports.
- Passwords use PBKDF2-SHA256 with 20,000 iterations to stay inside the free plan's ~10 ms CPU per request. The iteration count is saved inside each hash, so you can raise `PBKDF2_ITERATIONS` in `worker/auth.ts` later without breaking old logins. Five wrong passwords lock the login for 10 minutes.
- The font is Archivo from Google Fonts. Without internet access to Google Fonts, the app falls back to the phone's system font.
- `npm run typecheck` checks both the app and the Worker.
