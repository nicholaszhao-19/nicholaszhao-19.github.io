import {
  clamp, smooth, planets, planetPosition, orbitPoint, orbitBounds, planetaryDaysPerSecond,
  skyForward, skyRight, skyDown, stellarTimeFraction, lensScale, lensExtent
} from "./sky-physics.js?v=20261115-celestial";

const ringTilt = -0.38;
const cosRingTilt = Math.cos(ringTilt);
const sinRingTilt = Math.sin(ringTilt);
const mix = (a, b, t) => a + (b - a) * t;

function canvas2D(width, height, options) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, context: canvas.getContext("2d", options) };
}

function randomSequence(seed) {
  return function () {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function hash(x, y) {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function noise(x, y) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const u = smooth(x - i);
  const v = smooth(y - j);
  return mix(mix(hash(i, j), hash(i + 1, j), u), mix(hash(i, j + 1), hash(i + 1, j + 1), u), v);
}

function fractal(x, y) {
  return 0.58 * noise(x, y) + 0.28 * noise(2.11 * x + 8, 2.11 * y) + 0.14 * noise(4.32 * x, 4.32 * y + 5);
}

function colorBetween(a, b, amount) {
  return a.map((channel, index) => mix(channel, b[index], amount));
}

function paintMilkyWay(context, width, height, centerX, centerY, focal, dark) {
  const grid = canvas2D(Math.ceil(width / 4), Math.ceil(height / 4));
  const image = grid.context.createImageData(grid.canvas.width, grid.canvas.height);

  for (let j = 0; j < image.height; j++) {
    const v = ((j + 0.5) * height / image.height - centerY) / focal;
    for (let i = 0; i < image.width; i++) {
      const u = ((i + 0.5) * width / image.width - centerX) / focal;
      const inverseLength = 1 / Math.hypot(1, u, v);
      const galacticX = (skyForward[0] + u * skyRight[0] + v * skyDown[0]) * inverseLength;
      const galacticY = (skyForward[1] + u * skyRight[1] + v * skyDown[1]) * inverseLength;
      const galacticZ = (skyForward[2] + u * skyRight[2] + v * skyDown[2]) * inverseLength;
      const longitude = Math.atan2(galacticY, galacticX);
      const clouds = fractal(8.1 * longitude + 27, 27 * galacticZ + 11);
      const wisps = fractal(19 * longitude + 5 * clouds, 61 * galacticZ + 18);
      const dustCenter = galacticZ + 0.024 * Math.sin(8 * longitude) + 0.032 * (clouds - 0.5);
      const dust = Math.exp(-530 * dustCenter ** 2) * (0.37 + 0.62 * wisps);
      const disk = Math.exp(-7 * Math.abs(galacticZ)) * (11 + 24 * clouds * wisps);
      const bulge = Math.exp(-9 * (1 - galacticX) - 42 * galacticZ ** 2) * (12 + 25 * clouds);
      const light = 1.18 * (disk + bulge) * (1 - 0.80 * dust);
      const blue = clamp(0.35 + 0.6 * clouds - 0.3 * galacticX);
      const haze = 3 * fractal(2.2 * u - 7, 3.8 * v + 42);
      const k = 4 * (j * image.width + i);
      image.data[k] = dark ? 3 + haze + light * (0.53 - 0.29 * blue) : 250 - light * 0.23;
      image.data[k + 1] = dark ? 5 + haze + light * (0.45 + 0.05 * blue) : 251 - light * 0.17;
      image.data[k + 2] = dark ? 12 + 2 * haze + light * (0.64 + 0.51 * blue) : 253 - light * 0.045;
      image.data[k + 3] = 255;
    }
  }
  grid.context.putImageData(image, 0, 0);
  context.drawImage(grid.canvas, 0, 0, width, height);
}

const starPalette = [[161, 197, 255], [204, 224, 255], [247, 246, 237], [255, 220, 169], [255, 173, 125]];
const lightStarPalette = [[55, 81, 147], [63, 99, 151], [70, 86, 117], [133, 87, 51], [148, 71, 49]];

function starKernel(radius, peak, diffraction, width) {
  const reach = Math.ceil(5.6 * radius) + 1;
  const phases = [];
  // Four subpixel phases per axis retain the smooth drift of the bright stars.
  for (let phaseY = 0; phaseY < 4; phaseY++) {
    for (let phaseX = 0; phaseX < 4; phaseX++) {
      const points = [];
      for (let y = -reach; y <= reach; y++) {
        for (let x = -reach; x <= reach; x++) {
          const u = (x - phaseX / 4) / radius;
          const v = (y - phaseY / 4) / radius;
          const r2 = u * u + v * v;
          const point = Math.exp(-2.2 * r2);
          const glow = 0.30 * Math.exp(-0.42 * r2) + 0.06 * Math.exp(-0.13 * r2);
          const spikes = diffraction ? 0.16 * Math.exp(-0.3 * Math.sqrt(r2))
            * (Math.exp(-9 * u * u) + Math.exp(-9 * v * v)) : 0;
          const opacity = clamp(peak * (point + glow + spikes));
          if (opacity >= 1 / 512) points.push(4 * (y * width + x), opacity);
        }
      }
      phases.push(Float32Array.from(points));
    }
  }
  return { reach, phases };
}

function buildSky(width, height, density, margin, dark) {
  const plate = canvas2D(width + 2 * margin, height + 2 * margin, { alpha: false });
  const centerX = width / 2 + margin;
  const centerY = height / 2 + margin;
  const focal = 0.49 * Math.max(width, height);
  const rasterWidth = plate.canvas.width;
  const rasterHeight = plate.canvas.height;
  paintMilkyWay(plate.context, rasterWidth, rasterHeight, centerX, centerY, focal, dark);
  const dust = plate.context.getImageData(0, 0, rasterWidth, rasterHeight);
  const image = plate.context.createImageData(rasterWidth, rasterHeight);
  const frame = canvas2D(width, height, { alpha: false });
  const palette = dark ? starPalette : lightStarPalette;
  const exposures = [];
  for (let band = 0; band < 22; band++) {
    const magnitude = 0.5 * band - 1.5;
    const exposure = 10 ** (-0.25 * (magnitude - 5));
    const peak = (dark ? 1 : 0.54) * (0.17 + 0.81 * exposure / (exposure + 0.78));
    const radius = Math.max(0.55, density * (0.48 + 1.43 / (1 + 0.20 * Math.max(0, magnitude) ** 2)));
    exposures.push({ glow: magnitude < 5.4 ? starKernel(radius, peak, dark && magnitude < 1.3, rasterWidth) : null,
      flux: peak * Math.min(1.1, 1.85 * radius ** 2) });
  }
  const beacon = starKernel(Math.max(1.5, 2.35 * density), dark ? 1 : 0.87, false, rasterWidth);
  const beaconColor = dark ? [215, 235, 255] : [54, 100, 167];
  return { image, dust, frame, centerX, centerY, focal, margin, palette, exposures, beacon, beaconColor };
}

function fromGalactic(x, y, z, axis) {
  return x * axis[0] + y * axis[1] + z * axis[2];
}

function halfFloat(bits) {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 31;
  const mantissa = bits & 1023;
  return exponent === 0 ? sign * mantissa * 2 ** -24 : sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

async function loadCatalog() {
  const response = await fetch(new URL("./stars.bin?v=hyg41", import.meta.url));
  if (!response.ok) throw new Error(`Star catalog request returned ${response.status}`);
  const raw = new DataView(await response.arrayBuffer());
  if (raw.byteLength < 8 || raw.getUint32(0, true) !== 0x32475948) throw new Error("Unknown star catalog format");
  const count = raw.getUint32(4, true);
  const entrySize = 14;
  if (!count || raw.byteLength !== 8 + entrySize * count) throw new Error("Incomplete star catalog");
  const rows = new Float32Array(7 * count);
  for (let i = 0; i < count; i++) {
    const offset = 8 + entrySize * i;
    // Unit directions use fixed-point int16. The projected 350,000-year offsets use binary16.
    const x = raw.getInt16(offset, true) / 32767;
    const y = raw.getInt16(offset + 2, true) / 32767;
    const z = raw.getInt16(offset + 4, true) / 32767;
    const dx = halfFloat(raw.getUint16(offset + 6, true));
    const dy = halfFloat(raw.getUint16(offset + 8, true));
    const dz = halfFloat(raw.getUint16(offset + 10, true));
    const k = i * 7;
    rows[k] = fromGalactic(x, y, z, skyRight);
    rows[k + 1] = fromGalactic(x, y, z, skyDown);
    rows[k + 2] = fromGalactic(x, y, z, skyForward);
    rows[k + 3] = fromGalactic(dx, dy, dz, skyRight);
    rows[k + 4] = fromGalactic(dx, dy, dz, skyDown);
    rows[k + 5] = fromGalactic(dx, dy, dz, skyForward);
    rows[k + 6] = 5 * raw.getUint8(offset + 12) + raw.getUint8(offset + 13);
  }
  return rows;
}

function fallbackStars() {
  const random = randomSequence(1947);
  const rows = new Float32Array(7 * 4000);
  for (let i = 0; i < rows.length; i += 7) {
    rows[i] = 3.3 * (random() - 0.5);
    rows[i + 1] = 3.3 * (random() - 0.5);
    rows[i + 2] = 1;
    const drift = 0.16 * random() ** 3;
    rows[i + 3] = drift * (random() - 0.5);
    rows[i + 4] = drift * (random() - 0.5);
    rows[i + 5] = drift * (random() - 0.5);
    rows[i + 6] = 5 * Math.floor(5 + 17 * random() ** 0.36) + Math.floor(5 * random());
  }
  return rows;
}

function blendStarPixel(pixels, offset, tint, opacity) {
  pixels[offset] += opacity * (tint[0] - pixels[offset]);
  pixels[offset + 1] += opacity * (tint[1] - pixels[offset + 1]);
  pixels[offset + 2] += opacity * (tint[2] - pixels[offset + 2]);
}

function paintBrightStar(pixels, offset, fractionX, fractionY, tint, kernel) {
  const samples = kernel.phases[4 * Math.floor(4 * fractionY) + Math.floor(4 * fractionX)];
  for (let i = 0; i < samples.length; i += 2) {
    blendStarPixel(pixels, offset + samples[i], tint, samples[i + 1]);
  }
}

function drawSky(sky, stars, time, alignment) {
  const { image, dust, centerX, centerY, focal, margin, palette, exposures, beacon, beaconColor } = sky;
  const { data, width, height } = image;
  const stride = 4 * width;
  data.set(dust.data);
  if (stars) {
    // A four-pixel splat integrates the light of each unresolved faint star
    // without thousands of small canvas draws or any full-frame pixel readback.
    for (let i = 0; i < stars.length; i += 7) {
      const depth = stars[i + 2] + time * stars[i + 5];
      if (depth <= 0) continue;
      const x = centerX + focal * (stars[i] + time * stars[i + 3]) / depth;
      const y = centerY + focal * (stars[i + 1] + time * stars[i + 4]) / depth;
      const left = Math.floor(x);
      const top = Math.floor(y);
      const appearance = stars[i + 6];
      const { glow, flux } = exposures[Math.floor(appearance / 5)];
      const reach = glow?.reach ?? 1;
      if (left < reach || top < reach || left >= width - reach || top >= height - reach) continue;
      const tint = palette[appearance % 5];
      const offset = stride * top + 4 * left;
      const u = x - left;
      const v = y - top;
      if (glow) {
        paintBrightStar(data, offset, u, v, tint, glow);
      } else {
        blendStarPixel(data, offset, tint, flux * (1 - u) * (1 - v));
        blendStarPixel(data, offset + 4, tint, flux * u * (1 - v));
        blendStarPixel(data, offset + stride, tint, flux * (1 - u) * v);
        blendStarPixel(data, offset + stride + 4, tint, flux * u * v);
      }
    }
  }
  // The aligned demonstration uses its own finite-sized background source.
  if (alignment) {
    const offset = stride * (margin + alignment.y) + 4 * (margin + alignment.x);
    paintBrightStar(data, offset, 0, 0, beaconColor, beacon);
  }
}

function buildLens(einsteinRadius, sourceWidth) {
  const outer = lensExtent * einsteinRadius;
  const extent = Math.ceil(outer);
  const size = 2 * extent + 1;
  const layer = canvas2D(size, size);
  const image = layer.context.createImageData(size, size);
  const stride = 4 * sourceWidth;
  const capacity = size * size;
  const destination = new Int32Array(capacity);
  const source = new Int32Array(capacity);
  const mixX = new Float32Array(capacity);
  const mixY = new Float32Array(capacity);
  const exposure = new Float32Array(capacity);
  let count = 0;

  // Store a bilinear source lookup for each pixel in the local lens patch.
  for (let y = -extent; y <= extent; y++) {
    for (let x = -extent; x <= extent; x++) {
      const radius = Math.hypot(x, y);
      if (radius >= outer) continue;
      const factor = lensScale(radius, einsteinRadius);
      const u = x * factor;
      const v = y * factor;
      const left = Math.floor(u);
      const top = Math.floor(v);
      destination[count] = 4 * ((y + extent) * size + x + extent);
      source[count] = 4 * left + stride * top;
      mixX[count] = u - left;
      mixY[count] = v - top;
      // Bring out the lensed stars against the reading veil, especially near the critical curve.
      const scaledRadius = radius / einsteinRadius;
      const fade = 1 - smooth(clamp((scaledRadius - 1.24) / (lensExtent - 1.24)));
      exposure[count] = fade * (0.16 + 1.9 * Math.exp(-(((scaledRadius - 1) / 0.43) ** 2)));
      image.data[destination[count] + 3] = 255;
      count++;
    }
  }
  return { ...layer, image, extent, size, count, destination, source, mixX, mixY, exposure, stride };
}

function updateLens(lens, sky, x, y, contrast) {
  const { count, destination, source, mixX, mixY, exposure, stride } = lens;
  const input = sky.image.data;
  const diffuse = sky.dust.data;
  const origin = stride * (y + sky.margin) + 4 * (x + sky.margin);
  const output = lens.image.data;

  for (let i = 0; i < count; i++) {
    const top = origin + source[i];
    const bottom = top + stride;
    const dx = mixX[i];
    const dy = mixY[i];
    const target = destination[i];
    const gain = contrast * exposure[i];
    for (let channel = 0; channel < 3; channel++) {
      const a = input[top + channel];
      const b = input[bottom + channel];
      const upper = a + dx * (input[top + channel + 4] - a);
      const lower = b + dx * (input[bottom + channel + 4] - b);
      const lensed = upper + (lower - upper) * dy;
      const dustUpper = mix(diffuse[top + channel], diffuse[top + channel + 4], dx);
      const dustLower = mix(diffuse[bottom + channel], diffuse[bottom + channel + 4], dx);
      output[target + channel] = lensed + gain * (lensed - mix(dustUpper, dustLower, dy));
    }
  }
  lens.context.putImageData(lens.image, 0, 0);
}

const coronaExtent = 3.3;

function buildSun() {
  const size = 296;
  const layer = canvas2D(size, size);
  const image = layer.context.createImageData(size, size);
  const spotCenters = [[-0.31, 0.24, 0.052], [-0.21, 0.30, 0.028], [0.40, -0.20, 0.04]];

  for (let j = 0; j < size; j++) {
    const y = ((j + 0.5) / size * 2 - 1) * coronaExtent;
    for (let i = 0; i < size; i++) {
      const x = ((i + 0.5) / size * 2 - 1) * coronaExtent;
      const radius = Math.hypot(x, y);
      const index = 4 * (j * size + i);
      if (radius <= 1) {
        const mu = Math.sqrt(1 - radius ** 2);
        const granules = fractal(31 * x + 12, 31 * y + 28);
        const convection = fractal(8 * x + 9, 9 * y + 15);
        let temperature = 0.41 + 0.45 * mu + 0.29 * (convection - 0.48) + 0.21 * (granules - 0.48);
        for (const [sx, sy, spread] of spotCenters) {
          temperature -= 0.40 * Math.exp(-((x - sx) ** 2 + (y - sy) ** 2) / spread ** 2);
        }
        temperature = clamp(temperature);
        image.data[index] = mix(227, 255, temperature);
        image.data[index + 1] = mix(90, 252, temperature);
        image.data[index + 2] = mix(27, 228, temperature ** 1.26);
        image.data[index + 3] = 255;
      } else if (radius < coronaExtent) {
        const angle = Math.atan2(y, x) + 0.12 * (radius - 1);
        const rays = fractal(11 * Math.cos(angle) + 5, 11 * Math.sin(angle) + 9);
        const height = radius - 1;
        const innerGlow = 0.76 * Math.exp(-18 * height);
        const outerGlow = 0.23 * Math.exp(-3.8 * height);
        const streamers = (0.06 + 0.38 * rays ** 2) * Math.exp(-2.8 * height);
        const edge = 1 - smooth(clamp((radius - 2.7) / (coronaExtent - 2.7)));
        image.data[index] = 255;
        image.data[index + 1] = 114 + 75 * Math.exp(-6 * height);
        image.data[index + 2] = 36 + 56 * Math.exp(-6 * height);
        image.data[index + 3] = 255 * clamp((innerGlow + outerGlow + streamers) * edge);
      }
    }
  }

  layer.context.putImageData(image, 0, 0);
  return layer.canvas;
}

function planetColor(planet, x, y, z) {
  const latitude = 0.96 * y + 0.28 * x;
  const terrain = fractal(4.7 * x + 2 * z + 9, 4.8 * y + 3 * z + 3);
  const grain = noise(36 * x + z + 17, 36 * y + 11);
  const base = planet.base;

  switch (planet.name) {
    case "Venus":
      return colorBetween(base, [249, 224, 175], clamp(terrain + 0.20 * Math.sin(18 * latitude + 7 * terrain)));
    case "Earth": {
      const coast = terrain + 0.12 * noise(9 * x - z, 10 * y + 4);
      const land = colorBetween([50, 131, 104], [180, 159, 111], smooth(clamp((terrain - 0.45) * 5)));
      const surface = colorBetween(base, land, smooth(clamp((coast - 0.53) * 17)));
      const cloud = smooth(clamp((fractal(8 * x + 22, 9 * y + 12 * z) - 0.45) * 2.7));
      const ice = smooth(clamp((Math.abs(latitude) - 0.76) * 5));
      return colorBetween(surface, [217, 233, 246], Math.max(cloud, ice));
    }
    case "Mars": {
      const rock = colorBetween([105, 53, 45], base, clamp(0.20 + 1.20 * terrain + 0.15 * grain));
      return colorBetween(rock, [228, 193, 164], smooth(clamp((Math.abs(latitude) - 0.83) * 8)));
    }
    case "Jupiter":
    case "Saturn": {
      const bands = 0.48 + 0.24 * Math.sin(29 * latitude + 4 * terrain)
        + 0.14 * Math.sin(53 * latitude + 3 * grain);
      const giant = colorBetween(base, planet.name === "Jupiter" ? [131, 74, 53] : [165, 119, 81], bands);
      const storm = Math.exp(-(((x - 0.33) / 0.21) ** 2 + ((latitude - 0.31) / 0.10) ** 2));
      return planet.name === "Jupiter" ? colorBetween(giant, [177, 74, 49], storm * 0.87) : giant;
    }
    case "Uranus":
    case "Neptune":
      return colorBetween(base, [185, 227, 242], 0.15 + 0.17 * Math.sin(19 * latitude) + 0.14 * terrain);
    default:
      return colorBetween([84, 78, 80], base, clamp(0.25 + terrain + 0.25 * grain));
  }
}

function buildPlanet(planet) {
  const ringed = planet.name === "Saturn";
  const size = ringed ? 104 : 64;
  const span = ringed ? 2.28 : 1.04;
  const layer = canvas2D(size, size);
  const image = layer.context.createImageData(size, size);
  const normals = new Float32Array(3 * size * size);
  const albedo = new Uint8ClampedArray(3 * size * size);
  const rings = new Uint8Array(size * size);
  const pixelsPerRadius = size / (2 * span);

  for (let j = 0; j < size; j++) {
    const y = (j + 0.5 - size / 2) / pixelsPerRadius;
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5 - size / 2) / pixelsPerRadius;
      const distance = Math.hypot(x, y);
      const coverage = clamp((1 - distance) * pixelsPerRadius + 0.5);
      const z = Math.sqrt(Math.max(0, 1 - distance ** 2));
      const pixel = j * size + i;
      const normal = pixel * 3;

      if (ringed) {
        // Ring plane is inclined and tilted independently of the orbital plane.
        const ringX = cosRingTilt * x + sinRingTilt * y;
        const ringY = (-sinRingTilt * x + cosRingTilt * y) / 0.43;
        const ringZ = Math.sqrt(1 - 0.43 ** 2) * ringY;
        const ringRadius = Math.hypot(ringX, ringY);
        if (ringRadius > 1.30 && ringRadius < 2.22 && (coverage === 0 || ringZ > z)) {
          const gap = Math.exp(-(((ringRadius - 1.92) / 0.037) ** 2));
          const bands = 0.62 + 0.14 * Math.sin(27 * ringRadius) + 0.09 * Math.sin(76 * ringRadius);
          const color = colorBetween([129, 108, 93], [224, 202, 165], bands);
          albedo.set(color, normal);
          normals.set([x, y, ringZ], normal);
          rings[pixel] = 1;
          image.data[4 * pixel + 3] = 255 * bands * (1 - 0.91 * gap);
          continue;
        }
      }
      if (coverage === 0) continue;
      normals.set([x, y, z], normal);
      albedo.set(planetColor(planet, x, y, z), normal);
      image.data[4 * pixel + 3] = 255 * coverage;
    }
  }

  return { ...planet, ...layer, size, span, image, normals, albedo, rings };
}

function shadePlanet(planet, lightX, lightY, lightZ) {
  const { size, normals, albedo, rings, image } = planet;
  for (let i = 0; i < size * size; i++) {
    const pixel = 4 * i;
    if (image.data[pixel + 3] === 0) continue;
    const n = 3 * i;
    const x = normals[n];
    const y = normals[n + 1];
    const z = normals[n + 2];
    const dot = x * lightX + y * lightY + z * lightZ;
    let light = 0.21 + 0.79 * Math.sqrt(clamp(dot));

    if (rings[i]) {
      // A ring particle is in shadow if its ray to the Sun intersects Saturn.
      const shadow = dot < 0 && x * x + y * y + z * z - dot * dot < 1;
      light = shadow ? 0.23 : 0.83;
    }
    image.data[pixel] = albedo[n] * light;
    image.data[pixel + 1] = albedo[n + 1] * light;
    image.data[pixel + 2] = albedo[n + 2] * light + 8 * (1 - light);
  }
  planet.context.putImageData(image, 0, 0);
}

const firstOrbitalDay = 10_881;
const frameInterval = 32;

function solarLayout(width, height, density, sprites, bounds) {
  const [left, right, top, bottom] = bounds;
  const padding = Math.min(14 * density, 0.045 * Math.min(width, height));
  const preferred = density * clamp(Math.min(width / (1140 * density), height / (790 * density)), 0.66, 1.28);
  const scale = Math.min(preferred, (width - 2 * padding) / (right - left), (height - 2 * padding) / (bottom - top));
  const spacious = width / density > 760;
  const x = clamp(width * (spacious ? 0.80 : 0.54), padding - left * scale, width - padding - right * scale);
  const y = clamp(height * (spacious ? 0.56 : 0.70), padding - top * scale, height - padding - bottom * scale);
  const orbits = new Path2D();
  for (const planet of sprites) {
    for (let step = 0; step <= 96; step++) {
      const [px, py] = orbitPoint(planet, 2 * Math.PI * step / 96);
      if (step === 0) orbits.moveTo(x + px * scale, y + py * scale);
      else orbits.lineTo(x + px * scale, y + py * scale);
    }
    orbits.closePath();
  }
  return { x, y, scale, orbits,
    rectangle: [x + left * scale - 2, y + top * scale - 2, (right - left) * scale + 4, (bottom - top) * scale + 4] };
}

function drawSolarSystem(context, layout, sprites, sun, days, dark, density) {
  const { x, y, scale, orbits, rectangle } = layout;
  context.clearRect(...rectangle);
  context.strokeStyle = dark ? "rgba(143,175,224,0.14)" : "rgba(54,86,141,0.17)";
  context.lineWidth = 0.7 * density;
  context.stroke(orbits);

  const bodies = sprites.map(planet => {
    const [x, y, z] = planetPosition(planet, days);
    const length = Math.hypot(x, y, z);
    shadePlanet(planet, -x / length, -y / length, -z / length);
    return { canvas: planet.canvas, x, y, z, reach: planet.radius * planet.span };
  });
  bodies.push(sun);
  bodies.sort((a, b) => a.z - b.z);
  for (const body of bodies) {
    const reach = body.reach * scale;
    context.drawImage(body.canvas, x + body.x * scale - reach, y + body.y * scale - reach, 2 * reach, 2 * reach);
  }
}

function mount() {
  const base = canvas2D(1, 1, { alpha: false });
  const distortion = canvas2D(1, 1);
  const foreground = canvas2D(1, 1);
  if (!base.context || !distortion.context || !foreground.context) return;

  const root = document.documentElement;
  const wrapper = document.createElement("div");
  wrapper.className = "solar-sky";
  wrapper.setAttribute("aria-hidden", "true");
  wrapper.append(base.canvas, distortion.canvas, foreground.canvas);
  document.body.prepend(wrapper);

  const guide = document.querySelector("#sky-guide");
  const hint = document.querySelector("#sky-hint");
  const ringButton = document.querySelector("#show-einstein-ring");
  const motionButton = document.querySelector("#toggle-sky-motion");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const forcedColors = window.matchMedia("(forced-colors: active)");
  const hover = window.matchMedia("(any-hover: hover)");
  const sun = { canvas: buildSun(), x: 0, y: 0, z: 0, reach: 23 * coronaExtent };
  const sprites = planets.map(buildPlanet);
  const extremes = sprites.map(planet => orbitBounds(planet, planet.radius * planet.span));
  const bounds = [Math.min(-sun.reach, ...extremes.map(orbit => orbit[0][0])),
    Math.max(sun.reach, ...extremes.map(orbit => orbit[0][1])),
    Math.min(-sun.reach, ...extremes.map(orbit => orbit[1][0])),
    Math.max(sun.reach, ...extremes.map(orbit => orbit[1][1]))];
  let scene;
  let frame = null;
  let stars = null;
  let age = 0;
  let lastAnimation = null;
  let paused = false;
  let alignmentDemo = false;
  let needsResize = true;
  let skyDirty = true;
  let pointer = null;
  let touchStart = null;

  function updateControls() {
    ringButton.textContent = alignmentDemo ? "Hide Einstein ring" : "Show Einstein ring";
    motionButton.textContent = paused ? "Resume sky" : "Pause sky";
    motionButton.hidden = motion.matches;
    hint.textContent = alignmentDemo
      ? "An aligned star forms an Einstein ring."
      : motion.matches
        ? "Align a distant star to see a ring."
        : hover.matches ? "Move your cursor to bend starlight." : "Tap the sky to bend starlight.";
  }

  function target() {
    if (alignmentDemo) return scene.alignment;
    if (motion.matches || !pointer) return null;
    const { rect, width, height } = scene;
    const x = (pointer.x - rect.left) * width / rect.width;
    const y = (pointer.y - rect.top) * height / rect.height;
    if (x < 0 || x >= width || y < 0 || y >= height) return null;
    return { x: Math.min(Math.round(x), width - 1), y: Math.min(Math.round(y), height - 1) };
  }

  function resize() {
    needsResize = false;
    const rect = wrapper.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const density = Math.min(window.devicePixelRatio || 1, 1.25,
      Math.sqrt(1800000 / (rect.width * rect.height)), 2650 / Math.max(rect.width, rect.height));
    const width = Math.max(1, Math.round(rect.width * density));
    const height = Math.max(1, Math.round(rect.height * density));
    const einsteinRadius = density * clamp(0.098 * Math.min(rect.width, rect.height), 29, 64);
    const margin = Math.ceil(lensExtent * einsteinRadius) + 3;
    const lens = buildLens(einsteinRadius, width + 2 * margin);
    const inset = 1.24 * einsteinRadius;
    const alignment = {
      x: Math.round(clamp((rect.width > 760 ? 0.90 : 0.77) * width, Math.min(inset, width / 2), Math.max(width - inset, width / 2))),
      y: Math.round((rect.width > 760 ? 0.34 : 0.50) * (height - 1))
    };
    const dark = root.dataset.theme === "dark";
    const sky = buildSky(width, height, density, margin, dark);
    const solar = solarLayout(width, height, density, sprites, bounds);
    for (const { canvas } of [base, distortion, foreground]) {
      canvas.width = width;
      canvas.height = height;
    }
    scene = { rect, width, height, density, sky, lens, solar, alignment, dark, previous: null };
    skyDirty = true;
    return true;
  }

  function queueFrame() {
    if (!document.hidden && !forcedColors.matches && frame === null) frame = window.requestAnimationFrame(draw);
  }

  function draw(now) {
    frame = null;
    if (document.hidden || forcedColors.matches) return;
    const resized = needsResize && resize();
    if (!scene) return;

    const playing = !paused && !motion.matches;
    const elapsed = lastAnimation === null ? 0 : now - lastAnimation;
    const advance = playing && (lastAnimation === null || elapsed >= frameInterval);
    const { sky, lens, solar, width, height, density, dark, previous } = scene;
    if (advance) {
      lastAnimation = now;
      age += Math.min(0.12, elapsed / 1000);
      skyDirty = true;
    }
    if (resized || (advance && elapsed > 0)) {
      drawSolarSystem(foreground.context, solar, sprites, sun, firstOrbitalDay + age * planetaryDaysPerSecond, dark, density);
    }
    const refresh = skyDirty;
    if (refresh) {
      drawSky(sky, stars, stellarTimeFraction(age), alignmentDemo ? scene.alignment : null);
      // Upload the completed sky as a single image to its compositing layer.
      sky.frame.context.putImageData(sky.image, -sky.margin, -sky.margin, sky.margin, sky.margin, width, height);
      base.context.drawImage(sky.frame.canvas, 0, 0);
      skyDirty = false;
    }

    const position = target();
    const moved = position?.x !== previous?.x || position?.y !== previous?.y;
    if (moved && previous) {
      distortion.context.clearRect(previous.x - lens.extent, previous.y - lens.extent, lens.size, lens.size);
    }
    if (position && (moved || refresh)) {
      updateLens(lens, sky, position.x, position.y, alignmentDemo ? 0.24 : 1);
      distortion.context.drawImage(lens.canvas, position.x - lens.extent, position.y - lens.extent);
    }
    scene.previous = position;
    if (playing) queueFrame();
  }

  function invalidateSky() {
    needsResize = true;
    queueFrame();
  }

  function setAlignment(enabled) {
    alignmentDemo = enabled;
    skyDirty = true;
    updateControls();
    queueFrame();
  }

  function clearPointer() {
    pointer = null;
    queueFrame();
  }

  function follow(event) {
    if (motion.matches || forcedColors.matches || !event.isPrimary) return;
    if (alignmentDemo && event.target.closest?.("#show-einstein-ring")) return;
    if (alignmentDemo) setAlignment(false);
    pointer = { x: event.clientX, y: event.clientY };
    queueFrame();
  }

  window.addEventListener("pointermove", event => {
    if (event.pointerType !== "touch") follow(event);
  }, { passive: true });
  window.addEventListener("pointerdown", event => {
    if (event.isPrimary && event.pointerType === "touch" && !event.target.closest?.("a, button")) {
      touchStart = { x: event.clientX, y: event.clientY };
    }
  }, { passive: true });
  window.addEventListener("pointerup", event => {
    if (event.isPrimary && event.pointerType === "touch" && touchStart
      && Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) < 8) follow(event);
    touchStart = null;
  }, { passive: true });
  window.addEventListener("pointercancel", () => {
    touchStart = null;
    clearPointer();
  });
  root.addEventListener("pointerleave", event => {
    if (event.pointerType !== "touch") clearPointer();
  });
  window.addEventListener("blur", clearPointer);
  window.addEventListener("resize", invalidateSky, { passive: true });
  new MutationObserver(invalidateSky).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  motion.addEventListener("change", () => {
    lastAnimation = null;
    clearPointer();
    updateControls();
  });
  hover.addEventListener("change", updateControls);
  forcedColors.addEventListener("change", () => {
    lastAnimation = null;
    invalidateSky();
  });
  document.addEventListener("visibilitychange", () => {
    lastAnimation = null;
    touchStart = null;
    if (document.hidden && frame !== null) {
      window.cancelAnimationFrame(frame);
      frame = null;
    }
    clearPointer();
  });
  window.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      clearPointer();
      if (alignmentDemo) setAlignment(false);
    }
  });
  ringButton.addEventListener("click", () => {
    clearPointer();
    setAlignment(!alignmentDemo);
  });
  motionButton.addEventListener("click", () => {
    paused = !paused;
    lastAnimation = null;
    updateControls();
    queueFrame();
  });

  updateControls();
  guide.hidden = false;
  queueFrame();
  loadCatalog().catch(error => {
    console.warn("Could not load the stellar catalog. Showing the backup sky.", error);
    return fallbackStars();
  }).then(catalog => {
    stars = catalog;
    skyDirty = true;
    queueFrame();
  });
}

mount();
