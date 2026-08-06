# HostAfrica Backend Update Command

Run this on SSH for `backend.sunsparkelectricals.co.ke`:

```bash
cd ~/sunsparkbackend
bash docs/hostafrica-deploy.sh
```

On the first deploy and whenever `apps/api/package-lock.json` changes, the deployment script runs `npm install` before restarting the backend. No manual dependency-install flag is needed.

Uploaded product and category images are preserved in `~/sunsparkbackend-storage/uploads` before every Git update and restored into `apps/api/public/uploads` afterward. The uploads directory, dependency marker, and Passenger restart marker are ignored by Git.

```bash
cd ~/sunsparkbackend
RUN_SEED=1 bash docs/hostafrica-deploy.sh
```

On CloudLinux, if the dependency install fails, use the cPanel Node.js screen's **Run NPM Install** button for the `sunsparkbackend/apps/api` app, then run:

```bash
cd ~/sunsparkbackend
RUN_SEED=1 bash docs/hostafrica-deploy.sh
```

The backend `dist/` files are committed, so HostAfrica does not need TypeScript or `tsx` to build, migrate, or seed.

If the database already has the old Prisma tables and you want to copy those products/categories/users into the new backend tables, run this once:

```bash
cd ~/sunsparkbackend
RUN_LEGACY_IMPORT=1 bash docs/hostafrica-deploy.sh
```

Daily update after pushing code:

```bash
cd ~/sunsparkbackend
bash docs/hostafrica-deploy.sh
```

Backend cPanel Node app settings:

```text
Application root: sunspark/apps/api
Startup file: dist/server.js
Node: 20.x
App URL: backend.sunsparkelectricals.co.ke
```

Required backend `.env` in `~/sunspark/apps/api/.env`:

```text
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DATABASE"
PORT=4000
FRONTEND_ORIGIN="https://sunsparkelectricals.co.ke"
SESSION_SECRET="long-random-secret"
ADMIN_EMAIL="admin@sunsparkelectricals.co.ke"
ADMIN_PASSWORD="Password"
REPORT_EMAIL="sunsparkelectricalsandsolar@gmail.com"
SUPPORT_EMAIL="support@sunsparkelectricals.co.ke"
WHATSAPP_PHONE="254703586562"
```

Frontend Vercel env:

```text
NEXT_PUBLIC_API_URL="https://backend.sunsparkelectricals.co.ke"
API_INTERNAL_URL="https://backend.sunsparkelectricals.co.ke"
NEXT_PUBLIC_SITE_URL="https://sunsparkelectricals.co.ke"
SESSION_SECRET="same-long-random-secret"
```

There is no Prisma step. Use `npm run migrate` and `npm run seed` inside `apps/api`.
