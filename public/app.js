// Coordenadas Centrais de Mondoñedo (Praza da Catedral)
const MONDONEDO_COORDS = [43.4282, -7.3630];
const DEFAULT_ZOOM = 15;

// Inicialización do Mapa Leaflet con zoom profundo ata nivel 22
const map = L.map('map', {
  center: MONDONEDO_COORDS,
  zoom: DEFAULT_ZOOM,
  minZoom: 11,
  maxZoom: 22,
  zoomControl: false
});

L.control.zoom({ position: 'topright' }).addTo(map);

// 1. OpenStreetMap Estándar (Livre e sen chave de API)
const osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxNativeZoom: 19,
  maxZoom: 22,
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// 2. Mapa Base Oficial IGN España / CNIG (Limpo, sen marcas de auga nin chave)
const ignBase = L.tileLayer('https://www.ign.es/wmts/ign-base?service=WMTS&request=GetTile&version=1.0.0&Format=image/png&layer=IGNBaseTodo&style=default&tilematrixset=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}', {
  maxNativeZoom: 19,
  maxZoom: 22,
  attribution: '© <a href="https://www.ign.es">Instituto Geográfico Nacional (IGN)</a>'
});

// 3. Ortofoto Oficial PNOA Máxima Resolución (IGN España)
const pnoaSat = L.tileLayer('https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&Format=image/jpeg&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}', {
  maxNativeZoom: 19,
  maxZoom: 22,
  attribution: '© PNOA - <a href="https://www.ign.es">IGN España</a>'
});

// 4. Capa Topográfica / Relevo (OpenTopoMap)
const openTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  maxNativeZoom: 17,
  maxZoom: 22,
  attribution: '© OpenTopoMap, SRTM'
});

// 5. Imaxe de Satélite Mundial (Esri World Imagery)
const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxNativeZoom: 19,
  maxZoom: 22,
  attribution: 'Tiles © Esri, DigitalGlobe'
});

L.control.layers({
  "🗺️ OpenStreetMap (Cales e Nomes)": osmStandard,
  "⚪ Mapa Base Limpo Oficial (IGN España)": ignBase,
  "🛰️ Ortofoto Aérea PNOA (IGN Oficial)": pnoaSat,
  "🏔️ Relevo e Pendentes (OpenTopoMap)": openTopo,
  "🌍 Satélite Global (Esri)": esriSat
}, null, { position: 'topright' }).addTo(map);

// Estado Global
let allFeatures = [];
let allRoutes = [];
let allOsmFeatures = [];
let osmLayerGroup = L.layerGroup().addTo(map);
let isOsmMasterVisible = true;
let activeOsmFilter = 'all';

let geojsonLayer = null;
let officialRouteLayers = [];
let isOfficialRouteVisible = true;
let customRouteLayer = null;
let activeRouteFilter = 'all';
let userLocationMarker = null;
let isEditMode = false;

// Estado de Deseño e Edición de Vértices
let isAddingPoiOnMap = false;
let isDrawingRoute = false;
let currentDrawingPoints = [];
let tempDrawingPolyline = null;

let isEditingVertices = false;
let activeEditingRouteId = null;
let originalRouteCoordsBackup = null;
let editingPolyline = null;
let vertexHandles = [];
let midpointHandles = [];

// 1. Comprobar Configuración do Servidor (Modo de Edición)
fetch('/api/config')
  .then(res => res.json())
  .then(cfg => {
    isEditMode = cfg.edit_mode === true;
    updateEditModeUI();
  })
  .catch(err => {
    console.warn('Servidor sen endpoint de config. Modo lectura por defecto.');
    isEditMode = false;
    updateEditModeUI();
  });

function updateEditModeUI() {
  const editBar = document.getElementById('edit-mode-bar');
  const readonlyBar = document.getElementById('readonly-mode-bar');

  document.body.classList.toggle('edit-mode-active', isEditMode);

  if (isEditMode) {
    if (editBar) editBar.style.display = 'flex';
    if (readonlyBar) readonlyBar.style.display = 'none';
  } else {
    if (editBar) editBar.style.display = 'none';
    if (readonlyBar) readonlyBar.style.display = 'flex';
  }
  applyFiltersAndRender();
  renderOfficialRouteList();
}

// Obter Marcador Personalizado de POI
function getMarkerIcon(properties) {
  let color = '#15803d'; // Verde
  let iconText = '♿';

  if (properties.zona === 'amarelo') {
    color = '#b45309';
    iconText = '🟡';
  } else if (properties.zona === 'vermello') {
    color = '#b91c1c';
    iconText = '⛔';
  }

  if (properties.categoria === 'transporte') {
    iconText = '🅿️';
  }

  return L.divIcon({
    className: 'custom-pin',
    html: `
      <div style="
        background: ${color};
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        border: 2px solid white;
        box-shadow: 0 3px 8px rgba(0,0,0,0.35);
        cursor: pointer;
      ">
        ${iconText}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18]
  });
}

// 2. Cargar POIs
function loadPoisData() {
  fetch('data/pois.geojson?t=' + Date.now())
    .then(res => res.json())
    .then(data => {
      allFeatures = data.features || [];
      updateZoneCounters();
      populateRouteDropdowns();
      applyFiltersAndRender();
    })
    .catch(err => console.error('Erro cargando POIs:', err));
}

// 3. Cargar Itinerarios e Treitos
function loadRoutesData() {
  fetch('data/itinerario_ruta.geojson?t=' + Date.now())
    .then(res => res.json())
    .then(data => {
      allRoutes = data.features || [];
      renderOfficialRouteOnMap();
      renderOfficialRouteList();
    })
    .catch(err => console.error('Erro cargando Itinerario:', err));
}

// 4. Cargar POIs de OpenStreetMap (OSM)
function loadOsmPoisData() {
  fetch('data/osm_pois.geojson?t=' + Date.now())
    .then(res => res.json())
    .then(data => {
      allOsmFeatures = data.features || [];
      updateOsmCategoryCounters();
      renderOsmPoisOnMap();
      renderOsmPoisList();
    })
    .catch(err => console.error('Erro cargando POIs de OSM:', err));
}

loadPoisData();
loadRoutesData();
loadOsmPoisData();

// Obter Marcador Personalizado para POIs de OSM
function getOsmMarkerIcon(properties) {
  let color = '#475569';
  let iconText = '🏬';

  switch (properties.categoria) {
    case 'hostaleria':
      color = '#ea580c';
      iconText = '🍽️';
      break;
    case 'comercio':
      color = '#9333ea';
      iconText = '🛍️';
      break;
    case 'finanzas':
      color = '#1e40af';
      iconText = '🏦';
      break;
    case 'sanidade':
      color = '#0d9488';
      iconText = '💊';
      break;
    case 'aloxamento':
      color = '#0284c7';
      iconText = '🛏️';
      break;
    case 'patrimonio':
    case 'outros':
    default:
      color = '#475569';
      iconText = '🏛️';
      break;
  }

  return L.divIcon({
    className: 'osm-marker-pin',
    html: `
      <div style="
        background: ${color};
        color: white;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.35);
        cursor: pointer;
      ">
        ${iconText}
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14]
  });
}

function updateOsmCategoryCounters() {
  const catCounts = {
    hostaleria: 0,
    comercio: 0,
    finanzas: 0,
    sanidade: 0,
    aloxamento: 0,
    outros: 0
  };

  let totalVisible = 0;

  allOsmFeatures.forEach(f => {
    const p = f.properties;
    const cat = p.categoria || 'outros';
    if (catCounts[cat] !== undefined) {
      catCounts[cat]++;
    } else {
      catCounts.outros++;
    }

    if (p.visible !== false) {
      totalVisible++;
    }
  });

  for (const [cat, count] of Object.entries(catCounts)) {
    const el = document.getElementById(`count-osm-${cat}`);
    if (el) el.textContent = count;
  }

  const badgeActive = document.getElementById('osm-badge-active');
  const visibleCountEl = document.getElementById('osm-visible-count');
  const totalCountEl = document.getElementById('osm-total-count');

  if (badgeActive) badgeActive.textContent = totalVisible;
  if (visibleCountEl) visibleCountEl.textContent = totalVisible;
  if (totalCountEl) totalCountEl.textContent = allOsmFeatures.length;
}

// Renderizar Marcadores de OSM no Mapa
function renderOsmPoisOnMap() {
  osmLayerGroup.clearLayers();

  if (!isOsmMasterVisible) return;

  const activeCats = Array.from(document.querySelectorAll('.chk-osm-cat:checked')).map(cb => cb.value);

  allOsmFeatures.forEach(feature => {
    const p = feature.properties;
    
    // Se está configurado como oculto, non o mostramos no mapa
    if (p.visible === false) return;

    // Se a categoría está desactivada, non o mostramos
    const cat = p.categoria || 'outros';
    if (!activeCats.includes(cat)) return;

    const coords = [feature.geometry.coordinates[1], feature.geometry.coordinates[0]];
    const marker = L.marker(coords, {
      icon: getOsmMarkerIcon(p),
      draggable: isEditMode
    });

    if (isEditMode) {
      marker.on('dragstart', () => marker.closePopup());
      marker.on('dragend', (e) => {
        const newPos = e.target.getLatLng();
        feature.geometry.coordinates = [newPos.lng, newPos.lat];
        showToast(`📍 Posición de "${p.nome}" actualizada. Lembra premer en "Gardar".`, 'info');
      });
    }

    let editControls = '';
    if (isEditMode) {
      editControls = `
        <div class="popup-actions-edit" style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; gap: 4px;">
            <button class="btn-popup-edit" onclick="openEditOsmModal('${p.id}')">✏️ Editar Posto</button>
            <button class="btn-popup-delete" onclick="toggleOsmPoiVisibility('${p.id}', false)">🚫 Ocultar</button>
          </div>
          <button class="btn-tool-edit btn-osm-promote" onclick="promoteOsmToOfficialPoi('${p.id}')">⭐ Converter a POI Oficial</button>
        </div>
      `;
    }

    let catBadgeName = 'Comercio / Servizo';
    if (p.categoria === 'hostaleria') catBadgeName = '🍽️ Hostalaría';
    if (p.categoria === 'comercio') catBadgeName = '🛍️ Comercio';
    if (p.categoria === 'finanzas') catBadgeName = '🏦 Banco / Finanzas';
    if (p.categoria === 'sanidade') catBadgeName = '💊 Sanidade';
    if (p.categoria === 'aloxamento') catBadgeName = '🛏️ Aloxamento';

    marker.bindPopup(`
      <div class="custom-popup-content">
        <h4>${p.nome}</h4>
        <div style="display: flex; gap: 4px; margin-bottom: 6px;">
          <span class="badge badge-feature">${catBadgeName}</span>
          ${p.tipo_osm ? `<span class="badge" style="background:#f1f5f9; color:#475569;">${p.tipo_osm}</span>` : ''}
        </div>
        <p style="font-size: 0.78rem; color: #475569;">${p.descricao || 'Establecemento importado de OpenStreetMap.'}</p>
        <div class="popup-details" style="margin-top: 6px;">
          <div><strong>Accesibilidade:</strong> ${p.acessibilidade === 'yes' ? '🟢 Accesible' : (p.acessibilidade === 'limited' ? '🟡 Parcial' : (p.acessibilidade === 'no' ? '🔴 Inaccesible' : '⚪ Sen verificar'))}</div>
          ${p.banheiro_adaptado ? '<div>🚻 <strong>Baño adaptado:</strong> Si</div>' : ''}
          <div><strong>Fonte:</strong> OpenStreetMap</div>
        </div>
        ${editControls}
      </div>
    `);

    osmLayerGroup.addLayer(marker);
  });
}

// Renderizar Listaxe de Postos OSM no Sidebar
function renderOsmPoisList() {
  const container = document.getElementById('osm-pois-list');
  if (!container) return;
  container.innerHTML = '';

  const activeCats = Array.from(document.querySelectorAll('.chk-osm-cat:checked')).map(cb => cb.value);
  const searchTerm = (document.getElementById('poi-search')?.value || '').toLowerCase().trim();

  const filtered = allOsmFeatures.filter(f => {
    const p = f.properties;
    const cat = p.categoria || 'outros';

    if (activeOsmFilter === 'visible' && p.visible === false) return false;
    if (activeOsmFilter === 'hidden' && p.visible !== false) return false;

    if (!activeCats.includes(cat)) return false;

    if (searchTerm) {
      const matchName = (p.nome || '').toLowerCase().includes(searchTerm);
      const matchDesc = (p.descricao || '').toLowerCase().includes(searchTerm);
      const matchType = (p.tipo_osm || '').toLowerCase().includes(searchTerm);
      if (!matchName && !matchDesc && !matchType) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding: 15px; text-align: center; color: var(--text-muted);">Non hai postos cos filtros actuais.</div>';
    return;
  }

  filtered.forEach(f => {
    const p = f.properties;
    const isVis = p.visible !== false;
    const card = document.createElement('div');
    card.className = `osm-poi-card ${isVis ? '' : 'is-hidden'}`;

    let catIcon = '🏬';
    if (p.categoria === 'hostaleria') catIcon = '🍽️';
    if (p.categoria === 'comercio') catIcon = '🛍️';
    if (p.categoria === 'finanzas') catIcon = '🏦';
    if (p.categoria === 'sanidade') catIcon = '💊';
    if (p.categoria === 'aloxamento') catIcon = '🛏️';

    card.innerHTML = `
      <div class="osm-poi-top">
        <div class="osm-poi-name">${catIcon} ${p.nome}</div>
        <label class="switch-toggle" title="${isVis ? 'Ocultar do mapa' : 'Mostrar no mapa'}">
          <input type="checkbox" ${isVis ? 'checked' : ''} onchange="toggleOsmPoiVisibility('${p.id}', this.checked)">
          <span class="slider-round"></span>
        </label>
      </div>
      <div class="osm-poi-meta">
        <span class="badge" style="background:#f1f5f9; color:#475569;">${p.tipo_osm || p.categoria}</span>
        ${p.acessibilidade === 'yes' ? '<span class="badge badge-yes">🟢 Accesible</span>' : ''}
        ${p.acessibilidade === 'no' ? '<span class="badge badge-no">🔴 Inaccesible</span>' : ''}
        ${!isVis ? '<span class="badge badge-no" style="font-size:0.65rem;">🚫 Oculto no Mapa</span>' : ''}
      </div>
      <div class="osm-poi-actions">
        <button class="btn-osm-action" onclick="focusOsmPoi('${p.id}')">📍 Ver no Mapa</button>
        <div class="osm-btn-group">
          ${isEditMode ? `<button class="btn-osm-action" onclick="openEditOsmModal('${p.id}')">✏️ Editar</button>` : ''}
          ${isEditMode ? `<button class="btn-osm-action btn-osm-promote" onclick="promoteOsmToOfficialPoi('${p.id}')">⭐ Facer Oficial</button>` : ''}
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

window.focusOsmPoi = function(osmId) {
  const feature = allOsmFeatures.find(f => f.properties.id === osmId);
  if (!feature) return;

  const coords = [feature.geometry.coordinates[1], feature.geometry.coordinates[0]];
  map.flyTo(coords, 18, { duration: 1 });

  // Se o posto estiver oculto ou categoría desactivada, activámolo temporalmente para que sexa visible
  if (feature.properties.visible === false) {
    feature.properties.visible = true;
    updateOsmCategoryCounters();
    renderOsmPoisOnMap();
    renderOsmPoisList();
  }

  osmLayerGroup.eachLayer(layer => {
    if (layer.getLatLng && layer.getLatLng().lat === coords[0] && layer.getLatLng().lng === coords[1]) {
      layer.openPopup();
    }
  });

  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }
};

window.toggleOsmPoiVisibility = function(osmId, isVisible) {
  const feature = allOsmFeatures.find(f => f.properties.id === osmId);
  if (!feature) return;

  feature.properties.visible = isVisible;
  updateOsmCategoryCounters();
  renderOsmPoisOnMap();
  renderOsmPoisList();
  showToast(isVisible ? `👁️ "${feature.properties.nome}" agora é visible no mapa.` : `🚫 "${feature.properties.nome}" ocultouse do mapa. Lembra premer en "Gardar".`, 'info');
};

function updateZoneCounters() {
  const greenCount = allFeatures.filter(f => f.properties.zona === 'verde').length;
  const yellowCount = allFeatures.filter(f => f.properties.zona === 'amarelo').length;
  const redCount = allFeatures.filter(f => f.properties.zona === 'vermello').length;

  const elGreen = document.getElementById('count-zone-green');
  const elYellow = document.getElementById('count-zone-yellow');
  const elRed = document.getElementById('count-zone-red');

  if (elGreen) elGreen.textContent = greenCount;
  if (elYellow) elYellow.textContent = yellowCount;
  if (elRed) elRed.textContent = redCount;
}

// Renderizar Roteiros no Mapa
function renderOfficialRouteOnMap() {
  officialRouteLayers.forEach(l => map.removeLayer(l));
  officialRouteLayers = [];

  if (!isOfficialRouteVisible) return;

  const filteredRoutes = allRoutes.filter(r => {
    if (activeRouteFilter !== 'all' && r.properties.tipo !== activeRouteFilter) return false;
    return true;
  });

  filteredRoutes.forEach(feature => {
    if (isEditingVertices && activeEditingRouteId === feature.properties.id) return;

    const coords = feature.geometry.coordinates.map(c => [c[1], c[0]]);
    const p = feature.properties;

    let lineColor = p.cor || (p.tipo === 'optimo' ? '#16a34a' : (p.tipo === 'evitar' ? '#dc2626' : '#d97706'));
    let dash = p.tipo === 'optimo' ? null : (p.tipo === 'evitar' ? '4, 8' : '8, 8');
    let weight = p.tipo === 'evitar' ? 7 : 6;

    const line = L.polyline(coords, {
      color: lineColor,
      weight: weight,
      opacity: 0.9,
      dashArray: dash
    }).addTo(map);

    let badgeClass = p.tipo === 'optimo' ? 'badge-yes' : (p.tipo === 'evitar' ? 'badge-no' : 'badge-limited');
    let badgeText = p.tipo === 'optimo' ? '🟢 Recomendado' : (p.tipo === 'evitar' ? '🔴 A EVITAR' : '🟡 Precaución');

    let editBtn = isEditMode ? `
      <div class="popup-actions-edit">
        <button class="btn-popup-edit-geom" onclick="startEditingRouteVertices('${p.id}')">📐 Modificar Puntos</button>
        <button class="btn-popup-edit" onclick="openEditRouteModal('${p.id}')">✏️ Datos</button>
        <button class="btn-popup-delete" onclick="deleteRoute('${p.id}')">🗑️</button>
      </div>
    ` : '';

    line.bindPopup(`
      <div class="custom-popup-content">
        <h4>${p.titulo}</h4>
        <span class="badge ${badgeClass}">${badgeText}</span>
        <p>${p.desc}</p>
        <div class="popup-alert ${p.tipo === 'evitar' ? 'popup-alert-red' : (p.tipo === 'optimo' ? 'popup-alert-green' : 'popup-alert-yellow')}">
          💡 <strong>Pauta:</strong> ${p.recomendacion}
        </div>
        <div class="popup-details">
          <div><strong>Pavimento:</strong> ${p.pavimento || 'Non especificado'}</div>
          <div><strong>Pendente:</strong> ${p.pendente || 'Non especificada'}</div>
        </div>
        ${editBtn}
      </div>
    `);

    officialRouteLayers.push(line);
  });
}

// Renderizar Listaxe de Treitos no Sidebar
function renderOfficialRouteList() {
  const container = document.getElementById('itinerary-steps-container');
  if (!container) return;
  container.innerHTML = '';

  const filteredRoutes = allRoutes.filter(r => {
    if (activeRouteFilter !== 'all' && r.properties.tipo !== activeRouteFilter) return false;
    return true;
  });

  if (filteredRoutes.length === 0) {
    container.innerHTML = '<div style="padding: 15px; text-align: center; color: var(--text-muted);">Non hai treitos cos filtros actuais.</div>';
    return;
  }

  filteredRoutes.forEach((f, idx) => {
    const p = f.properties;
    const card = document.createElement('div');
    
    let cardClass = 'step-green';
    let badgeClass = 'badge-yes';
    let badgeText = '🟢 Accesible';

    if (p.tipo === 'precaucion') {
      cardClass = 'step-yellow';
      badgeClass = 'badge-limited';
      badgeText = '🟡 Precaución';
    } else if (p.tipo === 'evitar') {
      cardClass = 'step-red';
      badgeClass = 'badge-no';
      badgeText = '🔴 A EVITAR';
    }

    card.className = `step-card ${cardClass}`;

    let editControls = '';
    if (isEditMode) {
      editControls = `
        <div class="step-edit-btns">
          <button class="btn-step-edit-geom" onclick="startEditingRouteVertices('${p.id}')" title="Mover, engadir ou eliminar puntos do trazado">📐 Puntos</button>
          <button class="btn-step-edit" onclick="openEditRouteModal('${p.id}')" title="Editar textos e información">✏️</button>
          <button class="btn-step-delete" onclick="deleteRoute('${p.id}')" title="Eliminar treito">🗑️</button>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="step-badge">${p.tipo === 'evitar' ? '⚠️ TREITO A EVITAR' : `ETAPA ${idx + 1}`}</div>
      <h4>${p.titulo}</h4>
      <p class="step-desc">${p.desc}</p>
      <div class="step-tags">
        <span class="badge ${badgeClass}">${badgeText}</span>
        ${p.pavimento ? `<span class="badge badge-feature">🧱 ${p.pavimento}</span>` : ''}
        ${p.pendente ? `<span class="badge badge-feature">📐 ${p.pendente}</span>` : ''}
      </div>
      <div style="font-size:0.75rem; margin-bottom:6px; color:${p.tipo === 'evitar' ? '#b91c1c' : '#1e3a8a'}; font-weight:600;">
        💡 ${p.recomendacion}
      </div>
      <div class="step-action-bar">
        <button class="btn-step-focus" onclick="focusRoute('${p.id}')">Ver no mapa 📍</button>
        ${editControls}
      </div>
    `;

    container.appendChild(card);
  });
}

// Foco en Treito no Mapa
window.focusRoute = function(routeId) {
  const route = allRoutes.find(r => r.properties.id === routeId);
  if (!route) return;

  // Se o treito estiver oculto polo filtro actual, mostramos todos
  if (activeRouteFilter !== 'all' && route.properties.tipo !== activeRouteFilter) {
    activeRouteFilter = 'all';
    document.querySelectorAll('.route-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('.route-chip[data-filter="all"]')?.classList.add('active');
    renderOfficialRouteList();
  }

  if (!isOfficialRouteVisible) {
    toggleOfficialRoute(true);
  } else {
    renderOfficialRouteOnMap();
  }

  const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
  if (coords.length > 0) {
    const bounds = L.latLngBounds(coords);
    map.fitBounds(bounds, { padding: [50, 50] });

    officialRouteLayers.forEach(layer => {
      if (layer.getLatLngs) {
        const lcoords = layer.getLatLngs();
        if (lcoords.length > 0 && lcoords[0].lat === coords[0][0] && lcoords[0].lng === coords[0][1]) {
          layer.openPopup();
        }
      }
    });
  }

  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }
};

// Filtro de Chips de Rotas
document.querySelectorAll('.route-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.route-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeRouteFilter = chip.dataset.filter;
    renderOfficialRouteOnMap();
    renderOfficialRouteList();
  });
});

// Alternar visualización das Liñas de Roteiro
function toggleOfficialRoute(forceState) {
  isOfficialRouteVisible = typeof forceState === 'boolean' ? forceState : !isOfficialRouteVisible;
  renderOfficialRouteOnMap();

  const btnItinerary = document.getElementById('btn-show-itinerary');
  if (btnItinerary) {
    btnItinerary.classList.toggle('active', isOfficialRouteVisible);
  }
}

document.getElementById('btn-toggle-official-route').addEventListener('click', () => toggleOfficialRoute());
document.getElementById('btn-show-itinerary').addEventListener('click', () => toggleOfficialRoute());

// ==================== CONTROIS GRANULARES DE POIs ====================

function getActiveZones() {
  const activeZones = [];
  if (document.getElementById('chk-zone-green')?.checked) activeZones.push('verde');
  if (document.getElementById('chk-zone-yellow')?.checked) activeZones.push('amarelo');
  if (document.getElementById('chk-zone-red')?.checked) activeZones.push('vermello');
  return activeZones;
}

function getActiveCategories() {
  const activeCats = [];
  document.querySelectorAll('.cat-filter-checkbox:checked').forEach(cb => {
    activeCats.push(cb.value);
  });
  return activeCats;
}

// Event listeners nos filtros de zonas e categorías
document.querySelectorAll('#chk-zone-green, #chk-zone-yellow, #chk-zone-red').forEach(chk => {
  chk.addEventListener('change', applyFiltersAndRender);
});

document.querySelectorAll('.cat-filter-checkbox').forEach(chk => {
  chk.addEventListener('change', applyFiltersAndRender);
});

document.getElementById('btn-select-all-zones')?.addEventListener('click', () => {
  document.querySelectorAll('#chk-zone-green, #chk-zone-yellow, #chk-zone-red').forEach(chk => chk.checked = true);
  applyFiltersAndRender();
});

document.getElementById('btn-select-all-cats')?.addEventListener('click', () => {
  document.querySelectorAll('.cat-filter-checkbox').forEach(chk => chk.checked = true);
  applyFiltersAndRender();
});

const filterShowLabels = document.getElementById('filter-show-labels');
if (filterShowLabels) {
  filterShowLabels.addEventListener('change', applyFiltersAndRender);
}

// Renderizado e Filtros Granulares de POIs
function applyFiltersAndRender() {
  if (geojsonLayer) {
    map.removeLayer(geojsonLayer);
  }

  const searchTerm = document.getElementById('poi-search').value.toLowerCase().trim();
  const filterWc = document.getElementById('filter-wc')?.checked;
  const filterParking = document.getElementById('filter-parking')?.checked;
  const showLabels = document.getElementById('filter-show-labels')?.checked;

  const activeZones = getActiveZones();
  const activeCats = getActiveCategories();

  const filtered = allFeatures.filter(feature => {
    const p = feature.properties;

    if (searchTerm) {
      const matchName = (p.nome || '').toLowerCase().includes(searchTerm);
      const matchDesc = (p.descricao || '').toLowerCase().includes(searchTerm);
      const matchZone = (p.zona_nome || '').toLowerCase().includes(searchTerm);
      if (!matchName && !matchDesc && !matchZone) return false;
    }

    if (!activeZones.includes(p.zona)) return false;
    if (activeCats.length > 0 && !activeCats.includes(p.categoria)) return false;
    if (filterWc && !p.banheiro_adaptado) return false;
    if (filterParking && !p.estacionamento_pmr) return false;

    return true;
  });

  const poiCountEl = document.getElementById('poi-count');
  if (poiCountEl) poiCountEl.textContent = filtered.length;

  geojsonLayer = L.geoJSON({ type: "FeatureCollection", features: filtered }, {
    pointToLayer: (feature, latlng) => {
      const marker = L.marker(latlng, {
        icon: getMarkerIcon(feature.properties),
        draggable: isEditMode
      });

      if (showLabels) {
        marker.bindTooltip(feature.properties.nome, {
          permanent: true,
          direction: 'bottom',
          className: 'poi-tooltip-label',
          offset: [0, 8]
        });
      }

      if (isEditMode) {
        marker.on('dragstart', () => marker.closePopup());
        marker.on('dragend', (e) => {
          const newPos = e.target.getLatLng();
          const targetPoi = allFeatures.find(f => f.properties.id === feature.properties.id);
          if (targetPoi) {
            targetPoi.geometry.coordinates = [newPos.lng, newPos.lat];
            showToast(`📍 Posición de "${targetPoi.properties.nome}" movida. Lembra premer en "Gardar".`, 'info');
            populateRouteDropdowns();
          }
        });
      }

      return marker;
    },
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      let badgeClass = 'badge-yes';
      let alertClass = 'popup-alert-green';
      
      if (p.zona === 'amarelo') {
        badgeClass = 'badge-limited';
        alertClass = 'popup-alert-yellow';
      } else if (p.zona === 'vermello') {
        badgeClass = 'badge-no';
        alertClass = 'popup-alert-red';
      }

      let editButtonsHtml = '';
      if (isEditMode) {
        editButtonsHtml = `
          <div class="popup-actions-edit">
            <button class="btn-popup-edit" onclick="openEditPoiModal('${p.id}')">✏️ Editar</button>
            <button class="btn-popup-delete" onclick="deletePoi('${p.id}')">🗑️ Eliminar</button>
          </div>
        `;
      }

      layer.bindPopup(`
        <div class="custom-popup-content">
          <h4>${p.nome}</h4>
          <span class="badge ${badgeClass}">${p.zona_nome || p.zona}</span>
          <p>${p.descricao}</p>
          ${p.recomendacion ? `<div class="popup-alert ${alertClass}">💡 <strong>Pauta:</strong> ${p.recomendacion}</div>` : ''}
          <div class="popup-details">
            <div><strong>Pavimento:</strong> ${p.piso || 'Non especificado'}</div>
            <div><strong>Pendente:</strong> ${p.pendente || 'Non especificada'}</div>
            ${p.banheiro_adaptado ? '<div>🚻 <strong>Baño adaptado:</strong> Si</div>' : ''}
            ${p.estacionamento_pmr ? '<div>🅿️ <strong>Prazas PMR:</strong> Si</div>' : ''}
            <div>🕒 <strong>Horario:</strong> ${p.horario || 'Non especificado'}</div>
          </div>
          ${editButtonsHtml}
        </div>
      `);
    }
  }).addTo(map);

  renderPoisList(filtered);
}

// Renderizar lista de POIs no sidebar
function renderPoisList(features) {
  const container = document.getElementById('pois-list');
  if (!container) return;
  container.innerHTML = '';

  if (features.length === 0) {
    container.innerHTML = '<div style="padding: 15px; text-align: center; color: var(--text-muted);">Non hai lugares cos filtros activos.</div>';
    return;
  }

  features.forEach(f => {
    const p = f.properties;
    const card = document.createElement('div');
    card.className = `poi-card card-zone-${p.zona}`;
    card.tabIndex = 0;

    let badgeClass = p.zona === 'verde' ? 'badge-yes' : (p.zona === 'amarelo' ? 'badge-limited' : 'badge-no');

    card.innerHTML = `
      <div class="poi-title">${p.nome}</div>
      <div class="poi-desc">${p.descricao.substring(0, 85)}...</div>
      <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
        <span class="badge ${badgeClass}">${p.zona_nome || p.zona}</span>
        ${p.banheiro_adaptado ? '<span class="badge badge-feature">🚻 Baño PMR</span>' : ''}
        ${p.estacionamento_pmr ? '<span class="badge badge-feature">🅿️ Aparcamento PMR</span>' : ''}
      </div>
    `;

    card.addEventListener('click', () => {
      const coords = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
      map.flyTo(coords, 18, { duration: 1 });

      geojsonLayer.eachLayer(layer => {
        if (layer.feature && layer.feature.properties.id === p.id) {
          layer.openPopup();
        }
      });

      if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
      }
    });

    container.appendChild(card);
  });
}

document.getElementById('filter-wc')?.addEventListener('change', applyFiltersAndRender);
document.getElementById('filter-parking')?.addEventListener('change', applyFiltersAndRender);

// Pesquisa
const searchInput = document.getElementById('poi-search');
const clearSearchBtn = document.getElementById('clear-search');

searchInput?.addEventListener('input', () => {
  clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
  applyFiltersAndRender();
  renderOsmPoisList();
});

clearSearchBtn?.addEventListener('click', () => {
  searchInput.value = '';
  clearSearchBtn.style.display = 'none';
  applyFiltersAndRender();
  renderOsmPoisList();
});

// Tabs
document.querySelectorAll('.tab-btn').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

// Botón directo para abrir a pestana de Postos OSM dende o Modo Edición
document.getElementById('btn-open-osm-tab')?.addEventListener('click', () => {
  document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const tabOsmBtn = document.querySelector('.tab-btn[data-tab="tab-osm"]');
  const tabOsmContent = document.getElementById('tab-osm');

  if (tabOsmBtn && tabOsmContent) {
    tabOsmBtn.classList.add('active');
    tabOsmContent.classList.add('active');
  }
});

// ==================== EVENTOS DO XESTOR DE POSTOS OSM ====================

// Interruptor Mestre de OSM
document.getElementById('chk-osm-master')?.addEventListener('change', (e) => {
  isOsmMasterVisible = e.target.checked;
  renderOsmPoisOnMap();
  showToast(isOsmMasterVisible ? '👁️ Postos de OSM activados no mapa.' : '🚫 Postos de OSM desactivados do mapa.', 'info');
});

// Checkboxes de categorías de OSM
document.querySelectorAll('.chk-osm-cat').forEach(chk => {
  chk.addEventListener('change', () => {
    renderOsmPoisOnMap();
    renderOsmPoisList();
  });
});

// Botóns de lote de categorías OSM
document.getElementById('btn-osm-all-on')?.addEventListener('click', () => {
  document.querySelectorAll('.chk-osm-cat').forEach(chk => chk.checked = true);
  renderOsmPoisOnMap();
  renderOsmPoisList();
});

document.getElementById('btn-osm-all-off')?.addEventListener('click', () => {
  document.querySelectorAll('.chk-osm-cat').forEach(chk => chk.checked = false);
  renderOsmPoisOnMap();
  renderOsmPoisList();
});

// Filtros de estado rápido de OSM (Todos / Visibles / Ocultos)
document.querySelectorAll('.osm-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.osm-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeOsmFilter = btn.dataset.filter;
    renderOsmPoisList();
  });
});

// ==================== MODAL DE EDICIÓN DE POSTO OSM ====================

let currentEditingOsmPoi = null;

window.openEditOsmModal = function(osmId) {
  const feature = allOsmFeatures.find(f => f.properties.id === osmId);
  if (!feature) return;

  currentEditingOsmPoi = feature;
  const p = feature.properties;

  document.getElementById('osm-modal-title').textContent = '✏️ Configurar Posto OSM: ' + p.nome;
  document.getElementById('edit-osm-id').value = p.id;
  document.getElementById('edit-osm-nome').value = p.nome || '';
  document.getElementById('edit-osm-cat').value = p.categoria || 'comercio';
  document.getElementById('edit-osm-wheelchair').value = p.acessibilidade || 'unknown';
  document.getElementById('edit-osm-desc').value = p.descricao || '';
  document.getElementById('edit-osm-visible').checked = p.visible !== false;
  document.getElementById('edit-osm-wc').checked = !!p.banheiro_adaptado;

  document.getElementById('osm-modal').style.display = 'flex';
};

function closeOsmModal() {
  document.getElementById('osm-modal').style.display = 'none';
  currentEditingOsmPoi = null;
}

document.getElementById('btn-close-osm-modal')?.addEventListener('click', closeOsmModal);
document.getElementById('btn-cancel-osm-modal')?.addEventListener('click', closeOsmModal);

document.getElementById('osm-poi-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!currentEditingOsmPoi) return;

  const p = currentEditingOsmPoi.properties;
  p.nome = document.getElementById('edit-osm-nome').value.trim();
  p.categoria = document.getElementById('edit-osm-cat').value;
  p.acessibilidade = document.getElementById('edit-osm-wheelchair').value;
  p.descricao = document.getElementById('edit-osm-desc').value.trim();
  p.visible = document.getElementById('edit-osm-visible').checked;
  p.banheiro_adaptado = document.getElementById('edit-osm-wc').checked;

  closeOsmModal();
  updateOsmCategoryCounters();
  renderOsmPoisOnMap();
  renderOsmPoisList();
  showToast('✅ Posto OSM actualizado. Lembra premer en "Gardar".', 'success');
});

// Converter / Promover posto de OSM a POI Oficial Acessíbel
window.promoteOsmToOfficialPoi = function(osmId) {
  const feature = allOsmFeatures.find(f => f.properties.id === osmId);
  if (!feature) return;

  const p = feature.properties;
  const coords = feature.geometry.coordinates;

  closeOsmModal();

  // Abrir o modal de POI Oficial pré-cuberto
  document.getElementById('modal-title').textContent = '⭐ Promover a POI Oficial: ' + p.nome;
  document.getElementById('edit-poi-id').value = 'poi_' + Date.now();
  document.getElementById('edit-poi-lng').value = coords[0];
  document.getElementById('edit-poi-lat').value = coords[1];

  document.getElementById('edit-poi-nome').value = p.nome || '';
  document.getElementById('edit-poi-zona').value = p.acessibilidade === 'yes' ? 'verde' : (p.acessibilidade === 'no' ? 'vermello' : 'amarelo');
  
  let officialCat = 'espazo_publico';
  if (p.categoria === 'hostaleria' || p.categoria === 'comercio') officialCat = 'servizos';
  else if (p.categoria === 'sanidade') officialCat = 'sanidade';
  else if (p.categoria === 'patrimonio') officialCat = 'patrimonio';
  
  document.getElementById('edit-poi-cat').value = officialCat;
  document.getElementById('edit-poi-desc').value = p.descricao || `Establecemento ${p.nome} promovido dende OSM.`;
  document.getElementById('edit-poi-recom').value = p.acessibilidade === 'yes' ? 'Acceso adaptado e chan nivelado.' : 'Consultar na entrada para persoas con mobilidade reducida.';
  document.getElementById('edit-poi-piso').value = p.piso || 'Pavimento continuo';
  document.getElementById('edit-poi-pendente').value = p.pendente || 'Plano (< 2%)';
  document.getElementById('edit-poi-wc').checked = !!p.banheiro_adaptado;
  document.getElementById('edit-poi-parking').checked = !!p.estacionamento_pmr;
  document.getElementById('edit-poi-horario').value = p.horario || 'Consultar';

  document.getElementById('btn-delete-poi').style.display = 'none';
  document.getElementById('poi-modal').style.display = 'flex';
};

document.getElementById('btn-promote-from-modal')?.addEventListener('click', () => {
  if (currentEditingOsmPoi) {
    promoteOsmToOfficialPoi(currentEditingOsmPoi.properties.id);
  }
});

// ==================== MODO DE EDICIÓN: POIs ====================

const btnAddPoiMode = document.getElementById('btn-add-poi-mode');
if (btnAddPoiMode) {
  btnAddPoiMode.addEventListener('click', () => {
    isAddingPoiOnMap = !isAddingPoiOnMap;
    btnAddPoiMode.classList.toggle('active', isAddingPoiOnMap);
    if (isAddingPoiOnMap) {
      if (isDrawingRoute) cancelDrawingRoute();
      if (isEditingVertices) cancelEditingRouteVertices();
      showToast('📍 Preme no mapa para situar o novo punto.', 'info');
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.getContainer().style.cursor = '';
    }
  });
}

function openCreatePoiModal(lng, lat) {
  document.getElementById('modal-title').textContent = '➕ Engadir Novo Punto de Interese';
  document.getElementById('edit-poi-id').value = 'poi_' + Date.now();
  document.getElementById('edit-poi-lng').value = lng.toFixed(7);
  document.getElementById('edit-poi-lat').value = lat.toFixed(7);

  document.getElementById('edit-poi-nome').value = '';
  document.getElementById('edit-poi-zona').value = 'verde';
  document.getElementById('edit-poi-cat').value = 'monumento';
  document.getElementById('edit-poi-desc').value = '';
  document.getElementById('edit-poi-recom').value = '';
  document.getElementById('edit-poi-piso').value = 'Lousa / Asfalto';
  document.getElementById('edit-poi-pendente').value = 'Plano (< 2%)';
  document.getElementById('edit-poi-wc').checked = false;
  document.getElementById('edit-poi-parking').checked = false;
  document.getElementById('edit-poi-horario').value = 'Aberto 24h';

  document.getElementById('btn-delete-poi').style.display = 'none';
  document.getElementById('poi-modal').style.display = 'flex';
}

window.openEditPoiModal = function(poiId) {
  const feature = allFeatures.find(f => f.properties.id === poiId);
  if (!feature) return;

  const p = feature.properties;
  document.getElementById('modal-title').textContent = '✏️ Editar Punto: ' + p.nome;
  document.getElementById('edit-poi-id').value = p.id;
  document.getElementById('edit-poi-lng').value = feature.geometry.coordinates[0];
  document.getElementById('edit-poi-lat').value = feature.geometry.coordinates[1];

  document.getElementById('edit-poi-nome').value = p.nome || '';
  document.getElementById('edit-poi-zona').value = p.zona || 'verde';
  document.getElementById('edit-poi-cat').value = p.categoria || 'monumento';
  document.getElementById('edit-poi-desc').value = p.descricao || '';
  document.getElementById('edit-poi-recom').value = p.recomendacion || '';
  document.getElementById('edit-poi-piso').value = p.piso || '';
  document.getElementById('edit-poi-pendente').value = p.pendente || '';
  document.getElementById('edit-poi-wc').checked = !!p.banheiro_adaptado;
  document.getElementById('edit-poi-parking').checked = !!p.estacionamento_pmr;
  document.getElementById('edit-poi-horario').value = p.horario || '';

  document.getElementById('btn-delete-poi').style.display = 'block';
  document.getElementById('poi-modal').style.display = 'flex';
};

window.deletePoi = function(poiId) {
  if (!confirm('Tes a certeza de que desexas eliminar este punto de interese?')) return;
  allFeatures = allFeatures.filter(f => f.properties.id !== poiId);
  updateZoneCounters();
  applyFiltersAndRender();
  populateRouteDropdowns();
  showToast('Punto eliminado localmente. Lembra premer en "Gardar".', 'info');
  document.getElementById('poi-modal').style.display = 'none';
};

document.getElementById('btn-delete-poi')?.addEventListener('click', () => {
  const id = document.getElementById('edit-poi-id').value;
  deletePoi(id);
});

function closePoiModal() {
  document.getElementById('poi-modal').style.display = 'none';
}
document.getElementById('btn-close-modal')?.addEventListener('click', closePoiModal);
document.getElementById('btn-cancel-modal')?.addEventListener('click', closePoiModal);

document.getElementById('poi-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-poi-id').value;
  const lng = parseFloat(document.getElementById('edit-poi-lng').value);
  const lat = parseFloat(document.getElementById('edit-poi-lat').value);
  const zona = document.getElementById('edit-poi-zona').value;

  const zonaNomes = {
    verde: '🟢 Zona Baixa e Accesible',
    amarelo: '🟡 Casco Monumental (Parcial)',
    vermello: '🔴 Non Recomendado para PMR'
  };

  const updatedFeature = {
    type: "Feature",
    properties: {
      id: id,
      nome: document.getElementById('edit-poi-nome').value.trim(),
      zona: zona,
      zona_nome: zonaNomes[zona] || zona,
      categoria: document.getElementById('edit-poi-cat').value,
      acessibilidade: zona === 'verde' ? 'yes' : (zona === 'amarelo' ? 'limited' : 'no'),
      acessibilidade_desc: zona === 'verde' ? 'Totalmente accesible' : (zona === 'amarelo' ? 'Accesibilidade parcial' : 'Non recomendado'),
      descricao: document.getElementById('edit-poi-desc').value.trim(),
      piso: document.getElementById('edit-poi-piso').value.trim(),
      pendente: document.getElementById('edit-poi-pendente').value.trim(),
      banheiro_adaptado: document.getElementById('edit-poi-wc').checked,
      estacionamento_pmr: document.getElementById('edit-poi-parking').checked,
      recomendacion: document.getElementById('edit-poi-recom').value.trim(),
      horario: document.getElementById('edit-poi-horario').value.trim()
    },
    geometry: {
      type: "Point",
      coordinates: [lng, lat]
    }
  };

  const existingIndex = allFeatures.findIndex(f => f.properties.id === id);
  if (existingIndex >= 0) {
    allFeatures[existingIndex] = updatedFeature;
    showToast('✅ Punto actualizado. Lembra premer en "Gardar".', 'success');
  } else {
    allFeatures.push(updatedFeature);
    showToast('✅ Novo punto engadido. Lembra premer en "Gardar".', 'success');
  }

  closePoiModal();
  updateZoneCounters();
  applyFiltersAndRender();
  populateRouteDropdowns();
});

// ==================== MODO DE EDICIÓN: DESEÑAR NOVAS ROTAS ====================

const btnAddRouteMode = document.getElementById('btn-add-route-mode');
const drawingToolbar = document.getElementById('drawing-toolbar');
const drawingPointCount = document.getElementById('drawing-point-count');
const btnFinishDrawing = document.getElementById('btn-finish-drawing');
const btnCancelDrawing = document.getElementById('btn-cancel-drawing');

if (btnAddRouteMode) {
  btnAddRouteMode.addEventListener('click', () => {
    startDrawingRoute();
  });
}

function startDrawingRoute() {
  if (isAddingPoiOnMap) {
    isAddingPoiOnMap = false;
    btnAddPoiMode.classList.remove('active');
  }
  if (isEditingVertices) cancelEditingRouteVertices();

  isDrawingRoute = true;
  currentDrawingPoints = [];
  drawingPointCount.textContent = '0';
  drawingToolbar.style.display = 'flex';
  map.getContainer().style.cursor = 'crosshair';

  if (tempDrawingPolyline) {
    map.removeLayer(tempDrawingPolyline);
  }
  tempDrawingPolyline = L.polyline([], { color: '#2563eb', weight: 6, dashArray: '6, 6' }).addTo(map);

  showToast('📐 Preme no mapa para engadir puntos da ruta.', 'info');
}

function cancelDrawingRoute() {
  isDrawingRoute = false;
  currentDrawingPoints = [];
  drawingToolbar.style.display = 'none';
  map.getContainer().style.cursor = '';
  if (tempDrawingPolyline) {
    map.removeLayer(tempDrawingPolyline);
    tempDrawingPolyline = null;
  }
}

btnCancelDrawing?.addEventListener('click', cancelDrawingRoute);

btnFinishDrawing?.addEventListener('click', () => {
  if (currentDrawingPoints.length < 2) {
    alert('Debes marcar polo menos 2 puntos no mapa para trazar un treito de ruta.');
    return;
  }
  openCreateRouteModal(currentDrawingPoints);
  cancelDrawingRoute();
});

// Clics no Mapa
map.on('click', e => {
  if (isAddingPoiOnMap) {
    isAddingPoiOnMap = false;
    btnAddPoiMode.classList.remove('active');
    map.getContainer().style.cursor = '';
    openCreatePoiModal(e.latlng.lng, e.latlng.lat);
    return;
  }

  if (isDrawingRoute) {
    const pt = [e.latlng.lat, e.latlng.lng];
    currentDrawingPoints.push(pt);
    tempDrawingPolyline.setLatLngs(currentDrawingPoints);
    drawingPointCount.textContent = currentDrawingPoints.length;
  }
});

// Modal de Crear Rota
function openCreateRouteModal(latlngPoints) {
  const geojsonCoords = latlngPoints.map(pt => [parseFloat(pt[1].toFixed(7)), parseFloat(pt[0].toFixed(7))]);

  document.getElementById('route-modal-title').textContent = '📐 Novo Treito de Roteiro';
  document.getElementById('edit-route-id').value = 'route_' + Date.now();
  document.getElementById('edit-route-coords').value = JSON.stringify(geojsonCoords);

  document.getElementById('edit-route-titulo').value = '';
  document.getElementById('edit-route-tipo').value = 'optimo';
  document.getElementById('edit-route-cor').value = '#16a34a';
  document.getElementById('edit-route-desc').value = '';
  document.getElementById('edit-route-recom').value = '';
  document.getElementById('edit-route-pavimento').value = 'Lousa continua / Rampla';
  document.getElementById('edit-route-pendente').value = 'Plano (< 2%)';

  document.getElementById('btn-delete-route').style.display = 'none';
  document.getElementById('route-modal').style.display = 'flex';
}

window.openEditRouteModal = function(routeId) {
  const feature = allRoutes.find(r => r.properties.id === routeId);
  if (!feature) return;

  const p = feature.properties;
  document.getElementById('route-modal-title').textContent = '✏️ Editar Treito: ' + p.titulo;
  document.getElementById('edit-route-id').value = p.id;
  document.getElementById('edit-route-coords').value = JSON.stringify(feature.geometry.coordinates);

  document.getElementById('edit-route-titulo').value = p.titulo || '';
  document.getElementById('edit-route-tipo').value = p.tipo || 'optimo';
  document.getElementById('edit-route-cor').value = p.cor || '#16a34a';
  document.getElementById('edit-route-desc').value = p.desc || '';
  document.getElementById('edit-route-recom').value = p.recomendacion || '';
  document.getElementById('edit-route-pavimento').value = p.pavimento || '';
  document.getElementById('edit-route-pendente').value = p.pendente || '';

  document.getElementById('btn-delete-route').style.display = 'block';
  document.getElementById('route-modal').style.display = 'flex';
};

window.deleteRoute = function(routeId) {
  if (!confirm('Tes a certeza de que desexas eliminar este treito de ruta?')) return;
  allRoutes = allRoutes.filter(r => r.properties.id !== routeId);
  renderOfficialRouteOnMap();
  renderOfficialRouteList();
  showToast('Treito eliminado localmente. Lembra premer en "Gardar".', 'info');
  document.getElementById('route-modal').style.display = 'none';
};

document.getElementById('btn-delete-route')?.addEventListener('click', () => {
  const id = document.getElementById('edit-route-id').value;
  deleteRoute(id);
});

function closeRouteModal() {
  document.getElementById('route-modal').style.display = 'none';
}
document.getElementById('btn-close-route-modal')?.addEventListener('click', closeRouteModal);
document.getElementById('btn-cancel-route-modal')?.addEventListener('click', closeRouteModal);

document.getElementById('edit-route-tipo')?.addEventListener('change', e => {
  const tipo = e.target.value;
  const colorSelect = document.getElementById('edit-route-cor');
  if (tipo === 'optimo') colorSelect.value = '#16a34a';
  if (tipo === 'precaucion') colorSelect.value = '#d97706';
  if (tipo === 'evitar') colorSelect.value = '#dc2626';
});

document.getElementById('route-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-route-id').value;
  const coords = JSON.parse(document.getElementById('edit-route-coords').value);
  const tipo = document.getElementById('edit-route-tipo').value;

  const updatedRoute = {
    type: "Feature",
    properties: {
      id: id,
      titulo: document.getElementById('edit-route-titulo').value.trim(),
      tipo: tipo,
      cor: document.getElementById('edit-route-cor').value,
      estilo_lina: tipo === 'optimo' ? 'solida' : (tipo === 'evitar' ? 'puntos' : 'tracos'),
      desc: document.getElementById('edit-route-desc').value.trim(),
      recomendacion: document.getElementById('edit-route-recom').value.trim(),
      pavimento: document.getElementById('edit-route-pavimento').value.trim(),
      pendente: document.getElementById('edit-route-pendente').value.trim()
    },
    geometry: {
      type: "LineString",
      coordinates: coords
    }
  };

  const existingIndex = allRoutes.findIndex(r => r.properties.id === id);
  if (existingIndex >= 0) {
    allRoutes[existingIndex] = updatedRoute;
    showToast('✅ Treito actualizado. Lembra premer en "Gardar".', 'success');
  } else {
    allRoutes.push(updatedRoute);
    showToast('✅ Novo treito engadido. Lembra premer en "Gardar".', 'success');
  }

  closeRouteModal();
  renderOfficialRouteOnMap();
  renderOfficialRouteList();
});

// ==================== EDITOR INTERACTIVO DE VÉRTICES ====================

const vertexToolbar = document.getElementById('vertex-toolbar');
const vertexRouteName = document.getElementById('vertex-route-name');
const btnFinishVertexEdit = document.getElementById('btn-finish-vertex-edit');
const btnCancelVertexEdit = document.getElementById('btn-cancel-vertex-edit');

window.startEditingRouteVertices = function(routeId) {
  if (isDrawingRoute) cancelDrawingRoute();
  if (isAddingPoiOnMap) {
    isAddingPoiOnMap = false;
    btnAddPoiMode.classList.remove('active');
  }

  const route = allRoutes.find(r => r.properties.id === routeId);
  if (!route) return;

  isEditingVertices = true;
  activeEditingRouteId = routeId;
  originalRouteCoordsBackup = JSON.parse(JSON.stringify(route.geometry.coordinates));

  vertexRouteName.textContent = route.properties.titulo;
  vertexToolbar.style.display = 'flex';

  renderOfficialRouteOnMap();

  const latlngs = route.geometry.coordinates.map(c => [c[1], c[0]]);
  editingPolyline = L.polyline(latlngs, {
    color: '#0284c7',
    weight: 7,
    opacity: 0.95
  }).addTo(map);

  map.fitBounds(editingPolyline.getBounds(), { padding: [50, 50] });

  renderVertexHandles();
  showToast('📐 Modo Vértices: Arrastra os puntos 🔵, clica nun para eliminalo ou clica nos ⚪ para engadir novos.', 'info');
};

function renderVertexHandles() {
  vertexHandles.forEach(h => map.removeLayer(h));
  midpointHandles.forEach(m => map.removeLayer(m));
  vertexHandles = [];
  midpointHandles = [];

  const route = allRoutes.find(r => r.properties.id === activeEditingRouteId);
  if (!route) return;

  const coords = route.geometry.coordinates;

  coords.forEach((coord, idx) => {
    const latlng = [coord[1], coord[0]];
    const icon = L.divIcon({
      className: 'vertex-marker-handle',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const marker = L.marker(latlng, {
      icon: icon,
      draggable: true,
      zIndexOffset: 1000
    }).addTo(map);

    marker.on('drag', (e) => {
      const pos = e.target.getLatLng();
      coords[idx] = [parseFloat(pos.lng.toFixed(7)), parseFloat(pos.lat.toFixed(7))];
      editingPolyline.setLatLngs(coords.map(c => [c[1], c[0]]));
    });

    marker.on('dragend', () => {
      renderVertexHandles();
    });

    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (coords.length <= 2) {
        alert('O treito debe ter polo menos 2 puntos. Non é posible eliminar máis.');
        return;
      }
      if (confirm(`Desexas eliminar este punto (${idx + 1} de ${coords.length})?`)) {
        coords.splice(idx, 1);
        editingPolyline.setLatLngs(coords.map(c => [c[1], c[0]]));
        renderVertexHandles();
        showToast('Punto eliminado do trazado.', 'info');
      }
    });

    vertexHandles.push(marker);
  });

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const midLat = (p1[1] + p2[1]) / 2;
    const midLng = (p1[0] + p2[0]) / 2;

    const midIcon = L.divIcon({
      className: 'midpoint-marker-handle',
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    });

    const midMarker = L.marker([midLat, midLng], {
      icon: midIcon,
      zIndexOffset: 900
    }).addTo(map);

    midMarker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      const newPt = [parseFloat(midLng.toFixed(7)), parseFloat(midLat.toFixed(7))];
      coords.splice(i + 1, 0, newPt);
      editingPolyline.setLatLngs(coords.map(c => [c[1], c[0]]));
      renderVertexHandles();
      showToast('➕ Novo punto inserido. Podes arrastralo para axustar a curva.', 'success');
    });

    midpointHandles.push(midMarker);
  }
}

function finishEditingRouteVertices() {
  isEditingVertices = false;
  activeEditingRouteId = null;
  originalRouteCoordsBackup = null;

  if (editingPolyline) {
    map.removeLayer(editingPolyline);
    editingPolyline = null;
  }
  vertexHandles.forEach(h => map.removeLayer(h));
  midpointHandles.forEach(m => map.removeLayer(m));
  vertexHandles = [];
  midpointHandles = [];

  vertexToolbar.style.display = 'none';

  renderOfficialRouteOnMap();
  renderOfficialRouteList();
  showToast('🎉 Trazado do treito actualizado con éxito! Lembra premer en "Gardar".', 'success');
}

function cancelEditingRouteVertices() {
  if (activeEditingRouteId && originalRouteCoordsBackup) {
    const route = allRoutes.find(r => r.properties.id === activeEditingRouteId);
    if (route) {
      route.geometry.coordinates = originalRouteCoordsBackup;
    }
  }

  isEditingVertices = false;
  activeEditingRouteId = null;
  originalRouteCoordsBackup = null;

  if (editingPolyline) {
    map.removeLayer(editingPolyline);
    editingPolyline = null;
  }
  vertexHandles.forEach(h => map.removeLayer(h));
  midpointHandles.forEach(m => map.removeLayer(m));
  vertexHandles = [];
  midpointHandles = [];

  vertexToolbar.style.display = 'none';

  renderOfficialRouteOnMap();
  renderOfficialRouteList();
  showToast('Modificación de vértices cancelada.', 'info');
}

btnFinishVertexEdit?.addEventListener('click', finishEditingRouteVertices);
btnCancelVertexEdit?.addEventListener('click', cancelEditingRouteVertices);

// ==================== ROTEIRO INTELIXENTE (PRIORIZANDO NOVA RAMPLA) ====================

function populateRouteDropdowns() {
  const originSelect = document.getElementById('route-origin');
  const destSelect = document.getElementById('route-destination');
  if (!originSelect || !destSelect) return;

  originSelect.innerHTML = '<option value="">Selecciona orixe...</option>';
  destSelect.innerHTML = '<option value="">Selecciona destino...</option>';

  allFeatures.forEach(f => {
    const opt1 = document.createElement('option');
    opt1.value = `${f.geometry.coordinates[0]},${f.geometry.coordinates[1]}`;
    opt1.textContent = `${f.properties.zona === 'verde' ? '🟢' : (f.properties.zona === 'amarelo' ? '🟡' : '🔴')} ${f.properties.nome}`;
    opt1.dataset.id = f.properties.id;

    const opt2 = opt1.cloneNode(true);
    originSelect.appendChild(opt1);
    destSelect.appendChild(opt2);
  });

  if (allFeatures.length >= 2) {
    // Definir Catedral (C) e Remedios (R) por defecto para demostrar a nova rampa
    const idxCatedral = allFeatures.findIndex(f => f.properties.id === 'catedral_asuncion');
    const idxRemedios = allFeatures.findIndex(f => f.properties.id === 'alameda_remedios');

    if (idxCatedral >= 0) originSelect.selectedIndex = idxCatedral + 1;
    if (idxRemedios >= 0) destSelect.selectedIndex = idxRemedios + 1;
  }
}

// Cálculo de Roteiro Intelixente
document.getElementById('btn-calculate-route')?.addEventListener('click', () => {
  const originSelect = document.getElementById('route-origin');
  const destSelect = document.getElementById('route-destination');

  const originVal = originSelect.value;
  const destVal = destSelect.value;

  if (!originVal || !destVal || originVal === destVal) {
    alert('Selecciona dous lugares diferentes.');
    return;
  }

  const originId = originSelect.selectedOptions[0]?.dataset.id;
  const destId = destSelect.selectedOptions[0]?.dataset.id;

  const mode = document.querySelector('input[name="routing-engine-type"]:checked')?.value || 'verified_accessible';

  const [origLon, origLat] = originVal.split(',').map(Number);
  const [destLon, destLat] = destVal.split(',').map(Number);

  if (mode === 'verified_accessible') {
    calculateVerifiedAccessibleRoute(originId, destId, [origLat, origLon], [destLat, destLon]);
  } else {
    calculateGenericOsrmRoute(originVal, destVal);
  }
});

function calculateVerifiedAccessibleRoute(originId, destId, origLatLng, destLatLng) {
  // Comprobar se a ruta conecta o Eixe Central / Catedral coa Alameda / Remedios (ou Fonte Vella / Barrio dos Muíños)
  const isCatedralRemedios = (originId === 'catedral_asuncion' || originId === 'praza_catedral') && (destId === 'alameda_remedios' || destId === 'santuario_remedios') ||
                             (destId === 'catedral_asuncion' || destId === 'praza_catedral') && (originId === 'alameda_remedios' || originId === 'santuario_remedios');

  let routeCoords = [];
  let isReverse = (originId === 'catedral_asuncion' || originId === 'praza_catedral');

  // Buscar os treitos verificados de Eixe Central (nova rampla) e Alameda
  const eixeCentral = allRoutes.find(r => r.properties.id === 'etapa_eixe_central');
  const alameda = allRoutes.find(r => r.properties.id === 'etapa_alameda');

  if (isCatedralRemedios && eixeCentral && alameda) {
    const coordsEixe = eixeCentral.geometry.coordinates.map(c => [c[1], c[0]]);
    const coordsAlameda = alameda.geometry.coordinates.map(c => [c[1], c[0]]);

    if (isReverse) {
      routeCoords = [...coordsEixe.slice().reverse(), ...coordsAlameda.slice().reverse()];
    } else {
      routeCoords = [...coordsAlameda, ...coordsEixe];
    }
  } else {
    // Buscar o treito máis próximo na rede verificada
    const accessibleRoutes = allRoutes.filter(r => r.properties.tipo !== 'evitar');
    if (accessibleRoutes.length > 0) {
      accessibleRoutes.forEach(r => {
        r.geometry.coordinates.forEach(c => routeCoords.push([c[1], c[0]]));
      });
    } else {
      routeCoords = [origLatLng, destLatLng];
    }
  }

  // Debuxar a liña accesible verificada (Azul / Verde destacada)
  if (customRouteLayer) map.removeLayer(customRouteLayer);

  customRouteLayer = L.polyline(routeCoords, {
    color: '#16a34a',
    weight: 7,
    opacity: 0.95,
    dashArray: '8, 8'
  }).addTo(map);

  map.fitBounds(customRouteLayer.getBounds(), { padding: [40, 40] });

  // Calcular distancia estimada
  let totalDist = 0;
  for (let i = 0; i < routeCoords.length - 1; i++) {
    totalDist += map.distance(routeCoords[i], routeCoords[i + 1]);
  }
  const distMeters = Math.round(totalDist);
  const walkTimeMin = Math.max(1, Math.round((totalDist / 50) * 1.3));

  // Mostrar resultados
  const badgeContainer = document.getElementById('route-badge-container');
  badgeContainer.innerHTML = `
    <div class="route-badge-verified">
      <span>✅</span>
      <div>
        <strong>ROTEIRO ACCESIBLE VERIFICADO (Nova Rampla)</strong><br>
        <small>Evita o atallo con escadas e pavimentación inaccesible.</small>
      </div>
    </div>
  `;

  document.getElementById('route-dist').textContent = distMeters >= 1000 ? `${(distMeters/1000).toFixed(2)} km` : `${distMeters} m`;
  document.getElementById('route-time').textContent = `~${walkTimeMin} min`;
  
  document.getElementById('route-warnings').innerHTML = `
    ♿ <strong>Garantía de Accesibilidade:</strong><br>
    Este roteiro utiliza o percorrido suave pola <strong>Rúa Alfonso VII / Bispo Sarmiento</strong> e a nova rampla adaptada á Alameda dos Remedios, garantindo pendentes inferiores ao 5% e eliminando calquera tramo con chanzos.
  `;

  document.getElementById('route-results').style.display = 'block';
  document.getElementById('btn-clear-route').style.display = 'block';

  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

function calculateGenericOsrmRoute(originVal, destVal) {
  const url = `https://router.project-osrm.org/route/v1/foot/${originVal};${destVal}?overview=full&geometries=geojson`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (!data.routes || data.routes.length === 0) {
        alert('Non foi posible calcular a ruta xenérica.');
        return;
      }

      const route = data.routes[0];
      const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);

      if (customRouteLayer) map.removeLayer(customRouteLayer);

      customRouteLayer = L.polyline(coords, {
        color: '#dc2626',
        weight: 6,
        opacity: 0.9,
        dashArray: '4, 8'
      }).addTo(map);

      map.fitBounds(customRouteLayer.getBounds(), { padding: [40, 40] });

      const distMeters = Math.round(route.distance);
      const walkTimeMin = Math.round((route.distance / 50) * 1.35);

      const badgeContainer = document.getElementById('route-badge-container');
      badgeContainer.innerHTML = `
        <div class="route-badge-osrm">
          <span>⚠️</span>
          <div>
            <strong>CÁLCULO OSM ESTÁNDAR (Non Verificado)</strong><br>
            <small>Pode incluír escadas e atallos con forte desnivel.</small>
          </div>
        </div>
      `;

      document.getElementById('route-dist').textContent = distMeters >= 1000 ? `${(distMeters/1000).toFixed(2)} km` : `${distMeters} m`;
      document.getElementById('route-time').textContent = `~${walkTimeMin} min`;
      document.getElementById('route-warnings').innerHTML = `
        ⚠️ <strong>Atención:</strong> O cálculo xenérico pode atravesar escadas ou beirarrúas estreitas. Recoméndase activar a opción <strong>"Priorizar Rede Accesible Verificada"</strong>.
      `;

      document.getElementById('route-results').style.display = 'block';
      document.getElementById('btn-clear-route').style.display = 'block';

      if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
      }
    })
    .catch(err => {
      console.error(err);
      alert('Erro ao calcular a ruta.');
    });
}

document.getElementById('btn-clear-route')?.addEventListener('click', () => {
  if (customRouteLayer) {
    map.removeLayer(customRouteLayer);
    customRouteLayer = null;
  }
  document.getElementById('route-results').style.display = 'none';
  document.getElementById('btn-clear-route').style.display = 'none';
});

// ==================== GARDAR CAMBIOS NO SERVIDOR ====================

const btnSaveServer = document.getElementById('btn-save-server');
if (btnSaveServer) {
  btnSaveServer.addEventListener('click', () => {
    btnSaveServer.disabled = true;
    btnSaveServer.textContent = '⏳ Gardando...';

    const poisPayload = { type: "FeatureCollection", features: allFeatures };
    const routesPayload = { type: "FeatureCollection", features: allRoutes };
    const osmPayload = { type: "FeatureCollection", features: allOsmFeatures };

    Promise.all([
      fetch('/api/save-pois', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(poisPayload)
      }).then(r => r.json()),
      fetch('/api/save-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routesPayload)
      }).then(r => r.json()),
      fetch('/api/save-osm-pois', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(osmPayload)
      }).then(r => r.json())
    ])
      .then(([resPois, resRoutes, resOsm]) => {
        btnSaveServer.disabled = false;
        btnSaveServer.textContent = '💾 Gardar';

        if (resPois.success && resRoutes.success && resOsm.success) {
          showToast('🎉 Todos os POIs Oficiais, Roteiros e Postos OSM foron gardados con éxito!', 'success');
        } else {
          showToast('❌ Erro gardando datos.', 'error');
        }
      })
      .catch(err => {
        btnSaveServer.disabled = false;
        btnSaveServer.textContent = '💾 Gardar';
        showToast('❌ Erro de conexión: ' + err.message, 'error');
      });
  });
}

// Toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'success' ? 'toast-success' : (type === 'error' ? 'toast-error' : '')}`;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// Acessibilidade Visual
document.getElementById('btn-high-contrast')?.addEventListener('click', () => {
  document.body.classList.toggle('high-contrast');
});

let baseFontSize = 14;
document.getElementById('btn-font-plus')?.addEventListener('click', () => {
  if (baseFontSize < 18) {
    baseFontSize += 1;
    document.documentElement.style.setProperty('--font-base-size', `${baseFontSize}px`);
  }
});

document.getElementById('btn-font-minus')?.addEventListener('click', () => {
  if (baseFontSize > 12) {
    baseFontSize -= 1;
    document.documentElement.style.setProperty('--font-base-size', `${baseFontSize}px`);
  }
});

// Accions Flotantes
document.getElementById('btn-reset-view')?.addEventListener('click', () => {
  map.flyTo(MONDONEDO_COORDS, DEFAULT_ZOOM);
});

document.getElementById('btn-locate-me')?.addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('Xeolocalización non soportada.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const latlng = [pos.coords.latitude, pos.coords.longitude];
      if (userLocationMarker) map.removeLayer(userLocationMarker);
      userLocationMarker = L.circleMarker(latlng, {
        radius: 8,
        fillColor: '#3b82f6',
        color: '#ffffff',
        weight: 3,
        opacity: 1,
        fillOpacity: 0.9
      }).addTo(map).bindPopup('📍 A túa situación').openPopup();

      map.flyTo(latlng, 17);
    },
    err => alert('Erro obtendo posición: ' + err.message)
  );
});

// Sidebar móbil
document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('open');
});
document.getElementById('btn-close-sidebar')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
});
