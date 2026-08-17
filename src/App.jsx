import React, { useState, useEffect } from 'react';
import { queryParquet, queryParquetAggregations } from './services/duckdbEngine';

const REGISTRIES = {
  invima: { name: 'INVIMA Colombia', subtitle: 'Instituto Nacional (Colombia)', parquet: 'invima.parquet', count: 1150 },
  clinicaltrials: { name: 'ClinicalTrials.gov', subtitle: 'NIH / NLM (Global)', parquet: 'clinicaltrials.parquet', count: 463287 },
  oms: { name: 'OMS Global', subtitle: 'Base de Datos ICTRP', parquet: 'oms.parquet', count: 349479 },
  anvisa: { name: 'ANVISA Brasil', subtitle: 'Vigilância Sanitária', parquet: 'anvisa.parquet', count: 4669 },
  cofepris: { name: 'COFEPRIS México', subtitle: 'Riesgos Sanitarios', parquet: 'cofepris.parquet', count: 5568 },
  anmat: { name: 'ANMAT Argentina', subtitle: 'Farmacología Clínica', parquet: 'anmat.parquet', count: 1862 },
  euctr: { name: 'EU Clinical Trials', subtitle: 'Registro Europeo (EMA)', parquet: 'euctr.parquet', count: 500 },
  paho: { name: 'OPS / PAHO', subtitle: 'Portal Américas', parquet: 'paho.parquet', count: 214 },
  rec_gaico: { name: 'REC GAICO', subtitle: 'Oncología y Salud', parquet: 'rec_gaico.parquet', count: 421 }
};

export default function App() {
  const [activeReg, setActiveReg] = useState('invima');
  const [loading, setLoading] = useState(false);
  const [studies, setStudies] = useState([]);
  const [totalCount, setTotalCount] = useState(REGISTRIES['invima'].count);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [aggregations, setAggregations] = useState(null);

  useEffect(() => {
    loadRegistryData(activeReg, page, search);
  }, [activeReg, page, search]);

  const loadRegistryData = async (regKey, currentPage, searchQuery) => {
    setLoading(true);
    try {
      const reg = REGISTRIES[regKey];
      let sqlWhere = '';
      if (searchQuery.trim()) {
        const q = searchQuery.trim().replace(/'/g, "''");
        sqlWhere = `(LOWER(titulo) LIKE '%${q.toLowerCase()}%' OR LOWER(patrocinador_cro) LIKE '%${q.toLowerCase()}%' OR LOWER(radicado) LIKE '%${q.toLowerCase()}%')`;
      }

      const offset = (currentPage - 1) * pageSize;
      const { rows, total } = await queryParquet(reg.parquet, sqlWhere, pageSize, offset);
      setStudies(rows);
      setTotalCount(total);

      // Load aggregations for charts in background
      queryParquetAggregations(reg.parquet).then(res => setAggregations(res)).catch(() => {});
    } catch (err) {
      console.error('Error loading registry data via DuckDB WASM:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#f8fafc', minHeight: '100vh', color: '#1e293b' }}>
      <header style={{ background: '#1e293b', color: '#ffffff', padding: '16px 24px' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>GIC-PECET • Inteligencia de Ensayos Clínicos</h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
          Motor Analítico DuckDB WASM • {totalCount.toLocaleString()} Estudios Encontrados
        </p>
      </header>

      {/* Registry Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '12px 24px', background: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
        {Object.entries(REGISTRIES).map(([key, reg]) => (
          <button
            key={key}
            onClick={() => { setActiveReg(key); setPage(1); }}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid ' + (activeReg === key ? '#2563eb' : '#cbd5e1'),
              background: activeReg === key ? '#eff6ff' : '#ffffff',
              color: activeReg === key ? '#1d4ed8' : '#475569',
              fontWeight: activeReg === key ? 600 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontSize: '0.82rem'
            }}
          >
            {reg.name} ({reg.count.toLocaleString()})
          </button>
        ))}
      </div>

      <main style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Search Bar */}
        <div style={{ marginBottom: '16px', display: 'flex', gap: '12px' }}>
          <input
            type="text"
            placeholder="Buscar por título, patrocinador o radicado..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.9rem'
            }}
          />
        </div>

        {/* Data Table Container */}
        <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', width: '120px' }}>Radicado</th>
                <th style={{ padding: '10px 12px' }}>Título del Estudio</th>
                <th style={{ padding: '10px 12px', width: '180px' }}>Patrocinador / CRO</th>
                <th style={{ padding: '10px 12px', width: '110px' }}>Fase</th>
                <th style={{ padding: '10px 12px', width: '120px' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                    Consultando Parquet vía DuckDB WASM Engine...
                  </td>
                </tr>
              ) : studies.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                    No se encontraron resultados para la consulta actual.
                  </td>
                </tr>
              ) : (
                studies.map((s, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: '#334155' }}>{s.radicado || s.nct_id}</td>
                    <td style={{ padding: '8px 12px' }}>{s.titulo}</td>
                    <td style={{ padding: '8px 12px', color: '#475569' }}>{s.patrocinador_cro || s.patrocinador_tabla}</td>
                    <td style={{ padding: '8px 12px', color: '#64748b' }}>{s.fase_tabla || 'N/A'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: '#e0f2fe',
                        color: '#0369a1'
                      }}>
                        {s.estado_operativo || 'REGISTRADO'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Página {page} de {Math.ceil(totalCount / pageSize)} • {totalCount.toLocaleString()} Registros
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', cursor: page === 1 ? 'not-allowed' : 'pointer' }}
              >
                Anterior
              </button>
              <button
                disabled={page * pageSize >= totalCount}
                onClick={() => setPage(p => p + 1)}
                style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', cursor: page * pageSize >= totalCount ? 'not-allowed' : 'pointer' }}
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
