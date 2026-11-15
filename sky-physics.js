const radians = Math.PI / 180;
const tau = 2 * Math.PI;

export const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
export const smooth = t => t * t * (3 - 2 * t);
export const planetaryDaysPerSecond = 6;
export const stellarHorizonYears = 350_000;
export const lensExtent = 2.85;

// Fixed J2000 elements from JPL Table 1: a, e, i, L, longitude of perihelion, longitude of node.
// Earth's elements represent the Earth–Moon barycenter at this scale.
const planetSettings = [
  { name: "Mercury", elements: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
    axis: 43, radius: 4.4, base: [175, 163, 154] },
  { name: "Venus", elements: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
    axis: 65, radius: 6.1, base: [229, 178, 112] },
  { name: "Earth", elements: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
    axis: 87, radius: 6.4, base: [52, 114, 188] },
  { name: "Mars", elements: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    axis: 113, radius: 4.9, base: [219, 108, 68] },
  { name: "Jupiter", elements: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    axis: 147, radius: 14.8, base: [228, 183, 146] },
  { name: "Saturn", elements: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    axis: 184, radius: 12.2, base: [228, 197, 142] },
  { name: "Uranus", elements: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
    axis: 220, radius: 7.8, base: [141, 219, 224] },
  { name: "Neptune", elements: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    axis: 260, radius: 7.6, base: [118, 176, 218] }
];

export function eccentricAnomaly(meanAnomaly, eccentricity) {
  const mean = meanAnomaly - tau * Math.round(meanAnomaly / tau);
  let anomaly = mean + eccentricity * Math.sin(mean);
  for (let step = 0; step < 5; step++) {
    anomaly -= (anomaly - eccentricity * Math.sin(anomaly) - mean) / (1 - eccentricity * Math.cos(anomaly));
  }
  return anomaly;
}

function projectOrbitVector(x, y, z) {
  const flat = 0.54;
  const lift = Math.sqrt(1 - flat ** 2);
  const down = -flat * y + lift * z;
  const roll = -0.19;
  return [Math.cos(roll) * x - Math.sin(roll) * down,
    Math.sin(roll) * x + Math.cos(roll) * down, lift * y + flat * z];
}

function makeOrbit(planet) {
  const [a, eccentricity, tilt, longitude, perihelion, node] = planet.elements;
  const inclination = tilt * radians;
  const ascendingNode = node * radians;
  const argument = (perihelion - node) * radians;
  const c = Math.cos(ascendingNode);
  const s = Math.sin(ascendingNode);
  const transform = angle => {
    const x = Math.cos(angle);
    const y = Math.sin(angle) * Math.cos(inclination);
    const z = Math.sin(angle) * Math.sin(inclination);
    return projectOrbitVector(c * x - s * y, s * x + c * y, z);
  };
  return { ...planet, a, eccentricity, p: transform(argument), q: transform(argument + Math.PI / 2),
    minorRatio: Math.sqrt(1 - eccentricity ** 2), meanAtEpoch: (longitude - perihelion) * radians,
    periodDays: 365.256 * a ** 1.5 };
}

export const planets = planetSettings.map(makeOrbit);

export function orbitPoint(orbit, anomaly, axis = orbit.axis) {
  const x = axis * (Math.cos(anomaly) - orbit.eccentricity);
  const y = axis * orbit.minorRatio * Math.sin(anomaly);
  return orbit.p.map((component, index) => x * component + y * orbit.q[index]);
}

export function planetPosition(orbit, days, axis = orbit.axis) {
  const mean = orbit.meanAtEpoch + tau * days / orbit.periodDays;
  return orbitPoint(orbit, eccentricAnomaly(mean, orbit.eccentricity), axis);
}

export function orbitBounds(orbit, extent) {
  return orbit.p.slice(0, 2).map((component, index) => {
    const center = -orbit.axis * orbit.eccentricity * component;
    const reach = orbit.axis * Math.hypot(component, orbit.minorRatio * orbit.q[index]) + extent;
    return [center - reach, center + reach];
  });
}

export function stellarTimeFraction(seconds) {
  // Speed up proper motions while keeping the rectilinear approximation inside its chosen horizon.
  return -Math.expm1(-Math.max(0, seconds) * 5400 / stellarHorizonYears);
}

// Sky camera in Galactic coordinates. The catalog generator uses this sightline for its cone cut.
const longitude = 16 * radians;
const latitude = 7 * radians;
const roll = 28 * radians;
export const skyForward = [Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude)];
const west = [Math.sin(longitude), -Math.cos(longitude), 0];
const south = [Math.sin(latitude) * Math.cos(longitude), Math.sin(latitude) * Math.sin(longitude), -Math.cos(latitude)];
export const skyRight = west.map((x, i) => Math.cos(roll) * x + Math.sin(roll) * south[i]);
export const skyDown = south.map((x, i) => Math.cos(roll) * x - Math.sin(roll) * west[i]);

export function lensScale(radius, einsteinRadius) {
  // Inverse thin-lens map beta = theta - alpha(theta). Inside the small core,
  // M(<r)/M = 2(r/core)^2 - (r/core)^4, giving finite deflection at the center.
  const core = 0.52 * einsteinRadius;
  const inner = 1.78 * einsteinRadius;
  const outer = lensExtent * einsteinRadius;
  const inverseRadiusSquared = radius < core
    ? (2 - (radius / core) ** 2) / core ** 2
    : 1 / radius ** 2;
  const weight = 1 - smooth(clamp((radius - inner) / (outer - inner)));
  return 1 - weight * einsteinRadius ** 2 * inverseRadiusSquared;
}
