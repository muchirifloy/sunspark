/**
 * Stale-while-revalidate for expensive reads.
 *
 * The admin dashboard asks for figures that are costly to produce - a scan of every
 * contact the shop holds, a round trip to Celcom for the credit balance - and then shows
 * them to somebody who is waiting. Recomputing those on every page view is what made the
 * tab slow to open.
 *
 * So: the first caller waits, and everyone after that is served the last known value
 * immediately. Once it passes `ttlMs` the next request still gets the cached copy at
 * once, and a refresh runs behind them for whoever comes next. Nobody waits on a number
 * that was already good enough a minute ago.
 *
 * Deliberately in-process and unbounded in age rather than a shared cache: these are a
 * handful of small values, one API instance serves them, and a figure that survives a
 * gateway outage is better than a blank one. Restarting the API clears it.
 */
const store = new Map();
export async function cached(key, ttlMs, load) {
    const entry = store.get(key);
    // Nothing to serve yet, so this caller has to wait for the real thing.
    if (!entry) {
        const value = await load();
        store.set(key, { value, storedAt: Date.now(), refreshing: false });
        return value;
    }
    const stale = Date.now() - entry.storedAt >= ttlMs;
    if (stale && !entry.refreshing) {
        entry.refreshing = true;
        // Not awaited: the point is that the caller does not pay for it. A failed refresh
        // leaves the previous value in place rather than replacing it with an error.
        void load()
            .then((value) => store.set(key, { value, storedAt: Date.now(), refreshing: false }))
            .catch((error) => {
            entry.refreshing = false;
            console.error(`Background refresh failed for ${key}`, error);
        });
    }
    return entry.value;
}
/** Drops a cached value so the next read recomputes it. Used after a send. */
export function invalidate(key) {
    store.delete(key);
}
