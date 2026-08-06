export type ActionResult =
  | { ok: true; message: string; cartCount?: number; redirectTo?: string }
  | { ok: false; message: string };
