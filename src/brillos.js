// ═══════════════════════════════════════════════════════════════════════════
// Manchas de brillo (.gt-brillo-a / -b) movidas por JS a ~12 cuadros/s
// (15-oct-2026). Antes las movía una animación CSS a 60 cuadros/s, y como el
// vidrio (.gt-vidrio) desenfoca lo que tiene detrás, CADA cuadro obligaba a
// re-desenfocar todas las tarjetas aunque nadie tocara nada: en Mac se veía
// perfecto pero en PCs Windows con video más modesto se sentía laggy.
// Las manchas son difusas y se mueven en ciclos de 47 s / 59 s, así que a 12
// cuadros/s el movimiento es idéntico a la vista y el trabajo baja ~5 veces.
// Recorren EXACTAMENTE los mismos keyframes y la misma curva ease-in-out que
// tenía el CSS (gtPaseoA / gtPaseoB en gt-ui.js, que queda de respaldo).
// Se pausa con la pestaña oculta y respeta prefers-reduced-motion.
// ═══════════════════════════════════════════════════════════════════════════

// cubic-bezier(.42,0,.58,1) = ease-in-out del CSS: y en función de x.
const easeInOut = (x) => {
  const ax = 3 * 0.42 - 3 * 0.58 + 1, bx = 3 * 0.58 - 6 * 0.42, cx = 3 * 0.42;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const fx = ((ax * t + bx) * t + cx) * t - x;
    const d = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(fx) < 1e-5 || !d) break;
    t -= fx / d;
  }
  t = Math.min(1, Math.max(0, t));
  // y(t) con P1y=0, P2y=1
  return 3 * t * t - 2 * t * t * t;
};

const A = { dur: 47000, kf: [[-50, 0, 1], [-96, 34, 0.86], [-38, 66, 1.08], [4, 28, 0.92], [-50, 0, 1]], tf: (x, y, s) => `translateX(${x}%) translateY(${y}vh) scale(${s})` };
const B = { dur: 59000, kf: [[0, 0, 1], [-46, -30, 1.1], [-72, -58, 0.84], [-30, -72, 1.05], [0, 0, 1]], tf: (x, y, s) => `translate(${x}vw,${y}vh) scale(${s})` };

const posicion = (def, ms) => {
  const p = (ms % def.dur) / def.dur * 4;
  const i = Math.min(3, Math.floor(p));
  const k = easeInOut(p - i);
  const [x0, y0, s0] = def.kf[i], [x1, y1, s1] = def.kf[i + 1];
  return def.tf(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, +(s0 + (s1 - s0) * k).toFixed(4));
};

export function iniciarBrillos() {
  if (typeof window === "undefined" || window.__gtBrillos) return;
  window.__gtBrillos = true;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.documentElement.classList.add("gt-brillos-js");
  const as = document.getElementsByClassName("gt-brillo-a");
  const bs = document.getElementsByClassName("gt-brillo-b");
  const t0 = performance.now();
  const paso = () => {
    if (!document.hidden && (as.length || bs.length)) {
      const ms = performance.now() - t0;
      const ta = posicion(A, ms), tb = posicion(B, ms);
      for (const el of as) el.style.transform = ta;
      for (const el of bs) el.style.transform = tb;
    }
    setTimeout(paso, 83);
  };
  paso();
}
