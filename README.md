# Air map - Base fullstack alignée barème (PostgreSQL)

Cette base répond au process demandé:
- backend + frontend,
- récupération cyclique toutes les X minutes,
- stockage PostgreSQL,
- endpoint de restitution filtrable,
- carte Leaflet avec cercles colorés + popup,
- formulaire de filtres réactif.

## Stack
- Front: React, Vite, GSAP, Lenis, Leaflet (CDN)
- Back: Node.js, Express
- Base de données: PostgreSQL (`pg`)

## Démarrage rapide

1. Démarrer PostgreSQL:
```bash
docker compose up -d
```

2. Installer les dépendances:
```bash
npm install
```

3. Lancer backend + frontend:
```bash
npm run dev:all
```

- Front: `http://localhost:5173`
- API: `http://localhost:8787`

## Variables d'environnement
Copier `.env.example` vers `.env` puis adapter:

- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/air_map`
- `PORT=8787`
- `WORKER_INTERVAL_MS=120000`
- `ENABLE_WORKER=true`
- `DATA_SOURCE_URL=`

`DATA_SOURCE_URL` est optionnel.
- si vide: le worker injecte des données mock,
- si rempli: le worker interroge l'endpoint data team puis persiste les données.

## Endpoints API

### `GET /api/health`
Santé API + infos worker + statut DB.

### `GET /api/readings`
Filtres disponibles:
- `startDate`, `endDate` (`YYYY-MM-DD`)
- `minLat`, `maxLat`, `minLng`, `maxLng`
- `minAqi`, `maxAqi`
- `limit`
- `aggregateBy=city` pour restituer les indices moyens par ville

Exemple:
```bash
curl "http://localhost:8787/api/readings?startDate=2026-03-20&endDate=2026-03-30&minLat=43&maxLat=49&minLng=1&maxLng=7&minAqi=30&maxAqi=180&aggregateBy=city&limit=100"
```

## Mapping avec ton barème

1. **Consommation & Persistance**
- Worker cyclique: `server/worker.js`
- Persistance PostgreSQL + index: `server/db.js`

2. **Backend & API Filtres**
- Endpoint de restitution: `GET /api/readings`
- Filtrage dates, zone géographique, bornes d'indice
- Mode agrégé `aggregateBy=city` pour les indices moyens

3. **Intégration Cartographique**
- Carte Leaflet: `src/App.jsx`
- Cercles avec indice affiché dedans (badge)
- Popup au clic avec infos détaillées
- Couleur liée à la valeur AQI

4. **IHM & UX**
- Formulaire complet de filtres
- Mise à jour dynamique de la carte sans rechargement
- États `loading`, `error`, `empty` + KPI

## Bonus clustering
Le clustering client/serveur n'est pas encore activé dans cette version, mais la structure est prête pour l'ajouter ensuite.
