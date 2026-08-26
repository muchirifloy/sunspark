/**
 * This route only forwards to /login, so the admin shell skeleton from the parent
 * segment would flash a sidebar that is never rendered on the way to a page in a
 * different segment entirely. Nothing is the better placeholder.
 */
export default function AdminLoginLoading() {
  return null;
}
