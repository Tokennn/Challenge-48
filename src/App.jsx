import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import TextPressure from './components/TextPressure';

gsap.registerPlugin(ScrollTrigger);

const DEFAULT_FILTERS = {
  startDate: '',
  endDate: '',
  minLat: '41.0',
  maxLat: '51.5',
  minLng: '-5.5',
  maxLng: '9.8',
  minAqi: '',
  maxAqi: '',
  aggregateBy: 'none',
  limit: '300',
};

function getAqiColor(aqi) {
  if (aqi <= 50) return '#38d67a';
  if (aqi <= 100) return '#ffd449';
  if (aqi <= 150) return '#ff9c38';
  if (aqi <= 200) return '#ff5f5f';
  return '#8b63ff';
}

function getAqiLabel(aqi) {
  if (aqi <= 50) return 'Bon';
  if (aqi <= 100) return 'Modéré';
  if (aqi <= 150) return 'Dégradé';
  if (aqi <= 200) return 'Mauvais';
  return 'Très mauvais';
}

function buildQuery(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function App() {
  const appRef = useRef(null);
  const titleRef = useRef(null);
  const sunRef = useRef(null);
  const sunGlowRef = useRef(null);
  const sunFlareRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const lenisRef = useRef(null);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState(null);

  const stats = useMemo(() => {
    if (!readings.length) {
      return {
        total: 0,
        averageAqi: 0,
        worstAqi: 0,
        zoneCount: 0,
      };
    }

    const averageAqi = Math.round(
      readings.reduce((sum, item) => sum + item.aqi, 0) / readings.length
    );

    const worstAqi = Math.max(...readings.map((item) => item.aqi));
    const zoneCount = new Set(readings.map((item) => item.city)).size;

    return {
      total: readings.length,
      averageAqi,
      worstAqi,
      zoneCount,
    };
  }, [readings]);

  useEffect(() => {
    const lenis = new Lenis({
      autoRaf: true,
      duration: 1.22,
      smoothWheel: true,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.1,
    });
    lenisRef.current = lenis;

    lenis.on('scroll', ScrollTrigger.update);

    const ctx = gsap.context(() => {
      gsap.from(titleRef.current, {
        opacity: 0,
        y: 74,
        scale: 0.96,
        duration: 1.3,
        ease: 'power3.out',
      });

      gsap.to(sunFlareRef.current, {
        rotate: 7,
        x: 12,
        y: 8,
        duration: 8,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });

      gsap.to(sunGlowRef.current, {
        opacity: 0.82,
        scale: 1.1,
        duration: 4,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });

      gsap.to(sunRef.current, {
        y: -9,
        duration: 4.8,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });

      gsap.from('.reveal-item', {
        opacity: 0,
        y: 70,
        duration: 0.95,
        stagger: 0.14,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.dashboard-section',
          start: 'top 78%',
        },
      });
    }, appRef);

    return () => {
      ctx.revert();
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const bootMap = () => {
      if (cancelled || mapRef.current) return;

      const L = window.L;
      if (!L || !mapContainerRef.current) {
        timer = setTimeout(bootMap, 120);
        return;
      }

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
      }).setView([46.7, 2.6], 6);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      markerLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    };

    bootMap();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerLayerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const L = window.L;
    if (!L || !mapRef.current || !markerLayerRef.current) return;

    markerLayerRef.current.clearLayers();

    if (!readings.length) return;

    const bounds = [];

    readings.forEach((item) => {
      const color = getAqiColor(item.aqi);
      const icon = L.divIcon({
        className: 'aqi-div-icon-wrapper',
        html: `<span class="aqi-badge" style="--aqi-color:${color}">${Math.round(item.aqi)}</span>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -20],
      });

      const marker = L.marker([item.latitude, item.longitude], { icon });

      const aqiLabel = meta?.mode === 'city' ? 'AQI moyen' : 'AQI';
      const sampleInfo = item.sampleSize
        ? `<br/>Échantillons: ${item.sampleSize}`
        : '';

      marker.bindPopup(
        `<strong>${escapeHtml(item.city)}</strong><br/>${aqiLabel}: ${item.aqi} (${getAqiLabel(item.aqi)})<br/>Date: ${new Date(item.measuredAt).toLocaleString('fr-FR')}${sampleInfo}`
      );

      markerLayerRef.current.addLayer(marker);
      bounds.push([item.latitude, item.longitude]);
    });

    if (bounds.length === 1) {
      mapRef.current.setView(bounds[0], 8, { animate: true });
      return;
    }

    mapRef.current.fitBounds(bounds, {
      padding: [28, 28],
      maxZoom: 10,
      animate: true,
      duration: 1.1,
    });
  }, [readings, meta?.mode]);

  async function fetchReadings(nextFilters) {
    setLoading(true);
    setError('');

    try {
      const query = buildQuery(nextFilters);
      const response = await fetch(`/api/readings?${query}`);

      if (!response.ok) {
        throw new Error(`Erreur API (${response.status})`);
      }

      const payload = await response.json();
      setReadings(payload.data ?? []);
      setMeta(payload.meta ?? null);
    } catch (fetchError) {
      setError(fetchError.message || 'Impossible de charger les mesures.');
      setReadings([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReadings(DEFAULT_FILTERS);
  }, []);

  function onFilterChange(event) {
    const { name, value } = event.target;
    setFilters((previous) => ({ ...previous, [name]: value }));
  }

  function onFilterSubmit(event) {
    event.preventDefault();
    fetchReadings(filters);
  }

  function onResetFilters() {
    setFilters(DEFAULT_FILTERS);
    fetchReadings(DEFAULT_FILTERS);
  }

  function onScrollIndicatorClick(event) {
    event.preventDefault();

    if (lenisRef.current) {
      lenisRef.current.scrollTo('#dashboard', {
        duration: 1.18,
        easing: (value) => 1 - (1 - value) ** 3,
      });
      return;
    }

    const target = document.getElementById('dashboard');
    target?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  return (
    <div className="app" ref={appRef}>
      <div className="sky-noise" aria-hidden="true" />

      <div className="sun-system" aria-hidden="true" ref={sunRef}>
        <div className="sun-aura" ref={sunGlowRef} />
        <div className="sun-bloom" />
        <div className="sun-disc" />
        <div className="sun-flare" ref={sunFlareRef}>
          {[1, 2, 3].map((value) => (
            <span key={`orb-${value}`} className={`flare-orb flare-orb-${value}`} />
          ))}
          <span className="flare-arc flare-arc-1" />
          <span className="flare-arc flare-arc-2" />
        </div>
      </div>

      <header className="hero">
        <div ref={titleRef} className="hero-title-wrap">
          <TextPressure
            text="Air map"
            flex={false}
            alpha={false}
            stroke={false}
            width={false}
            weight
            italic={false}
            fontFamily='"SF Pro Display", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            fontUrl=""
            loadFont={false}
            textColor="#fafdff"
            strokeColor="#5aa7ff"
            minFontSize={64}
          />
        </div>
        {/* <p>Prototype technique: API filtrable, worker cyclique, cartographie dynamique.</p> */}
        <a
          className="scroll-indicator"
          href="#dashboard"
          aria-label="Descendre"
          onClick={onScrollIndicatorClick}
        >
          ↓
        </a>
      </header>

      <main>
        <section id="dashboard" className="dashboard-section">
          <div className="panel controls-panel reveal-item">
            <h2>Filtres</h2>
            <form className="filters-form" onSubmit={onFilterSubmit}>
              <label>
                Date début
                <input
                  type="date"
                  name="startDate"
                  value={filters.startDate}
                  onChange={onFilterChange}
                />
              </label>

              <label>
                Date fin
                <input
                  type="date"
                  name="endDate"
                  value={filters.endDate}
                  onChange={onFilterChange}
                />
              </label>

              <label>
                Latitude min
                <input
                  type="number"
                  step="0.01"
                  name="minLat"
                  value={filters.minLat}
                  onChange={onFilterChange}
                />
              </label>

              <label>
                Latitude max
                <input
                  type="number"
                  step="0.01"
                  name="maxLat"
                  value={filters.maxLat}
                  onChange={onFilterChange}
                />
              </label>

              <label>
                Longitude min
                <input
                  type="number"
                  step="0.01"
                  name="minLng"
                  value={filters.minLng}
                  onChange={onFilterChange}
                />
              </label>

              <label>
                Longitude max
                <input
                  type="number"
                  step="0.01"
                  name="maxLng"
                  value={filters.maxLng}
                  onChange={onFilterChange}
                />
              </label>

              <label>
                Indice min
                <input
                  type="number"
                  min="0"
                  max="500"
                  name="minAqi"
                  value={filters.minAqi}
                  onChange={onFilterChange}
                />
              </label>

              <label>
                Indice max
                <input
                  type="number"
                  min="0"
                  max="500"
                  name="maxAqi"
                  value={filters.maxAqi}
                  onChange={onFilterChange}
                />
              </label>

              <label>
                Restitution
                <select
                  name="aggregateBy"
                  value={filters.aggregateBy}
                  onChange={onFilterChange}
                >
                  <option value="none">Mesures brutes</option>
                  <option value="city">Indice moyen par ville</option>
                </select>
              </label>

              <label>
                Limite
                <input
                  type="number"
                  min="10"
                  max="1000"
                  name="limit"
                  value={filters.limit}
                  onChange={onFilterChange}
                />
              </label>

              <div className="filters-actions">
                <button type="submit" disabled={loading}>
                  {loading ? 'Chargement...' : 'Appliquer'}
                </button>
                <button type="button" onClick={onResetFilters} disabled={loading}>
                  Réinitialiser
                </button>
              </div>
            </form>
          </div>

          <div className="stats-grid reveal-item">
            <article className="panel stat-card">
              <p>Mesures</p>
              <h3>{stats.total}</h3>
            </article>
            <article className="panel stat-card">
              <p>AQI moyen</p>
              <h3>{stats.averageAqi}</h3>
            </article>
            <article className="panel stat-card">
              <p>AQI max</p>
              <h3>{stats.worstAqi}</h3>
            </article>
            <article className="panel stat-card">
              <p>Zones actives</p>
              <h3>{stats.zoneCount}</h3>
            </article>
          </div>

          <div className="panel map-panel reveal-item">
            <div className="map-header">
              <h2>Carte</h2>
              <p>
                {meta?.returned ?? 0} points • mode{' '}
                {meta?.mode === 'city' ? 'moyenne par ville' : 'brut'} • mise à
                jour{' '}
                {meta?.generatedAt
                  ? new Date(meta.generatedAt).toLocaleTimeString('fr-FR')
                  : '--:--'}
              </p>
            </div>

            {error ? <p className="status error">{error}</p> : null}
            {!error && loading ? (
              <p className="status">Chargement des données...</p>
            ) : null}
            {!error && !loading && !readings.length ? (
              <p className="status">Aucune donnée pour ces filtres.</p>
            ) : null}

            <div ref={mapContainerRef} className="leaflet-map" />
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
