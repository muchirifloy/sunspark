# Sunspark Electrical and Solar

Modern Next.js e-commerce site for Sunspark Electrical and Solar.

## Stack

- Next.js + React + TypeScript frontend
- Express + MySQL/MariaDB backend in `apps/api`
- File uploads for product images
- Admin dashboard for products, categories, customers, orders, checkout settings
- Bulk SMS and email through Celcom Africa, with order texts sent automatically

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set the real values:

```bash
DATABASE_URL="database url"
SESSION_SECRET="use-a-long-random-secret"
NEXT_PUBLIC_SITE_URL="public url"
```

3. Prepare the backend database:

```bash
cd apps/api
npm install
npm run migrate
npm run seed
```

4. Run locally in two terminals:

```bash
npm run api:dev
npm run dev
```

Open `http://127.0.0.1:3000`.

## Admin

There is one login for everybody:

```text
/login
```

The role on the account decides where it ends: customers land in the storefront,
ADMIN and STAFF land in the dashboard. The destination is chosen server-side from the
role the API returns after checking the password, never from the form or the query
string, and a `next` asking for an admin page is discarded for anyone who is not staff.
`/admin/login` still forwards there for old bookmarks.

The public storefront does not link to admin. The setup seed creates:

```text
admin@sunsparkelectricals.co.ke
Password
```

Change this password before launch.

## Product Images

Product images upload to:

```text
public/uploads/products
```

Each uploaded image must be JPEG, PNG, or WebP and below 5MB. Uploads are downscaled so the longest edge is at most `IMAGE_MAX_DIMENSION` (default 1600px, which still covers a 2x display of the largest storefront layout) and then re-encoded. Images already within that size are only re-compressed, and are kept as-is when compression does not help. Animated images are retained unchanged. SQL stores only image URLs, not binary image data.

On hosting, make sure the uploads directory is writable and backed up. For larger production scale, move uploads to object storage and keep the same URL-based database design.

To optimize existing product images in small, safe batches, run this from `apps/api` (default: 20, valid range: 1-100). It keeps private originals in `apps/api/private-backups/product-images` and atomically replaces only smaller files, without changing image URLs. Animated images are retained unchanged:

```bash
npm run images:optimize-existing -- --limit=20
```

## Bulk SMS

Transactional texts go out automatically, with no admin action:

```text
Order placed (site or WhatsApp)  ->  "we have received your order"
Order moved to PROCESSING        ->  "your order is being processed"
Order moved to COMPLETED         ->  "your order is complete"
Walk-in sale completed           ->  "payment received, keep this as your receipt"
```

Every message ends with the shop phone number and website. A phone number is required
at checkout for this reason; it stays optional on a walk-in sale, where the text is
simply skipped if nobody left a number.

`/admin/sms` carries the credit balance, recharge details, the delivery log, and the
three send forms: bulk SMS, bulk email, and a single SMS. Bulk sends run in the
background and report progress in the campaign list, because a few hundred emails take
far longer than one request.

Celcom issues two sender IDs on one API key: one for transactional traffic and one for
promotional. The system picks between them from the kind of message being sent, and each
reads its own variable and only its own - there is no fallback between them and no
shared catch-all. With `CELCOM_SMS_SENDER_ID_PROMOTIONAL` unset, bulk and promotional
sends are refused rather than rerouted, while order texts carry on unaffected. Credentials live in
`apps/api/.env` only - see `apps/api/.env.example`. With none set, SMS is inert and
everything else keeps working.

## Split Deployment

Frontend:

```text
Deploy the root Next.js app to Vercel.
Set NEXT_PUBLIC_API_URL and API_INTERNAL_URL to https://backend.sunsparkelectricals.co.ke.
```

Backend:

```text
Host apps/api on HostAfrica at backend.sunsparkelectricals.co.ke.
Application root: sunspark/apps/api
Startup file: dist/server.js
```

Manual backend SSH deployment:

```bash
cd ~/sunspark
bash docs/hostafrica-deploy.sh
```

There is no Prisma command in this project.

Required environment variables on HostAfrica:

```text
DATABASE_URL
SESSION_SECRET
FRONTEND_ORIGIN
ADMIN_EMAIL
ADMIN_PASSWORD
REPORT_EMAIL
SUPPORT_EMAIL
WHATSAPP_PHONE
```

Optional, for bulk SMS:

```text
CELCOM_SMS_API_KEY
CELCOM_SMS_PARTNER_ID
CELCOM_SMS_SENDER_ID_TRANSACTIONAL
CELCOM_SMS_SENDER_ID_PROMOTIONAL
```

Leaving either sender ID empty disables that kind of traffic and nothing else.

## Verification

```bash
npm test
npm run build
npm run e2e
```

Current verified flows:

- Homepage categories and product rail
- Store page
- Cart
- Checkout
- Hidden admin login route
- Mobile and desktop no horizontal overflow
