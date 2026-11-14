(function () {
  "use strict";

  const tau = 2 * Math.PI;
  const orbitTilt = -0.20;
  const ringTilt = -0.38;
  const cosOrbitTilt = Math.cos(orbitTilt);
  const sinOrbitTilt = Math.sin(orbitTilt);
  const cosRingTilt = Math.cos(ringTilt);
  const sinRingTilt = Math.sin(ringTilt);
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);

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

  function paintDust(context, width, height, margin, viewWidth, viewHeight, dark) {
    const grid = canvas2D(Math.ceil(width / 7), Math.ceil(height / 7));
    const image = grid.context.createImageData(grid.canvas.width, grid.canvas.height);

    for (let j = 0; j < image.height; j++) {
      const y = (height * j / image.height - margin) / viewHeight;
      for (let i = 0; i < image.width; i++) {
        const x = (width * i / image.width - margin) / viewWidth;
        const distance = y - (0.88 - 0.68 * x + 0.08 * Math.sin(5 * x));
        const cloud = Math.exp(-17 * distance ** 2);
        const wisps = fractal(5.5 * x + 13, 11 * y + 6);
        const dustLane = clamp((fractal(9 * x, 17 * y) - 0.25) * 1.65);
        const glow = cloud * wisps ** 2 * (0.2 + 0.8 * dustLane);
        const violet = Math.exp(-3.8 * ((x - 0.12) ** 2 + (y - 0.84) ** 2));
        const k = 4 * (j * image.width + i);
        image.data[k] = dark ? 3 + 23 * glow + 5 * violet : 250 - 7 * glow;
        image.data[k + 1] = dark ? 5 + 32 * glow + 2 * violet : 251 - 6 * glow;
        image.data[k + 2] = dark ? 11 + 62 * glow + 9 * violet : 254 - 2 * glow;
        image.data[k + 3] = 255;
      }
    }

    grid.context.putImageData(image, 0, 0);
    context.drawImage(grid.canvas, 0, 0, width, height);
  }

  function paintStar(image, x, y, radius, color, brightness, halo) {
    const reach = halo ? 4.8 * radius : 1.7 * radius;
    const minX = Math.max(0, Math.floor(x - reach));
    const maxX = Math.min(image.width - 1, Math.ceil(x + reach));
    const minY = Math.max(0, Math.floor(y - reach));
    const maxY = Math.min(image.height - 1, Math.ceil(y + reach));

    for (let j = minY; j <= maxY; j++) {
      const dy = (j - y) / radius;
      for (let i = minX; i <= maxX; i++) {
        const dx = (i - x) / radius;
        const distance = dx ** 2 + dy ** 2;
        const core = Math.exp(-2.2 * distance);
        const glow = halo ? 0.23 * Math.exp(-0.23 * distance) + 0.034 * Math.exp(-0.09 * distance) : 0;
        const alpha = brightness * Math.min(1, core + glow);
        const k = 4 * (j * image.width + i);
        for (let channel = 0; channel < 3; channel++) {
          image.data[k + channel] = mix(image.data[k + channel], color[channel], alpha);
        }
      }
    }
  }

  function buildSky(width, height, density, margin, dark, alignment) {
    const source = canvas2D(width + 2 * margin, height + 2 * margin, { willReadFrequently: true });
    const skyWidth = source.canvas.width;
    const skyHeight = source.canvas.height;
    paintDust(source.context, skyWidth, skyHeight, margin, width, height, dark);
    const image = source.context.getImageData(0, 0, skyWidth, skyHeight);
    const palette = dark
      ? [[248, 244, 231], [177, 212, 255], [255, 181, 113], [153, 221, 246]]
      : [[72, 94, 129], [55, 106, 160], [145, 92, 62], [63, 126, 138]];
    const random = randomSequence(1947);
    const count = Math.min(5200, Math.ceil(skyWidth * skyHeight / (510 * density ** 2)));

    for (let i = 0; i < count; i++) {
      const x = random() * (skyWidth - 1);
      const uniformY = random() * (skyHeight - 1);
      const u = (x - margin) / width;
      const bandCenter = margin + height * (0.88 - 0.68 * u + 0.08 * Math.sin(5 * u));
      const bandY = bandCenter + height * 0.28 * (random() + random() - 1);
      const y = random() < 0.24 ? bandY : uniformY;
      const strength = random();
      const color = random();
      const tint = palette[color < 0.56 ? 0 : color < 0.79 ? 1 : color < 0.92 ? 2 : 3];
      const bright = strength > 0.95;
      const radius = Math.max(0.57, density * (bright ? 1.05 + 1.7 * random() ** 2 : 0.35 + 0.65 * strength));
      const brightness = bright ? 0.38 + 0.49 * random() : 0.10 + 0.32 * strength ** 2;
      paintStar(image, x, y, radius, tint, brightness * (dark ? 1 : 0.50), bright);
    }

    // The demonstration aligns the lens with this stationary background source.
    paintStar(image, margin + alignment.x, margin + alignment.y, 3.4 * density,
      dark ? [212, 236, 255] : [53, 104, 156], dark ? 1 : 0.78, true);
    source.context.putImageData(image, 0, 0);
    return { canvas: source.canvas, image, margin };
  }

  function lensScale(radius, einsteinRadius, inner, outer) {
    // Point-mass thin lens: beta = theta (1 - theta_E^2 / |theta|^2).
    // Fade only the weak-field tail so the computed patch joins the stationary sky.
    const weight = 1 - smooth(clamp((radius - inner) / (outer - inner)));
    return 1 - weight * (einsteinRadius / radius) ** 2;
  }

  function buildLens(sky, einsteinRadius, solarRadius) {
    // Both images must use the untapered map when the secondary clears the Sun.
    const inner = einsteinRadius ** 2 / solarRadius;
    const outer = 3.25 * einsteinRadius;
    const extent = Math.ceil(outer);
    const size = 2 * extent + 1;
    const layer = canvas2D(size, size);
    const image = layer.context.createImageData(size, size);
    const sourceWidth = sky.image.width;
    const stride = 4 * sourceWidth;
    const capacity = Math.ceil(Math.PI * (outer + 1) ** 2);
    const destination = new Int32Array(capacity);
    const source = new Int32Array(capacity);
    const mixX = new Float32Array(capacity);
    const mixY = new Float32Array(capacity);
    let count = 0;

    // The mapping depends only on position relative to the Sun and can be cached.
    for (let y = -extent; y <= extent; y++) {
      for (let x = -extent; x <= extent; x++) {
        const radius = Math.hypot(x, y);
        if (radius <= solarRadius || radius >= outer) continue;
        const factor = lensScale(radius, einsteinRadius, inner, outer);
        const u = x * factor;
        const v = y * factor;
        const left = Math.floor(u);
        const top = Math.floor(v);
        destination[count] = 4 * ((y + extent) * size + x + extent);
        source[count] = 4 * left + stride * top;
        mixX[count] = u - left;
        mixY[count] = v - top;
        image.data[destination[count] + 3] = 255;
        count++;
      }
    }
    return { ...layer, image, extent, count, destination, source, mixX, mixY, stride, x: -1, y: -1 };
  }

  function updateLens(lens, sky, x, y) {
    if (lens.x === x && lens.y === y) return;
    lens.x = x;
    lens.y = y;

    const { count, destination, source, mixX, mixY, stride } = lens;
    const input = sky.image.data;
    const output = lens.image.data;
    const origin = 4 * (x + sky.margin) + stride * (y + sky.margin);

    for (let i = 0; i < count; i++) {
      const top = origin + source[i];
      const bottom = top + stride;
      const dx = mixX[i];
      const dy = mixY[i];
      const target = destination[i];
      for (let channel = 0; channel < 3; channel++) {
        const a = input[top + channel];
        const b = input[bottom + channel];
        const upper = a + dx * (input[top + channel + 4] - a);
        const lower = b + dx * (input[bottom + channel + 4] - b);
        output[target + channel] = upper + (lower - upper) * dy;
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

  // Radii, orbital distances and periods are spaced for visibility in the illustration.
  const planetSettings = [
    { name: "Mercury", orbit: 47, radius: 3.3, period: 14, phase: 0.80, base: [157, 148, 141] },
    { name: "Venus", orbit: 66, radius: 4.8, period: 23, phase: 4.18, base: [220, 166, 104] },
    { name: "Earth", orbit: 87, radius: 5.4, period: 33, phase: 5.25, base: [39, 99, 178] },
    { name: "Mars", orbit: 111, radius: 4.2, period: 44, phase: 3.72, base: [205, 104, 64] },
    { name: "Jupiter", orbit: 151, radius: 13.5, period: 66, phase: 3.40, base: [215, 173, 133] },
    { name: "Saturn", orbit: 194, radius: 10.2, period: 88, phase: 1.31, base: [217, 188, 130] },
    { name: "Uranus", orbit: 239, radius: 6.8, period: 120, phase: 4.53, base: [133, 207, 213] },
    { name: "Neptune", orbit: 282, radius: 6.7, period: 157, phase: 4.98, base: [78, 116, 209] }
  ];

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
      let light = 0.17 + 0.83 * Math.sqrt(clamp(dot));

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

  function orbitPosition(planet, seconds, scale) {
    const angle = planet.phase + tau * seconds / planet.period;
    const radius = planet.orbit * scale;
    const planeX = Math.cos(angle);
    const orbitY = Math.sin(angle);
    const planeY = 0.54 * orbitY;
    const x = cosOrbitTilt * planeX - sinOrbitTilt * planeY;
    const y = sinOrbitTilt * planeX + cosOrbitTilt * planeY;
    const z = Math.sqrt(1 - 0.54 ** 2) * orbitY;
    return { planet, x: radius * x, y: radius * y, z: radius * z, light: [-x, -y, -z] };
  }

  function mount() {
    const base = canvas2D(1, 1);
    const foreground = canvas2D(1, 1);
    if (!base.context || !foreground.context) return;

    const root = document.documentElement;
    const wrapper = document.createElement("div");
    wrapper.className = "solar-sky";
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.append(base.canvas, foreground.canvas);
    document.body.prepend(wrapper);

    const guide = document.querySelector("#sky-guide");
    const hint = document.querySelector("#sky-hint");
    const ringButton = document.querySelector("#show-einstein-ring");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const forcedColors = window.matchMedia("(forced-colors: active)");
    const hover = window.matchMedia("(any-hover: hover)");
    const sun = buildSun();
    const planets = planetSettings.map(buildPlanet);
    const outerOrbit = Math.max(...planets.map(planet => planet.orbit + planet.radius * planet.span));
    let scene;
    let frame = null;
    let lastDraw = null;
    let elapsed = 0;
    let alignmentDemo = false;
    let needsResize = true;
    let pointer = null;
    let touchStart = null;

    function updateHint() {
      hint.textContent = alignmentDemo
        ? "Starlight forms a ring around the aligned Sun."
        : motion.matches || !hover.matches
          ? "See how a background star bends into a ring."
          : "Move your pointer to bend starlight.";
    }

    function point(x, y) {
      const rect = wrapper.getBoundingClientRect();
      return {
        x: clamp((x - rect.left) / rect.width),
        y: clamp((y - rect.top) / rect.height)
      };
    }

    function target() {
      if (alignmentDemo) return scene.alignment;
      if (motion.matches || !pointer) return scene.rest;
      return { x: pointer.x * (scene.width - 1), y: pointer.y * (scene.height - 1) };
    }

    function resize() {
      needsResize = false;
      const old = scene;
      const rect = wrapper.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const density = Math.min(window.devicePixelRatio || 1, 1.5,
        Math.sqrt(2450000 / (rect.width * rect.height)), 3000 / Math.max(rect.width, rect.height));
      const width = Math.max(1, Math.round(rect.width * density));
      const height = Math.max(1, Math.round(rect.height * density));
      const scale = density * clamp(Math.min(rect.width / 1040, rect.height / 840), 0.60, 1.22);
      const solarRadius = 26 * scale;
      const einsteinRadius = 58 * scale;
      const margin = Math.ceil(Math.max(3.25 * einsteinRadius, einsteinRadius ** 2 / solarRadius)) + 2;
      const rightSide = rect.width > 1090 ? clamp(0.5 + 570 / rect.width, 0.845, 0.925) : 0.73;
      const alignment = { x: Math.round((width - 1) * rightSide), y: Math.round((height - 1) * 0.54) };
      const rest = { x: alignment.x, y: Math.round((height - 1) * 0.30) };
      const sky = buildSky(width, height, density, margin, root.dataset.theme === "dark", alignment);
      const lens = buildLens(sky, einsteinRadius, solarRadius);

      for (const { canvas } of [base, foreground]) {
        canvas.width = width;
        canvas.height = height;
      }
      base.context.drawImage(sky.canvas, margin, margin, width, height, 0, 0, width, height);
      scene = { width, height, scale, solarRadius, sky, lens, alignment, rest, previous: null };
      scene.center = old && pointer && !alignmentDemo && !motion.matches
        ? { x: old.center.x * width / old.width, y: old.center.y * height / old.height }
        : { ...target() };
    }

    function draw(seconds) {
      const { context } = foreground;
      const { scale, solarRadius, center, sky, lens, previous } = scene;
      const x = clamp(Math.round(center.x), 0, scene.width - 1);
      const y = clamp(Math.round(center.y), 0, scene.height - 1);
      const extent = Math.max(lens.extent, Math.ceil(outerOrbit * scale) + 2);
      if (previous) {
        context.clearRect(previous.x - extent, previous.y - extent, 2 * extent + 1, 2 * extent + 1);
      }
      scene.previous = { x, y };
      updateLens(lens, sky, x, y);
      context.drawImage(lens.canvas, x - lens.extent, y - lens.extent);

      const bodies = planets.map(planet => orbitPosition(planet, seconds, scale));
      bodies.push({ z: 0 });
      bodies.sort((a, b) => a.z - b.z);
      for (const body of bodies) {
        if (!body.planet) {
          const reach = solarRadius * coronaExtent;
          context.drawImage(sun, x - reach, y - reach, 2 * reach, 2 * reach);
          continue;
        }
        const { planet, light } = body;
        const reach = planet.radius * scale * planet.span;
        const left = x + body.x - reach;
        const top = y + body.y - reach;
        if (left >= scene.width || left + 2 * reach < 0 || top >= scene.height || top + 2 * reach < 0) continue;
        shadePlanet(planet, ...light);
        context.drawImage(planet.canvas, left, top, 2 * reach, 2 * reach);
      }
    }

    function queueFrame() {
      if (!document.hidden && !forcedColors.matches && frame === null) frame = window.requestAnimationFrame(tick);
    }

    function tick(now) {
      frame = null;
      if (forcedColors.matches) return;
      if (needsResize) resize();
      if (!scene) return;

      const delta = lastDraw === null ? 0 : Math.min(80, now - lastDraw);
      // Bound raster work while the point-mass patch follows the pointer.
      if (lastDraw !== null && !motion.matches && delta < 22) {
        queueFrame();
        return;
      }
      lastDraw = now;
      elapsed += motion.matches ? 0 : delta;
      const destination = target();
      const { center } = scene;

      if (alignmentDemo || motion.matches || Math.hypot(center.x - destination.x, center.y - destination.y) < 0.5) {
        Object.assign(center, destination);
      } else {
        const easing = 1 - Math.exp(-delta / 42);
        center.x = mix(center.x, destination.x, easing);
        center.y = mix(center.y, destination.y, easing);
      }
      draw(elapsed / 1000);
      if (!motion.matches) queueFrame();
    }

    function invalidateSky() {
      needsResize = true;
      lastDraw = null;
      queueFrame();
    }

    function follow(event) {
      if (motion.matches || forcedColors.matches || !event.isPrimary) return;
      if (alignmentDemo) {
        if (event.target.closest?.("#show-einstein-ring")) return;
        alignmentDemo = false;
        updateHint();
      }
      pointer = point(event.clientX, event.clientY);
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
    window.addEventListener("pointercancel", () => { touchStart = null; });
    root.addEventListener("pointerleave", () => { pointer = null; });
    window.addEventListener("resize", invalidateSky, { passive: true });
    new MutationObserver(invalidateSky).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    motion.addEventListener("change", () => {
      pointer = null;
      lastDraw = null;
      updateHint();
      queueFrame();
    });
    hover.addEventListener("change", updateHint);
    forcedColors.addEventListener("change", invalidateSky);
    document.addEventListener("visibilitychange", () => {
      lastDraw = null;
      touchStart = null;
      if (!document.hidden) {
        queueFrame();
      } else if (frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
    });
    ringButton.addEventListener("click", () => {
      alignmentDemo = true;
      updateHint();
      queueFrame();
    });

    updateHint();
    guide.hidden = false;
    queueFrame();
  }

  mount();
}());
