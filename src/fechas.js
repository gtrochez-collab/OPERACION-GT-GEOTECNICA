// ═══════════════════════════════════════════════════════════════════════════
// Fechas del sistema — SIEMPRE en la zona de Honduras (23-sep-2026)
// ═══════════════════════════════════════════════════════════════════════════
// El bug que originó este archivo (lo cazó Gerson): la Lic. Carolina registró
// el pago de INVERSIONES PINEDA el 22-sep a las 10:04 p.m. y quedó fechado el
// 23-sep. ¿Por qué? El campo "Fecha del pago" venía pre-llenado con
// `new Date().toISOString().slice(0, 10)`, que es la fecha en **UTC**: a las
// 22:04 en Honduras (UTC-6) en UTC ya son las 04:04 del día siguiente.
//
// O sea: TODO lo que se registre después de las 6:00 p.m. hora Honduras salía
// fechado al día siguiente. Con 155 de 397 pagos afectados y 7 de ellos
// cruzando de MES, eso distorsionaba los reportes mensuales y el cierre
// contable. El mismo patrón estaba repetido en 18 lugares del sistema.
//
// Regla: para "hoy" usar SIEMPRE `hoyISO()`. Nunca `toISOString().slice(0,10)`.
//
// Se usa `Intl` con timeZone explícito (no `toLocaleDateString` a secas) para
// que dé la fecha de Honduras aunque la laptop esté configurada en otra zona
// — mismo criterio que `ahoraTegus()` de GeoClock.

export const TZ_HN = "America/Tegucigalpa";

/** Hoy en Honduras, "YYYY-MM-DD". */
export const hoyISO = () => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ_HN, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
  } catch {
    // Sin Intl: partes LOCALES del dispositivo. Nunca toISOString (= UTC).
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
};

/** El día en Honduras ("YYYY-MM-DD") de un timestamp ISO cualquiera. */
export const diaHN = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ_HN, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d);
  } catch {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
};
