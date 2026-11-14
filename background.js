(function () {
  "use strict";

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;

  canvas.className = "starfield";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  const root = document.documentElement;
  const colors = [
    { dark: "225,235,250", light: "82,103,130" },
    { dark: "118,178,242", light: "57,104,166" },
    { dark: "250,164,90", light: "143,88,43" },
    { dark: "119,198,222", light: "52,111,136" }
  ];
  let pendingFrame = 0;

  function draw() {
    pendingFrame = 0;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);

    const dark = root.dataset.theme === "dark";
    const brightness = dark ? 1 : 0.54;
    const count = Math.min(1300, Math.round(width * height / 2050));
    let seed = 19;

    function random() {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    }

    for (let i = 0; i < count; i++) {
      const x = random() * width;
      const y = random() * height;
      const tint = random();
      const palette = colors[tint < 0.57 ? 0 : tint < 0.80 ? 1 : tint < 0.92 ? 2 : 3];
      const color = dark ? palette.dark : palette.light;
      const intensity = random();
      const size = random();

      if (intensity < 0.89) {
        const radius = 0.35 + size * 0.65;
        context.fillStyle = `rgba(${color}, ${brightness * (0.10 + intensity * 0.25)})`;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        continue;
      }

      // A small bright core and a soft halo give the nearest stars depth.
      const radius = 4 + 14 * size ** 2;
      const alpha = brightness * (0.48 + size * 0.30);
      const glow = context.createRadialGradient(x, y, 0, x, y, radius);
      const core = dark ? "249,250,255" : color;
      glow.addColorStop(0, `rgba(${core}, ${alpha})`);
      glow.addColorStop(0.10, `rgba(${color}, ${alpha * 0.72})`);
      glow.addColorStop(0.30, `rgba(${color}, ${alpha * 0.26})`);
      glow.addColorStop(0.62, `rgba(${color}, ${alpha * 0.07})`);
      glow.addColorStop(1, `rgba(${color}, 0)`);
      context.fillStyle = glow;
      context.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
    }
  }

  function scheduleDraw() {
    if (!pendingFrame) pendingFrame = window.requestAnimationFrame(draw);
  }

  window.addEventListener("resize", scheduleDraw, { passive: true });
  new MutationObserver(scheduleDraw).observe(root, {
    attributes: true,
    attributeFilter: ["data-theme"]
  });
  draw();
}());
