import mariadb from "mariadb";
import { requireEnv } from "./env.js";

const databaseUrl = new URL(requireEnv("DATABASE_URL"));

export const pool = mariadb.createPool({
  host: databaseUrl.hostname,
  port: databaseUrl.port ? Number(databaseUrl.port) : 3306,
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: databaseUrl.pathname.replace(/^\//, ""),
  connectionLimit: Number(process.env.DB_POOL_SIZE ?? 5),
  allowPublicKeyRetrieval: true,
  timezone: "Z",
  // The driver's faithful SQL types are the wrong currency for a JSON API, and the
  // mismatch fails in two different ways - one loud, one silent.
  //
  // COUNT(*) arrives as a JavaScript bigint, which JSON.stringify refuses to serialize:
  // the route throws while building its response and the caller sees a 500, which is how
  // the admin customer list went blank. SUM() and DECIMAL arrive as strings, which is the
  // worse half - `a + b` concatenates instead of adding, so a total renders as "1234"
  // where 46 was meant and nothing anywhere reports an error.
  //
  // Both were being handled by wrapping individual reads in Number() at the call site,
  // which only holds until the next aggregate is written without one. Converting here
  // makes every read arrive as a number, so a forgotten wrapper cannot reintroduce it.
  //
  // Safe for this schema: money is stored as INT cents and the largest values are row
  // counts, all far below Number.MAX_SAFE_INTEGER.
  bigIntAsNumber: true,
  decimalAsNumber: true,
  insertIdAsNumber: true
});

export async function query<T = Record<string, unknown>>(sql: string, values: unknown[] = []) {
  const connection = await pool.getConnection();

  try {
    return (await connection.query(sql, values)) as T[];
  } finally {
    connection.release();
  }
}

export async function execute(sql: string, values: unknown[] = []) {
  const connection = await pool.getConnection();

  try {
    return connection.query(sql, values);
  } finally {
    connection.release();
  }
}

export async function transaction<T>(work: (connection: Awaited<ReturnType<typeof pool.getConnection>>) => Promise<T>) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
