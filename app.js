/* INVIMA & Multi-Registry Clinical Studies Dashboard Engine - DuckDB WASM + Parquet */

document.addEventListener('DOMContentLoaded', async () => {

  // DuckDB WASM Engine State
  let duckdbEngine = null;
  let duckdbConn = null;
  let isDuckDBReady = false;

  // Initialize DuckDB WASM in background Web Worker
  (async function initDuckDB() {
    try {
      const duckdb = await import('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm');
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
      );

      const worker = new Worker(worker_url);
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
      duckdbEngine = new duckdb.AsyncDuckDB(logger, worker);
      await duckdbEngine.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(worker_url);

      duckdbConn = await duckdbEngine.connect();
      isDuckDBReady = true;
      console.log('DuckDB WASM Engine initialized successfully! High-performance Parquet mode enabled.');
    } catch (err) {
      console.warn('Aviso: DuckDB WASM no pudo inicializarse, usando modo JSON perezoso:', err);
      isDuckDBReady = false;
    }
  })();

  // Registry Dataset Mapping (Parquet + Lazy JSON Loader)
  const registryMap = {
    invima: {
      name: 'INVIMA Colombia',
      subtitle: 'Instituto Nacional de Vigilancia de Medicamentos y Alimentos (Colombia)',
      parquet: 'invima.parquet',
      files: ['invima_estudios_clinicos.json'],
      defaultCount: 1150,
      data: null
    },
    clinicaltrials: {
      name: 'ClinicalTrials.gov',
      subtitle: 'National Institutes of Health / NLM (EEUU & Global)',
      parquet: 'clinicaltrials.parquet',
      files: ['clinicaltrials_gov.json'],
      defaultCount: 463287,
      data: null
    },
    euctr: {
      name: 'EU Clinical Trials',
      subtitle: 'European Medicines Agency / EudraCT (Unión Europea)',
      parquet: 'euctr.parquet',
      files: ['eu_clinicaltrials.json'],
      defaultCount: 500,
      data: null
    },
    anvisa: {
      name: 'ANVISA Brasil',
      subtitle: 'Agência Nacional de Vigilância Sanitária (Brasil)',
      parquet: 'anvisa.parquet',
      files: ['anvisa_brasil.json'],
      defaultCount: 4669,
      data: null
    },
    cofepris: {
      name: 'COFEPRIS México',
      subtitle: 'Comisión Federal para la Protección contra Riesgos Sanitarios (México)',
      parquet: 'cofepris.parquet',
      files: ['cofepris_mexico.json'],
      defaultCount: 5568,
      data: null
    },
    paho: {
      name: 'OPS / PAHO Américas',
      subtitle: 'Portal de Ensayos Clínicos de las Américas (OPS / OMS ICTRP)',
      parquet: 'paho.parquet',
      files: ['paho_americas.json'],
      defaultCount: 214,
      data: null
    },
    rec_gaico: {
      name: 'REC GAICO',
      subtitle: 'Registro de Ensayos Clínicos en Oncología y Salud (ANMAT / REC)',
      parquet: 'rec_gaico.parquet',
      files: ['rec_gaico.json'],
      defaultCount: 421,
      data: null
    },
    anmat: {
      name: 'ANMAT Argentina',
      subtitle: 'Base de Datos de Estudios de Farmacología Clínica',
      parquet: 'anmat.parquet',
      files: ['anmat_argentina.json'],
      defaultCount: 1862,
      data: null
    },
    oms: {
      name: 'OMS Global',
      subtitle: 'Base de datos ICTRP (>=2012)',
      parquet: 'oms.parquet',
      files: ['oms_part1.json', 'oms_part2.json', 'oms_part3.json', 'oms_part4.json'],
      defaultCount: 349479,
      data: null
    }
  };

  // Active State
  let activeRegistryKey = 'invima';
  let rawStudies = [];
  let filteredStudies = [];

  // Loading Overlay DOM Helper
  let loadingOverlay = document.querySelector('.data-loading-overlay');
  if (!loadingOverlay) {
    loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'data-loading-overlay';
    loadingOverlay.innerHTML = `
      <div class="loading-spinner"></div>
      <div class="loading-title" id="loading-title">Cargando Registro...</div>
      <div class="loading-subtitle" id="loading-subtitle">Descargando datos estructurados JSON</div>
    `;
    document.body.appendChild(loadingOverlay);
  }

  function showLoading(title, subtitle) {
    const t = document.getElementById('loading-title');
    const s = document.getElementById('loading-subtitle');
    if (t) t.textContent = title;
    if (s) s.textContent = subtitle;
    loadingOverlay.classList.add('active');
  }

  function hideLoading() {
    loadingOverlay.classList.remove('active');
  }

  const CDN_BASE_URL = 'https://cdn.jsdelivr.net/gh/CamiloQ/dashboard-gic-pecet@main/data/';

  async function fetchJsonFile(filename) {
    const isLocal = window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const primaryUrl = isLocal ? `data/${filename}` : `${CDN_BASE_URL}${filename}`;
    const fallbackUrl = `data/${filename}`;

    try {
      const res = await fetch(primaryUrl);
      if (res.ok) return await res.json();
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.warn(`Aviso: Falló origen (${primaryUrl}), intentando fallback local (${fallbackUrl})...`, err);
      const fallbackRes = await fetch(fallbackUrl);
      if (!fallbackRes.ok) throw new Error(`HTTP ${fallbackRes.status} al cargar ${fallbackUrl}`);
      return await fallbackRes.json();
    }
  }

  // Fetch Dataset On-Demand with RAM Caching (0ms Tab Switching)
  async function ensureRegistryLoaded(regKey) {
    const reg = registryMap[regKey];
    if (!reg) return [];

    // Instant RAM Cache Return: Zero Overlay, Zero Network Delay
    if (reg.data && Array.isArray(reg.data) && reg.data.length > 0) {
      return reg.data;
    }

    showLoading(`Cargando ${reg.name}...`, `Procesando estudios clínicos con DuckDB Engine`);

    // Primary: DuckDB WASM Parquet Engine Query via registerFileURL
    if (isDuckDBReady && duckdbEngine && duckdbConn && reg.parquet) {
      try {
        const isLocal = window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const parquetUrl = isLocal ? `data/${reg.parquet}` : `${CDN_BASE_URL}${reg.parquet}`;
        
        await duckdbEngine.registerFileURL(reg.parquet, parquetUrl, 4, false);
        const res = await duckdbConn.query(`SELECT * FROM '${reg.parquet}'`);
        reg.data = res.toArray().map(row => row.toJSON());
        console.log(`[DuckDB WASM] Carga exitosa de ${reg.parquet}: ${reg.data.length} registros.`);
        hideLoading();
        return reg.data;
      } catch (parquetErr) {
        console.warn(`[DuckDB WASM] Falló consulta Parquet para ${reg.parquet}, derivando a JSON:`, parquetErr);
      }
    }

    try {
      const firstChunk = await fetchJsonFile(reg.files[0]);
      reg.data = [...firstChunk];
      hideLoading();

      // Progressive Background Streaming for Multi-part Datasets
      if (reg.files.length > 1) {
        (async () => {
          for (let i = 1; i < reg.files.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 50));
            try {
              const nextChunk = await fetchJsonFile(reg.files[i]);
              reg.data = reg.data.concat(nextChunk);
              
              if (activeRegistryKey === regKey) {
                rawStudies = reg.data;
                filteredStudies = [...rawStudies];
                populateFilterOptions();
                updateDashboard();
                updateGlobalBadges();
              }
            } catch (chunkErr) {
              console.warn(`Aviso: Error en fragmento ${reg.files[i]}:`, chunkErr);
            }
          }
        })();
      }
    } catch (err) {
      console.error(`Error al cargar registro ${regKey}:`, err);
      reg.data = [];
      hideLoading();
    }

    return reg.data;
  }

  // Pagination & Sorting State
  let currentPage = 1;
  let pageSize = 25;
  let sortColumn = 'fecha_radicacion';
  let sortDirection = 'desc';

  // Chart Instances
  let chartStatusInstance = null;
  let chartSpecialtiesInstance = null;
  let chartSponsorsInstance = null;
  let chartPhaseInstance = null;

  // DOM Elements
  const registryTabs = document.querySelectorAll('.registry-tab');
  const filtersHeaderTitle = document.getElementById('filters-header-title');
  const tableHeaderTitle = document.getElementById('table-header-title');
  const chartSpecialtiesTitle = document.getElementById('chart-specialties-title');

  const filterSpecialty = document.getElementById('filter-specialty');
  const filterSponsor = document.getElementById('filter-sponsor');
  const filterStatus = document.getElementById('filter-status');
  const filterPhase = document.getElementById('filter-phase');
  const filterYear = document.getElementById('filter-year');
  const searchInput = document.getElementById('search-input');

  const btnClearFilters = document.getElementById('btn-clear-filters');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const selectPageSize = document.getElementById('select-page-size');

  const kpiTotal = document.getElementById('kpi-total');
  const kpiActive = document.getElementById('kpi-active');
  const kpiSponsors = document.getElementById('kpi-sponsors');
  const kpiSpecialties = document.getElementById('kpi-specialties');
  const filteredCountBadge = document.getElementById('filtered-count-badge');

  const tableBody = document.getElementById('table-body');
  const paginationText = document.getElementById('pagination-text');
  const paginationButtons = document.getElementById('pagination-buttons');

  // Modal References
  const detailModal = document.getElementById('detail-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  // Expanded Stats Elements
  const expandedStatsPanel = document.getElementById('expanded-stats-panel');
  const expandedSpecialtyName = document.getElementById('expanded-specialty-name');
  const expandedTopSponsors = document.getElementById('expanded-top-sponsors');
  const expandedTopPhases = document.getElementById('expanded-top-phases');

  // Current page slice reference for modal popups
  let currentPageSlice = [];

  // Initialize Application
  initRegistryData();
  setupEventListeners();

  async function initRegistryData() {
    rawStudies = await ensureRegistryLoaded(activeRegistryKey);
    filteredStudies = [...rawStudies];

    // Reset Filters to 'all' and clear search
    filterSpecialty.value = 'all';
    filterSponsor.value = 'all';
    filterStatus.value = 'all';
    filterPhase.value = 'all';
    filterYear.value = 'all';
    searchInput.value = '';

    // Update Section Titles dynamically
    const regName = registryMap[activeRegistryKey].name;
    filtersHeaderTitle.textContent = `Filtros de Selección Multidimensional (${regName})`;
    tableHeaderTitle.textContent = `Tabla de Estudios y Desglose Normativo (${regName})`;
    if (chartSpecialtiesTitle) {
      chartSpecialtiesTitle.textContent = `Especialidades médicas relevantes (${regName})`;
    }

    populateFilterOptions();
    sortFilteredStudies();
    updateDashboard();
    // Update global search badges
    updateGlobalBadges();
  }

  // Multi-Registry Tab Handler
  registryTabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      const regKey = tab.getAttribute('data-registry');
      if (regKey && regKey !== activeRegistryKey) {
        registryTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        activeRegistryKey = regKey;
        currentPage = 1;
        
        // Preserve global search query when switching tabs
        const currentQuery = searchInput.value;
        await initRegistryData();
        searchInput.value = currentQuery;
        if (currentQuery) {
          applyFilters();
        }
      }
    });
  });

  function updateGlobalBadges(query = '') {
    const q = query.toLowerCase().trim();
    registryTabs.forEach(tab => {
      const regKey = tab.getAttribute('data-registry');
      const regData = registryMap[regKey]?.data || null;
      const badge = tab.querySelector('.registry-tab-badge');
      if (!badge) return;

      if (!regData) {
        if (!q) {
          const count = registryMap[regKey]?.defaultCount || (regKey === activeRegistryKey ? rawStudies.length : 0);
          badge.textContent = count.toLocaleString();
        }
        return;
      }

      if (!q) {
        badge.textContent = regData.length.toLocaleString();
        return;
      }

      const count = regData.filter(s => {
        const title = (s.titulo || '').toLowerCase();
        const radicado = (s.radicado || '').toLowerCase();
        const nct = (s.nct_id || '').toLowerCase();
        const kw = (s.palabra_clave || '').toLowerCase();
        const sponsor = (s.patrocinador_cro || s.patrocinador_tabla || '').toLowerCase();

        return title.includes(q) || radicado.includes(q) || nct.includes(q) || kw.includes(q) || sponsor.includes(q);
      }).length;

      badge.textContent = count.toLocaleString();
    });
  }

  // Populate Filter Dropdowns per Selected Registry
  function populateFilterOptions() {
    const specialtiesMap = {};
    const sponsorsMap = {};
    const statusMap = {};
    const phaseMap = {};
    const yearMap = {};

    rawStudies.forEach(s => {
      // Specialty
      const esp = s.especialidades || 'Medicina General y Otras Especialidades';
      esp.split(',').forEach(e => {
        const cleanE = e.trim();
        if (cleanE) specialtiesMap[cleanE] = (specialtiesMap[cleanE] || 0) + 1;
      });

      // Sponsor / CRO
      const sp = s.patrocinador_cro || s.patrocinador_tabla || 'Patrocinador Independiente';
      sponsorsMap[sp] = (sponsorsMap[sp] || 0) + 1;

      // Status
      const st = s.estado_operativo || s.estado_tabla || 'REGISTRADO / AUTORIZADO';
      statusMap[st] = (statusMap[st] || 0) + 1;

      // Phase
      const ph = s.fase_tabla || '-';
      phaseMap[ph] = (phaseMap[ph] || 0) + 1;

      // Year
      const rawDate = s.fecha_radicacion || s.fecha_acto_administrativo || '';
      let year = 'Desconocido';
      const yearMatch = rawDate.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        year = yearMatch[0];
      }
      yearMap[year] = (yearMap[year] || 0) + 1;
    });

    // Populate Selects
    populateSelect(filterSpecialty, specialtiesMap, 'Todas las Especialidades / Condiciones');
    populateSelect(filterSponsor, sponsorsMap, 'Todos los Patrocinadores / CROs');
    populateSelect(filterStatus, statusMap, 'Todos los Estados Operativos');
    populateSelect(filterPhase, phaseMap, 'Todas las Fases');
    populateSelect(filterYear, yearMap, 'Todos los Años');
  }

  function populateSelect(selectEl, dataMap, defaultText, maxOptions = 100) {
    selectEl.innerHTML = `<option value="all">${defaultText}</option>`;
    const sortedKeys = Object.keys(dataMap).sort((a, b) => dataMap[b] - dataMap[a]).slice(0, maxOptions);

    sortedKeys.forEach(key => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${key} (${dataMap[key].toLocaleString()})`;
      selectEl.appendChild(opt);
    });
  }

  // Setup Global Event Listeners
  function setupEventListeners() {
    [filterSpecialty, filterSponsor, filterStatus, filterPhase, filterYear].forEach(el => {
      el.addEventListener('change', () => {
        currentPage = 1;
        applyFilters();
      });
    });

    searchInput.addEventListener('input', debounce(() => {
      currentPage = 1;
      applyFilters();
      updateGlobalBadges(searchInput.value);
    }, 250));

    btnClearFilters.addEventListener('click', () => {
      filterSpecialty.value = 'all';
      filterSponsor.value = 'all';
      filterStatus.value = 'all';
      filterPhase.value = 'all';
      filterYear.value = 'all';
      searchInput.value = '';
      currentPage = 1;
      applyFilters();
    });

    selectPageSize.addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value);
      currentPage = 1;
      renderTable();
    });

    btnExportCsv.addEventListener('click', exportToCsv);

    // Table Header Sorting
    document.querySelectorAll('#studies-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-sort');
        if (sortColumn === col) {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          sortColumn = col;
          sortDirection = 'desc';
        }
        sortFilteredStudies();
        renderTable();
      });
    });

    // Modal Close
    modalCloseBtn.addEventListener('click', closeModal);
    detailModal.addEventListener('click', (e) => {
      if (e.target === detailModal) closeModal();
    });
  }

  // Filter Matching
  function applyFilters() {
    const selEsp = filterSpecialty.value;
    const selSponsor = filterSponsor.value;
    const selStatus = filterStatus.value;
    const selPhase = filterPhase.value;
    const selYear = filterYear.value;
    const query = searchInput.value.toLowerCase().trim();

    filteredStudies = rawStudies.filter(s => {
      // Date Filter: <= 2026
      const currentYearNum = parseInt((s.fecha_radicacion || s.año || '').toString().substring(0, 4)) || 0;
      if (currentYearNum > 2026) return false;

      if (selYear !== 'all') {
        const rawDate = s.fecha_radicacion || s.fecha_acto_administrativo || '';
        let extractedYear = 'Desconocido';
        const yearMatch = rawDate.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) extractedYear = yearMatch[0];
        if (extractedYear !== selYear) return false;
      }

      // Specialty Filter
      if (selEsp !== 'all') {
        const esp = (s.especialidades || '').toLowerCase();
        if (!esp.includes(selEsp.toLowerCase())) return false;
      }

      // Sponsor Filter
      if (selSponsor !== 'all') {
        const sp = s.patrocinador_cro || s.patrocinador_tabla || '';
        if (sp !== selSponsor) return false;
      }

      // Status Filter
      if (selStatus !== 'all') {
        const st = s.estado_operativo || s.estado_tabla || '';
        if (st !== selStatus) return false;
      }

      // Phase Filter
      if (selPhase !== 'all') {
        const ph = s.fase_tabla || '-';
        if (ph !== selPhase) return false;
      }

      // Search Query Filter
      if (query) {
        const title = (s.titulo || '').toLowerCase();
        const radicado = (s.radicado || '').toLowerCase();
        const nct = (s.nct_id || '').toLowerCase();
        const kw = (s.palabra_clave || '').toLowerCase();
        const sponsor = (s.patrocinador_cro || s.patrocinador_tabla || '').toLowerCase();

        if (!title.includes(query) && !radicado.includes(query) && !nct.includes(query) && !kw.includes(query) && !sponsor.includes(query)) {
          return false;
        }
      }

      return true;
    });

    sortFilteredStudies();
    updateDashboard();
  }

  // Sort Filtered Studies
  function sortFilteredStudies() {
    filteredStudies.sort((a, b) => {
      let valA = a[sortColumn] || a['patrocinador_tabla'] || a['estado_tabla'] || '';
      let valB = b[sortColumn] || b['patrocinador_tabla'] || b['estado_tabla'] || '';

      if (sortColumn === 'fecha_radicacion') {
        const yearA = valA.toString().substring(0, 4);
        const yearB = valB.toString().substring(0, 4);
        if (yearA !== yearB) {
            return yearB.localeCompare(yearA); // Descending year
        }
        
        // Secondary sort: Activos/Reclutando first
        const statusA = (a.estado_operativo || a.estado_tabla || '').toUpperCase();
        const statusB = (b.estado_operativo || b.estado_tabla || '').toUpperCase();
        const isActiveA = statusA.includes('ACTIVO') || statusA.includes('RECLUTANDO') || statusA.includes('EN CURSO') ? 1 : 0;
        const isActiveB = statusB.includes('ACTIVO') || statusB.includes('RECLUTANDO') || statusB.includes('EN CURSO') ? 1 : 0;
        
        if (isActiveA !== isActiveB) return isActiveB - isActiveA;
        return 0; // Fallback
      }

      valA = valA.toString().toLowerCase();
      valB = valB.toString().toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // Update Dashboard Components
  function updateDashboard() {
    updateKpis();
    updateCharts();
    updateExpandedStats();
    renderTable();
  }

  function updateExpandedStats() {
    const selEsp = filterSpecialty.value;
    if (selEsp === 'all') {
      expandedStatsPanel.classList.remove('active');
      return;
    }
    
    expandedStatsPanel.classList.add('active');
    expandedSpecialtyName.textContent = selEsp;
    
    const sponsorCounts = {};
    const phaseCounts = {};
    
    filteredStudies.forEach(s => {
      const sp = s.patrocinador_cro || s.patrocinador_tabla || 'Patrocinador Independiente';
      sponsorCounts[sp] = (sponsorCounts[sp] || 0) + 1;
      
      const ph = s.fase_tabla || '-';
      phaseCounts[ph] = (phaseCounts[ph] || 0) + 1;
    });
    
    const topSponsors = Object.entries(sponsorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topPhases = Object.entries(phaseCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    
    expandedTopSponsors.innerHTML = topSponsors.length > 0 
      ? topSponsors.map(t => `<li><span>${escapeHtml(t[0].length > 40 ? t[0].substring(0, 38) + '...' : t[0])}</span><span style="font-weight:600; color:var(--accent-primary);">${t[1]}</span></li>`).join('')
      : `<li><span>Ninguno</span><span>0</span></li>`;
      
    expandedTopPhases.innerHTML = topPhases.length > 0 
      ? topPhases.map(t => `<li><span>${escapeHtml(t[0])}</span><span style="font-weight:600; color:var(--accent-primary);">${t[1]}</span></li>`).join('')
      : `<li><span>Ninguno</span><span>0</span></li>`;
  }

  // Update KPI Cards
  function updateKpis() {
    kpiTotal.textContent = filteredStudies.length.toLocaleString();
    filteredCountBadge.textContent = `${filteredStudies.length.toLocaleString()} / ${rawStudies.length.toLocaleString()}`;

    // Active count
    const activeCount = filteredStudies.filter(s => {
      const st = (s.estado_operativo || s.estado_tabla || '').toLowerCase();
      return (st.includes('activo') || st.includes('completed') || st.includes('recruiting') || st.includes('autorizado') || st.includes('registrado')) && !st.includes('no activo') && !st.includes('suspendido') && !st.includes('cancelado');
    }).length;
    kpiActive.textContent = activeCount.toLocaleString();

    // Unique Sponsors
    const sponsorsSet = new Set(filteredStudies.map(s => s.patrocinador_cro || s.patrocinador_tabla || 'Patrocinador Independiente'));
    kpiSponsors.textContent = sponsorsSet.size.toLocaleString();

    // Unique Specialties
    const specSet = new Set();
    filteredStudies.forEach(s => {
      (s.especialidades || 'Medicina General').split(',').forEach(e => {
        if (e.trim()) specSet.add(e.trim());
      });
    });
    kpiSpecialties.textContent = specSet.size.toLocaleString();
  }

  // Render Interactive Charts
  function updateCharts() {
    renderStatusChart();
    renderSpecialtiesChart();
    renderSponsorsChart();
    renderPhaseChart();
    renderCountriesTable();
  }

  function renderStatusChart() {
    const ctx = document.getElementById('chart-status').getContext('2d');
    const counts = {};

    filteredStudies.forEach(s => {
      const st = s.estado_operativo || s.estado_tabla || 'AUTORIZADO / REGISTRADO';
      counts[st] = (counts[st] || 0) + 1;
    });

    const labels = Object.keys(counts);
    const data = Object.values(counts);

    if (chartStatusInstance) chartStatusInstance.destroy();

    chartStatusInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
            '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
            '#14b8a6', '#d946ef', '#eab308', '#f43f5e', '#0ea5e9',
            '#22c55e', '#a855f7', '#facc15', '#fb923c', '#2dd4bf'
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#4b5563', font: { family: 'Inter', size: 11 } } }
        }
      }
    });
  }

  function normalizeCountryName(rawName) {
    if (!rawName) return 'No especificado';
    let name = rawName.trim();

    const mapping = {
      'United States': 'Estados Unidos',
      'United States of America': 'Estados Unidos',
      'USA': 'Estados Unidos',
      'United Kingdom': 'Reino Unido',
      'United Kingdom of Great Britain and Northern Ireland': 'Reino Unido',
      'Republic of Korea': 'Corea del Sur',
      'Korea, Republic of': 'Corea del Sur',
      'Korea, Democratic People\'s Republic of': 'Corea del Norte',
      'Democratic Republic of the Congo': 'RD del Congo',
      'Congo, The Democratic Republic of the': 'RD del Congo',
      'Russian Federation': 'Rusia',
      'Islamic Republic of Iran': 'Irán',
      'Iran, Islamic Republic of': 'Irán',
      'People\'s Republic of China': 'China',
      'Taiwan, Province of China': 'Taiwán',
      'Republic of Moldova': 'Moldavia',
      'Moldova, Republic of': 'Moldavia',
      'Syrian Arab Republic': 'Siria',
      'United Arab Emirates': 'Emiratos Árabes Unidos',
      'Tanzania, United Republic of': 'Tanzania',
      'Bolivia, Plurinational State of': 'Bolivia',
      'Venezuela, Bolivarian Republic of': 'Venezuela',
      'Viet Nam': 'Vietnam',
      'Czech Republic': 'República Checa',
      'Czechia': 'República Checa'
    };

    if (mapping[name]) return mapping[name];

    // Clean generic redundant prefixes
    name = name.replace(/^(Republic of|The Republic of|Kingdom of|State of|Federated States of)\s+/i, '');
    name = name.replace(/,\s*(Republic of|Plurinational State of|Bolivarian Republic of|Islamic Republic of)$/i, '');

    return name.trim() || rawName.trim();
  }

  function renderCountriesTable() {
    const bodyEl = document.getElementById('global-countries-body');
    const badgeEl = document.getElementById('countries-count-badge');
    if (!bodyEl) return;
    
    const countryCounts = {};
    let totalMentions = 0;

    filteredStudies.forEach(s => {
      const c = s.pais_origen || s.country || '';
      if (!c) return;
      
      const countries = c.split(/[,;]/).map(x => x.trim()).filter(x => x);
      countries.forEach(rawCountry => {
        const country = normalizeCountryName(rawCountry);
        countryCounts[country] = (countryCounts[country] || 0) + 1;
        totalMentions++;
      });
    });
    
    const sortedCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]);

    if (badgeEl) {
      badgeEl.textContent = `${sortedCountries.length.toLocaleString()} Países`;
    }

    if (sortedCountries.length === 0) {
      bodyEl.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted);">No hay información de países disponible para los filtros actuales.</td></tr>`;
      return;
    }

    const maxCount = sortedCountries[0][1];

    let html = '';
    sortedCountries.forEach(([country, count], idx) => {
      const pct = totalMentions > 0 ? ((count / totalMentions) * 100).toFixed(1) : '0.0';
      const relativeWidth = maxCount > 0 ? ((count / maxCount) * 100).toFixed(1) : '0';

      html += `
        <tr>
          <td class="country-rank">${idx + 1}</td>
          <td class="country-name" title="${escapeHtml(country)}">${escapeHtml(country)}</td>
          <td style="text-align: right;"><span class="country-count-badge">${count.toLocaleString()}</span></td>
          <td style="text-align: right; font-weight: 600; color: var(--text-muted);">${pct}%</td>
          <td>
            <div class="country-bar-container" title="${pct}% del total (${count.toLocaleString()} estudios)">
              <div class="country-bar-fill" style="width: ${relativeWidth}%;"></div>
            </div>
          </td>
        </tr>
      `;
    });

    bodyEl.innerHTML = html;
  }


  function renderSpecialtiesChart() {
    const ctx = document.getElementById('chart-specialties').getContext('2d');
    const counts = {};

    filteredStudies.forEach(s => {
      const esp = s.especialidades || 'Medicina General y Otras Especialidades';
      esp.split(',').forEach(e => {
        const clean = e.trim();
        if (clean) counts[clean] = (counts[clean] || 0) + 1;
      });
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const labels = sorted.map(t => t[0].length > 35 ? t[0].substring(0, 32) + '...' : t[0]);
    const data = sorted.map(t => t[1]);

    if (chartSpecialtiesInstance) chartSpecialtiesInstance.destroy();

    chartSpecialtiesInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Cantidad de Estudios',
          data: data,
          backgroundColor: 'rgba(192, 132, 252, 0.8)',
          borderColor: '#c084fc',
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#4b5563' }, grid: { color: 'rgba(0, 0, 0, 0.05)' } },
          y: { ticks: { color: '#1f2937', font: { size: 11 } }, grid: { display: false } }
        }
      }
    });
  }

  function renderSponsorsChart() {
    const ctx = document.getElementById('chart-sponsors').getContext('2d');
    const counts = {};

    filteredStudies.forEach(s => {
      const sp = s.patrocinador_cro || s.patrocinador_tabla || 'Patrocinador Independiente';
      counts[sp] = (counts[sp] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const labels = sorted.map(t => t[0].length > 35 ? t[0].substring(0, 32) + '...' : t[0]);
    const data = sorted.map(t => t[1]);

    if (chartSponsorsInstance) chartSponsorsInstance.destroy();

    chartSponsorsInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Estudios por Patrocinador',
          data: data,
          backgroundColor: 'rgba(244, 114, 182, 0.8)',
          borderColor: '#f472b6',
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#1f2937', font: { size: 10 }, maxRotation: 45 }, grid: { display: false } },
          y: { ticks: { color: '#4b5563' }, grid: { color: 'rgba(0, 0, 0, 0.05)' } }
        }
      }
    });
  }

  function renderPhaseChart() {
    const ctx = document.getElementById('chart-phase').getContext('2d');
    const counts = {};

    filteredStudies.forEach(s => {
      const ph = s.fase_tabla || '-';
      counts[ph] = (counts[ph] || 0) + 1;
    });

    const labels = Object.keys(counts);
    const data = Object.values(counts);

    if (chartPhaseInstance) chartPhaseInstance.destroy();

    chartPhaseInstance = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: [
            '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#10b981',
            '#3b82f6', '#f97316', '#ef4444', '#84cc16', '#6366f1',
            '#d946ef', '#14b8a6', '#f43f5e', '#eab308', '#0ea5e9',
            '#a855f7', '#22c55e', '#fb923c', '#facc15', '#2dd4bf'
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#4b5563', font: { family: 'Inter', size: 11 } } }
        }
      }
    });
  }

  // Render Data Table
  function renderTable() {
    const total = filteredStudies.length;
    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    currentPageSlice = filteredStudies.slice(start, end);

    if (currentPageSlice.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">No se encontraron estudios con los filtros seleccionados.</td></tr>`;
      paginationText.textContent = `Mostrando 0 - 0 de 0 estudios`;
      paginationButtons.innerHTML = '';
      return;
    }

    let html = '';
    currentPageSlice.forEach((s, idx) => {
      const statusText = s.estado_operativo || s.estado_tabla || 'AUTORIZADO / REGISTRADO';
      const statusBadge = getStatusBadgeHtml(statusText);
      const phaseBadge = s.fase_tabla && s.fase_tabla !== '-' ? `<span class="badge-fase">${s.fase_tabla}</span>` : `<span style="color: var(--text-dim);">-</span>`;
      
      const rad = s.radicado || s.nct_id || 'Sin id';
      const dateVal = s.fecha_radicacion || s.fecha_acto_administrativo || '-';
      const title = s.titulo || 'Sin título';
      const sponsor = s.patrocinador_cro || s.patrocinador_tabla || 'No reportado';
      const esp = s.especialidades || 'Medicina General y Otras Especialidades';

      html += `
        <tr data-index="${idx}">
          <td style="font-weight: 600; color: var(--accent-purple); white-space: nowrap;">${escapeHtml(rad)}</td>
          <td style="font-size: 0.825rem; color: var(--text-muted); white-space: nowrap;">${escapeHtml(dateVal)}</td>
          <td style="max-width: 380px; font-weight: 500;">
            <div style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;" title="${escapeHtml(title)}">
              ${escapeHtml(title)}
            </div>
          </td>
          <td style="max-width: 200px; color: var(--text-muted); font-size: 0.825rem;">${escapeHtml(sponsor)}</td>
          <td style="max-width: 180px; font-size: 0.825rem;">${escapeHtml(esp)}</td>
          <td style="white-space: nowrap; min-width: 120px;">${phaseBadge}</td>
          <td>${statusBadge}</td>
          <td style="text-align: center; white-space: nowrap;">
            <button class="btn-view-detail" data-index="${idx}">Ver Variables</button>
          </td>
        </tr>
      `;
    });

    tableBody.innerHTML = html;
    paginationText.textContent = `Mostrando ${start + 1} - ${end} de ${total.toLocaleString()} estudios`;

    // Row & Button click listeners using dataset index
    document.querySelectorAll('.btn-view-detail').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'));
        if (currentPageSlice[idx]) {
          openDetailModal(currentPageSlice[idx]);
        }
      });
    });

    document.querySelectorAll('#table-body tr').forEach(tr => {
      tr.addEventListener('click', () => {
        const idx = parseInt(tr.getAttribute('data-index'));
        if (currentPageSlice[idx]) {
          openDetailModal(currentPageSlice[idx]);
        }
      });
    });

    renderPaginationControls(total);
    const counterEl = document.getElementById('table-footer-counter');
    if (counterEl) {
      counterEl.textContent = `Total de datos: ${total.toLocaleString()}`;
    }
  }

  function getStatusBadgeHtml(statusText) {
    const stLower = statusText.toLowerCase();
    let badgeClass = 'badge-default';

    if (stLower.includes('activo') || stLower.includes('completed') || stLower.includes('recruiting') || stLower.includes('autorizado') || stLower.includes('registrado')) badgeClass = 'badge-activo';
    else if (stLower.includes('cerrado') || stLower.includes('completado') || stLower.includes('terminated')) badgeClass = 'badge-cerrado';
    else if (stLower.includes('no activo') || stLower.includes('suspendido') || stLower.includes('cancelado') || stLower.includes('withdrawn')) badgeClass = 'badge-no-activo';

    return `<span class="badge-status ${badgeClass}">${escapeHtml(statusText)}</span>`;
  }

  function renderPaginationControls(total) {
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) {
      paginationButtons.innerHTML = '';
      return;
    }

    let buttonsHtml = '';
    
    // Prev Button
    buttonsHtml += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} id="btn-prev-page">Anterior</button>`;

    // Page numbers display
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

    for (let p = startPage; p <= endPage; p++) {
      buttonsHtml += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }

    // Next Button
    buttonsHtml += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} id="btn-next-page">Siguiente</button>`;

    paginationButtons.innerHTML = buttonsHtml;

    // Listeners
    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');

    if (btnPrev) btnPrev.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTable(); } });
    if (btnNext) btnNext.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; renderTable(); } });

    document.querySelectorAll('.page-btn[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = parseInt(btn.getAttribute('data-page'));
        renderTable();
      });
    });
  }

  // Open 13 Regulatory Variables Modal Drawer
  function openDetailModal(s) {
    document.getElementById('modal-study-title').textContent = s.titulo || 'Estudio sin título';
    document.getElementById('modal-radicado-text').textContent = s.radicado || s.nct_id || 'Sin identificador';
    document.getElementById('modal-fase-badge').textContent = s.fase_tabla ? `Fase: ${s.fase_tabla}` : 'Fase no especificada';
    document.getElementById('modal-section-title').textContent = `Desglose Exhaustivo de Variables Normativas (${registryMap[activeRegistryKey].name})`;

    // Populate all 13 Regulatory Variables
    document.getElementById('var-radicado').textContent = s.radicado || s.nct_id || 'No reportado';
    document.getElementById('var-titulo').textContent = s.titulo || 'No reportado';
    document.getElementById('var-acta').textContent = s.acta || s.palabra_clave || 'No reportado';
    document.getElementById('var-estado-operativo').innerHTML = getStatusBadgeHtml(s.estado_operativo || s.estado_tabla || 'AUTORIZADO / REGISTRADO');
    document.getElementById('var-concepto-regulatorio').textContent = s.concepto_regulatorio || 'AUTORIZADO / REGISTRADO';
    document.getElementById('var-acto-admin').textContent = s.numero_acto_administrativo || s.nct_id || 'No reportado';
    document.getElementById('var-fecha-radicacion').textContent = s.fecha_radicacion || 'No reportada';
    document.getElementById('var-fecha-acto').textContent = s.fecha_acto_administrativo || 'No reportada';
    document.getElementById('var-especialidades').textContent = s.especialidades || 'Medicina General y Otras Especialidades';
    document.getElementById('var-patrocinador').textContent = s.patrocinador_cro || s.patrocinador_tabla || 'Patrocinador Independiente';
    
    // Var 11: NCT ID / EudraCT / ANMAT
    document.getElementById('var-nct-id').textContent = s.nct_id || s.radicado || 'No disponible';

    // Var 12: Primary Link & Secondary Registries
    const linkEl = document.getElementById('var-enlace-registro');
    const targetUrl = s.enlace_registro_primario || s.full_url;

    if (targetUrl && targetUrl.startsWith('http')) {
      let linkLabel = s.nct_id && s.nct_id.startsWith('NCT') ? `ClinicalTrials.gov (${s.nct_id})` : `Registro Oficial (${s.radicado || 'Enlace'})`;
      let extraLink = '';
      if (s.radicado && s.radicado.startsWith('REC-')) {
        const recNum = s.radicado.replace('REC-', '');
        extraLink = `<br><span style="font-size:0.8rem; color:var(--text-muted);">Enlace secundario REC GAICO (Puede estar inactivo o requerir login en su plataforma): </span><a href="https://www.registroensayosclinicos.org/estudio_rec/${recNum}" target="_blank" rel="noopener">Ficha REC GAICO #${recNum}</a>`;
      }
      linkEl.innerHTML = `<a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener">Ver Ficha en ${escapeHtml(linkLabel)}</a>${extraLink}`;
    } else {
      linkEl.textContent = targetUrl || 'No disponible';
    }

    // Var 13: Keywords / Country
    document.getElementById('var-palabra-clave').textContent = `${s.palabra_clave || 'Sin palabras clave'} | País: ${s.pais_origen || 'No especificado'}`;

    // Official URL footer box
    const officialUrlEl = document.getElementById('var-official-url');
    if (targetUrl && targetUrl.startsWith('http')) {
      officialUrlEl.innerHTML = `<a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener">${escapeHtml(targetUrl)}</a>`;
    } else {
      officialUrlEl.textContent = 'Enlace no disponible en registro de origen';
    }

    detailModal.classList.add('active');
  }

  function closeModal() {
    detailModal.classList.remove('active');
  }

  // Export Filtered Studies to CSV
  function exportToCsv() {
    if (filteredStudies.length === 0) {
      alert('No hay datos filtrados para exportar.');
      return;
    }

    const headers = [
      'Radicado/Protocolo', 'Título', 'Patrocinador/CRO', 'Especialidades', 
      'Fase', 'Estado Operativo', 'Fecha Radicación', 'Fecha Acto Admin', 
      'Número Acto Admin', 'Concepto Regulatorio', 'NCT/Registro ID', 'Enlace', 'País'
    ];

    const rows = filteredStudies.map(s => [
      s.radicado || '',
      s.titulo || '',
      s.patrocinador_cro || s.patrocinador_tabla || '',
      s.especialidades || '',
      s.fase_tabla || '',
      s.estado_operativo || s.estado_tabla || '',
      s.fecha_radicacion || '',
      s.fecha_acto_administrativo || '',
      s.numero_acto_administrativo || '',
      s.concepto_regulatorio || '',
      s.nct_id || '',
      s.enlace_registro_primario || s.full_url || '',
      s.pais_origen || ''
    ]);

    let csvContent = '\uFEFF' + headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';
    rows.forEach(r => {
      csvContent += r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Estudios_Clinicos_${activeRegistryKey}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Helper Functions
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

});
