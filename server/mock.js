const ZONES = [
  { city: 'Paris', latitude: 48.8566, longitude: 2.3522 },
  { city: 'Lille', latitude: 50.6292, longitude: 3.0573 },
  { city: 'Nantes', latitude: 47.2184, longitude: -1.5536 },
  { city: 'Rennes', latitude: 48.1173, longitude: -1.6778 },
  { city: 'Bordeaux', latitude: 44.8378, longitude: -0.5792 },
  { city: 'Toulouse', latitude: 43.6047, longitude: 1.4442 },
  { city: 'Lyon', latitude: 45.764, longitude: 4.8357 },
  { city: 'Strasbourg', latitude: 48.5734, longitude: 7.7521 },
  { city: 'Nice', latitude: 43.7102, longitude: 7.262 },
  { city: 'Marseille', latitude: 43.2965, longitude: 5.3698 },
];

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function generateAqi() {
  const roll = Math.random();

  if (roll < 0.35) return Math.round(randomBetween(18, 55));
  if (roll < 0.68) return Math.round(randomBetween(56, 100));
  if (roll < 0.86) return Math.round(randomBetween(101, 150));
  if (roll < 0.96) return Math.round(randomBetween(151, 200));
  return Math.round(randomBetween(201, 250));
}

function jitter(base, amount) {
  return Number((base + randomBetween(-amount, amount)).toFixed(4));
}

export function generateMockReading({ measuredAt = new Date().toISOString() } = {}) {
  const zone = ZONES[Math.floor(Math.random() * ZONES.length)];

  return {
    measuredAt,
    city: zone.city,
    latitude: jitter(zone.latitude, 0.28),
    longitude: jitter(zone.longitude, 0.28),
    aqi: generateAqi(),
    source: 'mock-worker',
  };
}

export function generateMockBatch(count = 10, measuredAt = new Date().toISOString()) {
  return Array.from({ length: count }, () => generateMockReading({ measuredAt }));
}
