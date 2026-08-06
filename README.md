# Sunspark Electrical and Solar

Modern Next.js e-commerce site for Sunspark Electrical and Solar.

## Stack

- Next.js + React + TypeScript frontend
- Express + MySQL/MariaDB backend in `apps/api`
- File uploads for product images
- Admin dashboard for products, categories, customers, orders, checkout settings

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

Admin login route:

```text
/admin/login
```

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

Each uploaded image must be JPEG, PNG, or WebP and below 2MB. Uploads are optimized before saving only when the same format produces a smaller file; failed or larger optimizations retain the original. SQL stores only image URLs, not binary image data.

On hosting, make sure the uploads directory is writable and backed up. For larger production scale, move uploads to object storage and keep the same URL-based database design.

To optimize existing product images in small, safe batches, run this from `apps/api` (default: 20, valid range: 1-100). It keeps private originals in `apps/api/private-backups/product-images` and atomically replaces only smaller files, without changing image URLs. Animated images are retained unchanged:

```bash
npm run images:optimize-existing -- --limit=20
```

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
