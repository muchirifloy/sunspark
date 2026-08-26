import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
function loadEnvFile(envPath) {
    if (!existsSync(envPath))
        return;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const separator = trimmed.indexOf("=");
        if (separator === -1)
            continue;
        const key = trimmed.slice(0, separator).trim();
        const raw = trimmed.slice(separator + 1).trim();
        const value = raw.replace(/^['"]|['"]$/g, "");
        if (key && process.env[key] === undefined)
            process.env[key] = value;
    }
}
/**
 * Where configuration comes from, in the order it wins.
 *
 *   1. Real environment variables. Nothing in a file ever overwrites one, because the
 *      host sets these - so in production cPanel's values win outright and the files
 *      below are only a fallback.
 *   2. apps/api/.env - this service's own settings. On the server that file holds the
 *      live database and mail credentials; on a developer machine it holds local ones.
 *   3. The repository root .env - shared values, and what a local run falls back to.
 *
 * Resolved relative to this module rather than to process.cwd(). Working-directory
 * paths meant `npm run api:dev` (which cds into apps/api) and `node apps/api/dist/
 * server.js` from the root loaded different files and therefore different databases -
 * the same command appearing to work or fail depending only on where it was typed.
 * `here` is apps/api/dist when built and apps/api/src under tsx, and the two paths
 * below are correct for both.
 */
const envFiles = [
    resolve(here, "../.env"),
    resolve(here, "../../../.env")
];
envFiles.forEach(loadEnvFile);
/**
 * Says which configuration is in force, without ever printing a credential.
 *
 * Answers "am I on the live database or my own?" at a glance, which is otherwise only
 * discoverable by causing an error and reading the stack trace.
 */
export function describeEnvironment() {
    const loaded = envFiles.filter((path) => existsSync(path));
    let database = "not configured";
    try {
        const url = new URL(process.env.DATABASE_URL ?? "");
        database = `${url.hostname}:${url.port || "3306"}/${url.pathname.replace(/^\//, "")}`;
    }
    catch {
        // A malformed or missing URL is reported by the pool itself, in detail.
    }
    return { loaded, database };
}
export function env(name, fallback = "") {
    return process.env[name] ?? fallback;
}
export function requireEnv(name) {
    const value = process.env[name];
    if (!value)
        throw new Error(`${name} is required`);
    return value;
}
export function boolEnv(name, fallback = false) {
    const value = process.env[name];
    if (!value)
        return fallback;
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
