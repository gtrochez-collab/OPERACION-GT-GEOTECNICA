// ═══════════════════════════════════════════════════════════════════════════
// SISTEMA VISUAL GEOTECNICA (31-ago-2026) — tokens + clases gt-* compartidos.
// Lo montan App (login/bienvenida/panel) Y los módulos rediseñados, cada uno
// con su propio <style>{GT_CSS}</style> (el de App se desmonta al entrar a un
// módulo). ⚠ React 19: NUNCA agregarle `precedence` a esos <style> — React
// los izaría al <head> para siempre y el CSS se filtraría a todos lados.
// ═══════════════════════════════════════════════════════════════════════════
export const GT_CSS = `
:root{
  --marca:#2C2A28;          /* carbón Geotecnica */
  --marca-2:#E8762D;        /* naranja Geotecnica */
  --naranja-tinta:#C75F1F;  /* acento legible p/ texto grande (el naranja puro es RELLENO) */

  --display:'Plus Jakarta Sans','Manrope',sans-serif;
  --sans:'Inter',sans-serif;
  --mono:'IBM Plex Mono',ui-monospace,monospace;

  --text:#2C2A28;
  --text-2:#5C5853;
  --text-3:#6E6862;
  --text-faint:#A39C92;

  --bg:#F4F4F2;             /* ÚNICO fondo de página (blanco griseito, pedido 31-ago) */
  --surface:#FFFFFF;
  --sunk:#EDEDEB;
  --hairline:rgba(44,42,40,.08);

  --e0:0 1px 2px rgba(44,42,40,.05);
  --e1:0 6px 18px rgba(44,42,40,.09);
  --e2:0 18px 44px rgba(44,42,40,.16);

  --mov-rapido:120ms; --mov-base:200ms; --mov-medio:320ms; --mov-lento:480ms;
  --curva:cubic-bezier(.32,.72,0,1);
  --curva-exp:cubic-bezier(.16,1,.3,1);

  --radio-card:20px; --radio-control:12px; --radio-chip:999px;

  --v-fondo-foto:linear-gradient(165deg,rgba(255,255,255,.97) 0%,rgba(252,252,251,.93) 100%);
  --v-borde:rgba(255,255,255,.85);
  --v-blur:blur(22px) saturate(180%);
  --v-sombra:0 1px 0 rgba(255,255,255,.95) inset,0 0 0 1px rgba(44,42,40,.06),0 1px 2px rgba(44,42,40,.04),0 14px 34px rgba(44,42,40,.12);
}
.gt-ui{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh}

/* Manchas de color difusas detrás de todo (la firma del vidrio). Duraciones
   primas (47s/59s) para que el patrón casi nunca se repita igual. */
.gt-brillo{position:fixed;z-index:0;pointer-events:none;border-radius:50%}
.gt-brillo-a{width:min(760px,86vw);height:min(760px,86vw);top:-24%;left:50%;
  background:radial-gradient(circle,rgba(232,118,45,.16) 0%,rgba(232,118,45,.06) 40%,transparent 70%);
  animation:gtPaseoA 47s ease-in-out infinite}
.gt-brillo-b{width:min(660px,80vw);height:min(660px,80vw);bottom:-26%;right:-12%;
  background:radial-gradient(circle,rgba(199,95,31,.10) 0%,rgba(140,133,125,.06) 44%,transparent 72%);
  animation:gtPaseoB 59s ease-in-out infinite}
@keyframes gtPaseoA{0%{transform:translateX(-50%) translateY(0) scale(1)}25%{transform:translateX(-96%) translateY(34vh) scale(.86)}50%{transform:translateX(-38%) translateY(66vh) scale(1.08)}75%{transform:translateX(4%) translateY(28vh) scale(.92)}100%{transform:translateX(-50%) translateY(0) scale(1)}}
@keyframes gtPaseoB{0%{transform:translate(0,0) scale(1)}25%{transform:translate(-46vw,-30vh) scale(1.1)}50%{transform:translate(-72vw,-58vh) scale(.84)}75%{transform:translate(-30vw,-72vh) scale(1.05)}100%{transform:translate(0,0) scale(1)}}

/* Entradas: keyframe solo con "from" + fill backwards (forwards clava hover) */
@keyframes gtSube{from{opacity:0;transform:translateY(18px)}}
@keyframes gtAparece{from{opacity:0}}
@keyframes gtKenBurns{from{transform:scale(1)}to{transform:scale(1.07)}}
.gt-sube{animation:gtSube var(--mov-lento) var(--curva-exp) backwards}
.gt-aparece{animation:gtAparece var(--mov-medio) var(--curva) backwards}

/* Tarjeta base: se apoya, no flota */
.gt-card{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--radio-card);box-shadow:var(--e0);transition:box-shadow var(--mov-base) var(--curva),transform var(--mov-base) var(--curva),border-color var(--mov-base) var(--curva)}
.gt-card-hover:hover{box-shadow:var(--e1);transform:translateY(-2px)}

/* Vidrio glossy sobre fondo claro (tarjetas de bienvenida y panel): brillo
   interior blanco + blur que deja pasar las manchas de color de atrás. */
.gt-vidrio{background:linear-gradient(165deg,rgba(255,255,255,.9) 0%,rgba(252,252,251,.72) 100%);border:1px solid rgba(255,255,255,.92);border-radius:var(--radio-card);box-shadow:0 1px 0 rgba(255,255,255,.95) inset,0 0 0 1px rgba(44,42,40,.05),0 10px 26px rgba(44,42,40,.09);-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);transition:box-shadow var(--mov-base) var(--curva),transform var(--mov-base) var(--curva)}
.gt-vidrio-hover:hover{box-shadow:0 1px 0 rgba(255,255,255,.95) inset,0 0 0 1px rgba(44,42,40,.05),0 18px 40px rgba(44,42,40,.14);transform:translateY(-2px)}

/* Botón circular del header (volver / tuerquita) */
.gt-circulo{width:44px;height:44px;border-radius:50%;border:1px solid var(--hairline);background:var(--surface);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:var(--text-2);box-shadow:var(--e0);padding:0;transition:box-shadow var(--mov-base) var(--curva),color var(--mov-rapido),transform var(--mov-rapido) var(--curva)}
.gt-circulo:hover{box-shadow:var(--e1);color:var(--marca-2)}
.gt-circulo:active{transform:scale(.94)}

.gt-label{font:600 10px/1 var(--mono);letter-spacing:.18em;text-transform:uppercase}
.gt-input{width:100%;box-sizing:border-box;padding:13px 16px;border:1px solid var(--hairline);border-radius:var(--radio-control);font:400 15px/1.4 var(--sans);color:var(--text);background:var(--sunk);outline:none;transition:border-color var(--mov-rapido),background var(--mov-rapido),box-shadow var(--mov-rapido)}
.gt-input:focus{border-color:var(--marca-2);background:#fff;box-shadow:0 0 0 3px rgba(232,118,45,.14)}
.gt-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:12px 26px;border:none;border-radius:var(--radio-chip);font:700 15px/1 var(--sans);cursor:pointer;transition:transform var(--mov-rapido) var(--curva),box-shadow var(--mov-base) var(--curva),background var(--mov-rapido)}
.gt-btn:active{transform:scale(.97)}
.gt-btn-primario{background:var(--marca-2);color:#fff;box-shadow:0 4px 14px rgba(232,118,45,.30)}
.gt-btn-primario:hover{background:var(--naranja-tinta);box-shadow:0 6px 18px rgba(232,118,45,.36)}
.gt-btn-primario:disabled{background:var(--text-faint);box-shadow:none;cursor:not-allowed}

@media (prefers-reduced-motion:reduce){
  .gt-brillo,.gt-sube,.gt-aparece{animation:none !important}
  .gt-kenburns{animation:none !important}
}
`;
