import "server-only";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canManageCatalog, canShop, canUseBackOffice } from "@/lib/auth/roles";

export async function requireCustomer(nextPath = "/account") {
  const session = await getSession();

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (!canShop(session.role)) {
    redirect("/admin");
  }

  return session;
}

export async function preventAdminShopping() {
  const session = await getSession();

  if (session && !canShop(session.role)) {
    redirect("/admin");
  }

  return session;
}

export async function requireAdmin(nextPath = "/admin") {
  const session = await getSession();

  if (!session || !canUseBackOffice(session.role)) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return session;
}

export async function requireOwnerAdmin(nextPath = "/admin") {
  const session = await requireAdmin(nextPath);

  if (!canManageCatalog(session.role)) {
    redirect("/admin?error=permission");
  }

  return session;
}
