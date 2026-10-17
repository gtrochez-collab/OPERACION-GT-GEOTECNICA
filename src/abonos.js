// =====================================================================
// ABONOS — pagos parciales a una solicitud (17-oct-2026, pedido de Christian)
// =====================================================================
// Una compra a crédito (o un pedido que se paga por partes) recibe VARIOS
// pagos de Tesorería. Cada abono lleva su monto, fecha, método y el
// comprobante de la transferencia (obligatorio). La solicitud NO se cierra
// hasta que la suma de los abonos cubre el monto total:
//
//   sin abonos ............. flujo de siempre (Registrar pago)
//   abonos < total ......... sigue "validado" en Tesorería (pendiente de pago,
//                            cuenta en Pendientes, Prioridades y CxP) con
//                            el saldo que falta
//   abonos = total ......... "finalizado" con los datos del ÚLTIMO abono
//                            (fecha, método, comprobante) — igual que un pago
//                            normal con comprobante
//
// Lógica PURA (sin React ni store): la usa PurchasesModule y la prueba
// tests/abonos.test.mjs. Campo ADITIVO en cp-/mq-purchases:
//   abonos: [{ id, monto, fecha "YYYY-MM-DD", metodo, comprobante {fileId,
//              name, type, size}, nota, registradoPor, registradoAt,
//              anulado?, anuladoPor?, anuladoAt?, motivoAnulacion? }]
// Los abonos NUNCA se borran: anular uno lo marca `anulado` (así el guardado
// que une lo de la nube con lo local no lo revive, y queda el rastro).
// =====================================================================

export const TOLERANCIA_ABONO = 1; // L 1: redondeos de la transferencia

const n = (x) => Number(x) || 0;
const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
const orden = (a, b) =>
  String(a.fecha || "").localeCompare(String(b.fecha || "")) ||
  String(a.registradoAt || "").localeCompare(String(b.registradoAt || ""));

export const todosLosAbonos = (p) => (Array.isArray(p?.abonos) ? p.abonos.filter(Boolean) : []);
export const abonosVigentes = (p) => todosLosAbonos(p).filter((a) => !a.anulado).sort(orden);
export const tieneAbonos = (p) => abonosVigentes(p).length > 0;
export const totalAbonado = (p) => r2(abonosVigentes(p).reduce((s, a) => s + n(a.monto), 0));
export const saldoDe = (p) => r2(Math.max(0, n(p?.amount) - totalAbonado(p)));
export const pagoCompletoPorAbonos = (p) => tieneAbonos(p) && saldoDe(p) <= TOLERANCIA_ABONO;
export const esAbonoParcial = (p) => tieneAbonos(p) && !pagoCompletoPorAbonos(p);

// Lo que todavía se debe de una solicitud aprobada — Dashboard, tira de
// Solicitudes y Prioridades. Sin abonos es el monto completo.
export const porPagarDe = (p) => (tieneAbonos(p) ? saldoDe(p) : n(p?.amount));

// Valida un abono nuevo antes de guardarlo. Devuelve el mensaje de error o null.
export const validarAbono = (p, { monto, fecha, comprobante }) => {
  if (!(n(monto) > 0)) return "Poné cuánto se abonó.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ""))) return "Poné la fecha del abono.";
  if (!comprobante) return "Adjuntá el comprobante de la transferencia.";
  const falta = saldoDe(p);
  if (n(monto) > falta + TOLERANCIA_ABONO) {
    return `El abono (L ${n(monto).toLocaleString("es-HN", { minimumFractionDigits: 2 })}) es mayor a lo que falta pagar (L ${falta.toLocaleString("es-HN", { minimumFractionDigits: 2 })}).`;
  }
  return null;
};

// SERVICIO DE PROVEEDOR (23-sep-2026): al quedar pagado se cierra solo, sin
// ficha — mismo criterio que el pago normal. Solo si la entrega no avanzó:
// nunca pisa una ficha adjunta ni una entrega del proveedor en curso.
export const cierreServicioAlPagar = (p, ahoraISO) => {
  const esServicio = p?.tipoCompra === "servicio"
    && (!p.deliveryStatus || p.deliveryStatus === "pendiente_entrega");
  if (!esServicio) {
    return { esServicio: false, deliveryStatus: p?.deliveryStatus || "pendiente_entrega", delivery: p?.delivery || {} };
  }
  return {
    esServicio: true,
    deliveryStatus: "cerrado",
    delivery: {
      ...(p.delivery || {}),
      cerradaSinFicha: true,
      esServicio: true,
      closingNotes: "Servicio de proveedor — no lleva ficha de recibido",
      closedBy: "Automático al pagar (servicio)",
      closedAt: ahoraISO,
      updatedAt: ahoraISO,
    },
  };
};

// Deja los campos de pago de la solicitud de acuerdo con sus abonos.
// Devuelve { rec, completo, esServicio, recienCompletada }.
//   - Parcial (o todos anulados): vuelve/queda en Tesorería, sin datos de pago.
//   - Completo: finalizado con los datos del último abono.
export const estadoTrasAbonos = (p, ahoraISO) => {
  const vig = abonosVigentes(p);
  const yaEstabaPagada = p?.status === "pagado" || p?.status === "finalizado";
  if (!vig.length || saldoDe(p) > TOLERANCIA_ABONO) {
    return {
      rec: {
        ...p,
        status: "validado",
        treasuryStatus: "recibida",
        paidAt: null,
        paymentDate: "",
        paymentMethod: "",
        receiptFile: null,
        finalizedAt: null,
      },
      completo: false, esServicio: false, recienCompletada: false,
    };
  }
  const ult = vig[vig.length - 1];
  const srv = cierreServicioAlPagar(p, ahoraISO);
  return {
    rec: {
      ...p,
      status: "finalizado",
      treasuryStatus: "pagada",
      paymentMethod: ult.metodo || p.paymentMethod || "",
      paymentDate: ult.fecha,
      // Mismo formato que el pago normal: medianoche UTC de la fecha elegida.
      paidAt: `${ult.fecha}T00:00:00.000Z`,
      receiptFile: ult.comprobante || null,
      finalizedAt: yaEstabaPagada && p.finalizedAt ? p.finalizedAt : ahoraISO,
      deliveryStatus: srv.deliveryStatus,
      delivery: srv.delivery,
    },
    completo: true,
    esServicio: srv.esServicio,
    recienCompletada: !yaEstabaPagada,
  };
};

// Une los abonos locales con los de la nube (por id). Sirve al guardado
// robusto: si otra persona registró un abono mientras esta pantalla tenía una
// foto vieja de la solicitud, no se pierde. `anulado` es pegajoso: si
// cualquiera de los dos lados lo anuló, queda anulado.
export const unirAbonos = (locales = [], nube = []) => {
  const porId = new Map();
  for (const a of [...(locales || []), ...(nube || [])]) {
    if (!a || !a.id) continue;
    const prev = porId.get(a.id);
    if (!prev) { porId.set(a.id, a); continue; }
    const anulado = !!(prev.anulado || a.anulado);
    const quien = prev.anulado ? prev : a;
    porId.set(a.id, {
      ...prev, ...a,
      anulado,
      ...(anulado ? { anuladoPor: quien.anuladoPor, anuladoAt: quien.anuladoAt, motivoAnulacion: quien.motivoAnulacion } : {}),
    });
  }
  return [...porId.values()].sort(orden);
};

// ¿La nube trae abonos (o anulaciones) que la fila local no tiene?
export const nubeTraeAbonosNuevos = (local, nube) => {
  const loc = new Map(todosLosAbonos(local).map((a) => [a.id, a]));
  return todosLosAbonos(nube).some((a) => !loc.has(a.id) || (a.anulado && !loc.get(a.id).anulado));
};
