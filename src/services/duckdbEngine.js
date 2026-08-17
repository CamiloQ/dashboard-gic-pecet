import * as duckdb from '@duckdb/duckdb-wasm';

let db = null;
let conn = null;
let isInit = false;

const CDN_BASE_URL = 'https://cdn.jsdelivr.net/gh/CamiloQ/dashboard-gic-pecet@main/data/';

export async function initDuckDB() {
  if (isInit) return conn;

  try {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

    const worker_url = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
    );

    const worker = new Worker(worker_url);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(worker_url);

    conn = await db.connect();
    isInit = true;
    console.log('[DuckDB WASM Engine] Successfully initialized.');
    return conn;
  } catch (err) {
    console.error('[DuckDB WASM Engine] Init failed:', err);
    throw err;
  }
}

export async function queryParquet(parquetName, sqlWhere = '', limit = 25, offset = 0) {
  await initDuckDB();
  const isLocal = window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const url = isLocal ? `data/${parquetName}` : `${CDN_BASE_URL}${parquetName}`;

  try {
    await db.registerFileURL(parquetName, url, duckdb.DuckDBDataProtocol.HTTP, false);
  } catch (e) {
    // Ignore if already registered
  }

  const whereClause = sqlWhere ? `WHERE ${sqlWhere}` : '';
  const sql = `SELECT * FROM '${parquetName}' ${whereClause} LIMIT ${limit} OFFSET ${offset}`;
  const countSql = `SELECT COUNT(*) as total FROM '${parquetName}' ${whereClause}`;

  const [res, countRes] = await Promise.all([
    conn.query(sql),
    conn.query(countSql)
  ]);

  const rows = res.toArray().map(r => r.toJSON());
  const total = Number(countRes.toArray()[0].total);

  return { rows, total };
}

export async function queryParquetAggregations(parquetName) {
  await initDuckDB();
  const isLocal = window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const url = isLocal ? `data/${parquetName}` : `${CDN_BASE_URL}${parquetName}`;

  try {
    await db.registerFileURL(parquetName, url, duckdb.DuckDBDataProtocol.HTTP, false);
  } catch (e) {
    // Ignore if already registered
  }

  const [statusRes, phaseRes, sponsorRes, countryRes] = await Promise.all([
    conn.query(`SELECT estado_operativo, COUNT(*) as count FROM '${parquetName}' GROUP BY estado_operativo ORDER BY count DESC LIMIT 10`),
    conn.query(`SELECT fase_tabla, COUNT(*) as count FROM '${parquetName}' GROUP BY fase_tabla ORDER BY count DESC LIMIT 10`),
    conn.query(`SELECT patrocinador_cro, COUNT(*) as count FROM '${parquetName}' GROUP BY patrocinador_cro ORDER BY count DESC LIMIT 10`),
    conn.query(`SELECT pais_origen, COUNT(*) as count FROM '${parquetName}' GROUP BY pais_origen ORDER BY count DESC LIMIT 50`)
  ]);

  return {
    status: statusRes.toArray().map(r => r.toJSON()),
    phases: phaseRes.toArray().map(r => r.toJSON()),
    sponsors: sponsorRes.toArray().map(r => r.toJSON()),
    countries: countryRes.toArray().map(r => r.toJSON())
  };
}
