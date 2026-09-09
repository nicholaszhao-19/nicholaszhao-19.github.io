/* Classical particle-field illustration, not a quantum-mechanical atom model.
   Softened inverse-square forces + inertia, integrated at a fixed time step. */
(function () {
  "use strict";
  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.className = "atomic-background";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  var root = document.documentElement;
  var reduced = matchMedia("(prefers-reduced-motion: reduce)");
  var width = 0, height = 0, particles = [], nuclei = [];
  var frame = 0, previous = null, accumulator = 0, step = 1 / 120;
  var pointer = { x: 0, y: 0, active: false, strength: 0 };
  var colors, dark, seed = 19;
  var tau = Math.PI * 2;

  function random() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function rgba(color, alpha) { return "rgba(" + colors[color % 4] + "," + alpha + ")"; }
  function theme() {
    dark = root.dataset.theme === "dark";
    colors = dark
      ? ["132,194,245", "187,153,235", "232,191,130", "166,222,228"]
      : ["47,111,170", "128,82,177", "168,119,52", "37,131,144"];
    draw();
  }
  function resize() {
    var oldWidth = width, oldHeight = height;
    width = window.innerWidth; height = window.innerHeight;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (oldWidth && oldHeight) {
      particles.concat(nuclei).forEach(function (p) {
        p.x *= width / oldWidth; p.y *= height / oldHeight;
        if (p.trail) p.trail = [];
      });
      pointer.active = false;
    } else {
      seed = 19;
      [[0.10, 0.24], [0.89, 0.61], [0.20, 0.94], [0.77, 0.06]].forEach(function (a, i) {
        nuclei.push({ x: a[0] * width, y: a[1] * height, ax: a[0], ay: a[1], vx: 0, vy: 0, color: i });
      });
      var count = Math.min(760, Math.max(200, Math.round(width * height / 1450)));
      for (var i = 0; i < count; i++) {
        var parent = i % nuclei.length, nucleus = nuclei[parent];
        var angle = random() * tau;
        var orbit = 24 + Math.pow(random(), 0.72) * Math.min(width, height) * 0.72;
        var x = nucleus.x + Math.cos(angle) * orbit;
        var y = nucleus.y + Math.sin(angle) * orbit;
        if (i % 3 === 0 || x < 0 || x > width || y < 0 || y > height) {
          x = random() * width; y = random() * height;
        }
        var dx = x - nucleus.x, dy = y - nucleus.y;
        var r = Math.max(1, Math.hypot(dx, dy));
        // Circular-orbit speed for the same softened potential used below.
        var speed = Math.sqrt(85000 * r * r / Math.pow(r * r + 900, 1.5));
        var direction = parent % 2 ? -1 : 1;
        particles.push({ x: x, y: y, vx: -dy / r * speed * direction, vy: dx / r * speed * direction,
          parent: parent, radius: 0.8 + Math.pow(random(), 3) * 2.5,
          color: Math.floor(random() * 4), alpha: 0.38 + random() * 0.50,
          trail: [], traced: i % 9 === 0 });
      }
    }
    draw();
  }
  function cursorForce(p) {
    var dx = pointer.x - p.x, dy = pointer.y - p.y;
    var r2 = dx * dx + dy * dy;
    // A soft core prevents singular acceleration at the cursor.
    var f = pointer.strength * 2200000 * (1 - 625 / (r2 + 625)) / Math.pow(r2 + 6400, 1.5);
    return [dx * f, dy * f];
  }
  function integrate(dt) {
    pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * (1 - Math.exp(-dt * 4));
    nuclei.forEach(function (n) {
      var force = cursorForce(n);
      // Spring tethers and drag let each heavier nucleus follow and then return.
      n.vx += ((n.ax * width - n.x) * 0.32 + force[0] * 0.22 - n.vx * 1.25) * dt;
      n.vy += ((n.ay * height - n.y) * 0.32 + force[1] * 0.22 - n.vy * 1.25) * dt;
      n.x += n.vx * dt; n.y += n.vy * dt;
    });
    particles.forEach(function (p) {
      var n = nuclei[p.parent], dx = n.x - p.x, dy = n.y - p.y;
      var force = 85000 / Math.pow(dx * dx + dy * dy + 900, 1.5);
      var cursor = cursorForce(p);
      // Semi-implicit Euler: update velocity before position. Very light drag
      // during interaction dissipates energy without erasing idle orbital motion.
      var drag = Math.exp(-pointer.strength * dt * 0.075);
      p.vx = (p.vx + (dx * force + cursor[0]) * dt) * drag;
      p.vy = (p.vy + (dy * force + cursor[1]) * dt) * drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      // Elastic viewport walls keep the finite particle field populated.
      if (p.x < p.radius) { p.x = p.radius; p.vx = Math.abs(p.vx); }
      if (p.x > width - p.radius) { p.x = width - p.radius; p.vx = -Math.abs(p.vx); }
      if (p.y < p.radius) { p.y = p.radius; p.vy = Math.abs(p.vy); }
      if (p.y > height - p.radius) { p.y = height - p.radius; p.vy = -Math.abs(p.vy); }
    });
    collide();
  }
  function collide() {
    // Local spatial bins avoid an all-pairs calculation. Elastic contacts keep
    // attracted particles from merging; mass is proportional to disc area.
    var bins = new Map(), cell = 8;
    particles.forEach(function (p) {
      var bx = Math.floor(p.x / cell), by = Math.floor(p.y / cell);
      for (var ix = bx - 1; ix <= bx + 1; ix++) {
        for (var iy = by - 1; iy <= by + 1; iy++) {
          var neighbors = bins.get(ix + "," + iy);
          if (!neighbors) continue;
          neighbors.forEach(function (q) {
            var dx = p.x - q.x, dy = p.y - q.y;
            var distance = Math.hypot(dx, dy), contact = p.radius + q.radius;
            if (distance >= contact) return;
            var nx = distance > 0.0001 ? dx / distance : 1;
            var ny = distance > 0.0001 ? dy / distance : 0;
            var pm = p.radius * p.radius, qm = q.radius * q.radius;
            var overlap = contact - distance;
            p.x += nx * overlap * qm / (pm + qm); p.y += ny * overlap * qm / (pm + qm);
            q.x -= nx * overlap * pm / (pm + qm); q.y -= ny * overlap * pm / (pm + qm);
            var closing = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
            if (closing >= 0) return;
            var impulse = -2 * closing / (1 / pm + 1 / qm);
            p.vx += impulse * nx / pm; p.vy += impulse * ny / pm;
            q.vx -= impulse * nx / qm; q.vy -= impulse * ny / qm;
          });
        }
      }
      var key = bx + "," + by;
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(p);
    });
  }
  function visibility(x) {
    var margin = Math.max(0, (width - 960) / 2);
    var edge = Math.min(x, width - x);
    var quiet = Math.max(0, Math.min(1, (edge - margin + 25) / 110));
    // Still visible through the reading column, strongest along the margins.
    return 1 - quiet * (dark ? 0.52 : 0.55);
  }
  function circle(x, y, radius, color, alpha) {
    ctx.fillStyle = rgba(color, alpha);
    ctx.beginPath(); ctx.arc(x, y, radius, 0, tau); ctx.fill();
  }
  function draw() {
    if (!colors || !width) return;
    ctx.clearRect(0, 0, width, height);
    nuclei.forEach(function (n) {
      var alpha = visibility(n.x);
      var glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 65);
      glow.addColorStop(0, rgba(n.color, alpha * (dark ? 0.16 : 0.075)));
      glow.addColorStop(1, rgba(n.color, 0));
      ctx.fillStyle = glow; ctx.fillRect(n.x - 65, n.y - 65, 130, 130);
      for (var i = 0; i < 7; i++) {
        var angle = i * 2.4, r = Math.sqrt(i) * 3;
        circle(n.x + Math.cos(angle) * r, n.y + Math.sin(angle) * r, i ? 1.5 : 2.5, n.color + i, alpha * 0.75);
      }
    });
    particles.forEach(function (p) {
      var alpha = p.alpha * visibility(p.x) * (dark ? 1 : 0.85);
      if (p.traced && p.trail.length > 1) {
        ctx.strokeStyle = rgba(p.color, alpha * 0.23); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(p.trail[0][0], p.trail[0][1]);
        for (var j = 1; j < p.trail.length; j++) ctx.lineTo(p.trail[j][0], p.trail[j][1]);
        ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      if (p.radius > 2.5) {
        circle(p.x, p.y, p.radius * 3, p.color, alpha * 0.06);
        ctx.strokeStyle = rgba(p.color, alpha * 0.35); ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius * 1.85, 0, tau); ctx.stroke();
      }
      circle(p.x, p.y, p.radius, p.color, alpha);
    });
  }
  function animate(now) {
    frame = 0;
    if (document.hidden || reduced.matches) return;
    if (previous === null) previous = now;
    accumulator += Math.min((now - previous) / 1000, 0.05); previous = now;
    while (accumulator >= step) { integrate(step); accumulator -= step; }
    particles.forEach(function (p) {
      if (!p.traced) return;
      p.trail.push([p.x, p.y]); if (p.trail.length > 22) p.trail.shift();
    });
    draw(); frame = requestAnimationFrame(animate);
  }
  function syncMotion() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; previous = null; accumulator = 0;
    if (document.hidden) { pointer.active = false; pointer.strength = 0; }
    draw();
    if (!document.hidden && !reduced.matches) frame = requestAnimationFrame(animate);
  }
  function release() { pointer.active = false; }
  // Listen on the window, including above links and text; canvas never intercepts input.
  window.addEventListener("pointermove", function (event) {
    if (event.isPrimary === false || reduced.matches) return;
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true;
  }, { passive: true });
  window.addEventListener("pointerdown", function (event) {
    if (event.isPrimary === false || reduced.matches) return;
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true;
  }, { passive: true });
  window.addEventListener("pointerup", function (event) { if (event.pointerType !== "mouse") release(); }, { passive: true });
  window.addEventListener("pointercancel", release, { passive: true });
  document.documentElement.addEventListener("pointerleave", release);
  window.addEventListener("blur", release);
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", syncMotion);
  reduced.addEventListener("change", function () { release(); pointer.strength = 0; syncMotion(); });
  window.addEventListener("pagehide", function () { if (frame) cancelAnimationFrame(frame); frame = 0; release(); });
  window.addEventListener("pageshow", syncMotion);
  new MutationObserver(theme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  theme(); resize(); syncMotion();
}());
