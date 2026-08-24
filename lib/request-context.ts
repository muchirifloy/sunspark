/**
 * Layouts and server components cannot read the current pathname, so the proxy
 * forwards it as a request header. Kept in its own module so neither side has to
 * import the other: proxy.ts is compiled for the proxy runtime, and pulling it
 * into a layout's module graph would drag that runtime along with it.
 */
export const pathnameHeader = "x-sunspark-pathname";

export function isAdminPath(pathname: string | null | undefined) {
  return (pathname ?? "").startsWith("/admin");
}
