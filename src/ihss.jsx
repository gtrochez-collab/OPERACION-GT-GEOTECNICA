// SEGURO SOCIAL (IHSS) — pantalla de GeoTeam → Altas y bajas (27-nov-2026).
// Se sube la planilla que manda el IHSS (PDF del mes anterior) y el sistema
// la cruza con las altas y bajas de GeoTeam: devuelve el mismo PDF con las
// bajas resaltadas y el Word de las altas del mes en curso. La lógica vive en
// ihss-calc.js; los archivos en ihss-docs.js. No guarda nada en la nube.
import { useState, useRef } from "react";
import { Modal, Btn, Chip, C_GRIS, C_VERDE, C_AMARILLO, C_NARANJA, CHARCOAL } from "./geocost-ui.jsx";
import { safeDynamicImport } from "./lazyLoad.js";
import { leerPlanillaIHSS, marcarPlanillaIHSS, docxAltasIHSS } from "./ihss-docs.js";
import { cruzarPlanilla, altasDelMes, empresaDePlanilla, mesSiguiente, textoPeriodo, fechaLarga, soloDigitos, dniConGuiones, finDeMes } from "./ihss-calc.js";

const C_ROJO = { color: "#B03024", bg: "rgba(192,57,43,.08)" };
const NOMBRE_EMP = { subterra: "Subterra", geotecnica: "Geotecnica" };
const SIGLA = { subterra: "SUB", geotecnica: "GEO" };
const CTRL = { padding: "8px 10px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 10, fontSize: 13.5, outline: "none", background: "#F4F4F2", color: CHARCOAL, fontFamily: "inherit", boxSizing: "border-box", minWidth: 0 };
const TIT = { fontSize: 10.5, fontWeight: 800, color: "#8A847D", textTransform: "uppercase", letterSpacing: ".06em" };
const CAJA = { border: "1px solid rgba(44,42,40,.09)", borderRadius: 16, padding: "14px 16px", display: "grid", gap: 10, minWidth: 0 };
const bajar = (bytes, nombre, tipo) => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([bytes], { type: tipo })); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
};
const cargarPdfjs = async () => {
  const pdfjs = await safeDynamicImport(() => import("pdfjs-dist"), "pdfjs");
  const worker = await safeDynamicImport(() => import("pdfjs-dist/build/pdf.worker.min.mjs?url"), "pdfjs-worker");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
};

export function SeguroSocialImpl({ emps, movs, onClose }) {
  const inputRef = useRef(null);
  const [st, setSt] = useState(null);          // {bytes, nombreArchivo, pl, empresa, mes}
  const [bajas, setBajas] = useState([]);       // [{...fila, on, texto}]
  const [altas, setAltas] = useState([]);       // [{...alta, on}]
  const [otra, setOtra] = useState({ identidad: "", fecha: "" });
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");

  const leer = async (file) => {
    if (!file) return;
    setError(""); setOcupado("leer");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pl = await leerPlanillaIHSS(bytes.slice(), await cargarPdfjs());
      if (!pl.filas.length || !pl.periodo) throw new Error("No pude leer esta planilla. Tiene que ser el PDF que manda el IHSS, no una foto ni un escaneo.");
      const empresa = empresaDePlanilla(pl);
      if (!empresa) throw new Error("No reconozco el número patronal de esta planilla.");
      const cr = cruzarPlanilla({ filas: pl.filas, periodo: pl.periodo, empresa, emps, movs });
      const mes = mesSiguiente(pl.periodo);
      setSt({ bytes, nombreArchivo: file.name, pl, empresa, mes, cruce: cr });
      setBajas(cr.filter(x => x.estado === "baja").map(x => ({ ...x, on: true })));
      setAltas(altasDelMes({ mes, empresa, emps, movs }).map(a => ({ ...a, on: true })));
    } catch (e) { setError(e?.message || "No se pudo leer el PDF."); setSt(null); }
    setOcupado("");
  };

  const descargarPdf = async () => {
    setOcupado("pdf");
    try {
      const PDFLib = await safeDynamicImport(() => import("pdf-lib"), "pdf-lib");
      const marcas = bajas.filter(b => b.on && String(b.texto || "").trim());
      const out = await marcarPlanillaIHSS(st.bytes.slice(), { marcas, columnas: st.pl.columnas }, PDFLib);
      bajar(out, `BAJAS_${textoPeriodo(st.pl.periodo).split(" ")[0]}_${SIGLA[st.empresa]}_IHSS.pdf`, "application/pdf");
    } catch (e) { alert("No se pudo generar el PDF. " + (e?.message || "")); }
    setOcupado("");
  };
  const descargarWord = async () => {
    const lista = altas.filter(a => a.on);
    const sinDni = lista.filter(a => soloDigitos(a.dni).length !== 13);
    if (sinDni.length && !confirm(`${sinDni.map(a => a.nombre).join(", ")}: la identidad no tiene 13 dígitos. ¿Generar el Word de todos modos?`)) return;
    setOcupado("word");
    try {
      const JSZip = (await safeDynamicImport(() => import("jszip"), "jszip")).default;
      const resp = await fetch(`${import.meta.env.BASE_URL}plantillas/altas-ihss.docx`);
      if (!resp.ok) throw new Error("No encontré la plantilla del Word.");
      const out = await docxAltasIHSS(await resp.arrayBuffer(), { altas: lista, mes: st.mes, empresa: st.empresa }, JSZip);
      bajar(out, `ALTAS_${textoPeriodo(st.mes).split(" ")[0]}_${SIGLA[st.empresa]}_IHSS.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    } catch (e) { alert("No se pudo generar el Word. " + (e?.message || "")); }
    setOcupado("");
  };

  const agregarOtra = () => {
    const f = st.cruce.find(x => x.identidad === otra.identidad);
    if (!f || !otra.fecha) return;
    setBajas(b => [...b.filter(x => x.identidad !== f.identidad), { ...f, estado: "baja", manual: true, on: true, ultimoDia: otra.fecha, texto: `BAJA ${fechaLarga(otra.fecha)}` }]);
    setOtra({ identidad: "", fecha: "" });
  };

  const sinFicha = st ? st.cruce.filter(x => x.estado === "sin_ficha") : [];
  const despues = st ? st.cruce.filter(x => x.estado === "baja_despues") : [];
  const nB = bajas.filter(b => b.on).length, nA = altas.filter(a => a.on).length;

  return <Modal title="Seguro Social · IHSS" onClose={onClose} wide fondoCierra={false}>
    <div style={{ display: "grid", gap: 14 }}>
      <input ref={inputRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; leer(f); }} />
      {!st && <div style={{ ...CAJA, justifyItems: "center", textAlign: "center", padding: "30px 18px", borderStyle: "dashed" }}>
        <div style={{ font: "800 17px/1.3 var(--display)", color: CHARCOAL }}>Subí la planilla que mandó el IHSS</div>
        <div style={{ fontSize: 13.5, color: "#6E6862", maxWidth: 460 }}>El PDF del mes anterior. Te devuelvo la planilla con las bajas marcadas y el Word con las altas de este mes, según Altas y bajas.</div>
        <Btn onClick={() => inputRef.current?.click()} disabled={ocupado === "leer"}>{ocupado === "leer" ? "Leyendo…" : "Elegir el PDF"}</Btn>
        {error && <div style={{ fontSize: 13, color: C_ROJO.color }}>{error}</div>}
      </div>}

      {st && <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ font: "800 18px/1.2 var(--display)", color: CHARCOAL }}>{NOMBRE_EMP[st.empresa]} · planilla de {textoPeriodo(st.pl.periodo).toLowerCase()}</div>
          <Chip c={C_GRIS}>{st.pl.filas.length} personas</Chip>
          <Chip c={C_GRIS}>Patronal {st.pl.patronal}</Chip>
          <div style={{ marginLeft: "auto" }}><Btn small variant="ghost" onClick={() => inputRef.current?.click()}>Subir otra</Btn></div>
        </div>

        {/* BAJAS */}
        <div style={CAJA}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={TIT}>Bajas a reportar · hasta el {fechaLarga(finDeMes(st.pl.periodo)).toLowerCase()}</div>
            <div style={{ marginLeft: "auto" }}><Btn small onClick={descargarPdf} disabled={!!ocupado}>{ocupado === "pdf" ? "Generando…" : nB ? `Descargar planilla con ${nB} ${nB === 1 ? "baja" : "bajas"}` : "Descargar planilla sin bajas"}</Btn></div>
          </div>
          {!bajas.length && <div style={{ fontSize: 13.5, color: "#6E6862" }}>Todos los de la planilla siguen activos en GeoTeam.</div>}
          {bajas.map(b => <div key={b.identidad} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) minmax(0,1fr)", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(44,42,40,.07)" }}>
            <input type="checkbox" checked={b.on} onChange={e => setBajas(l => l.map(x => x.identidad === b.identidad ? { ...x, on: e.target.checked } : x))} style={{ width: 17, height: 17, accentColor: "#C75F1F" }} aria-label={`Reportar la baja de ${b.nombre}`} />
            <div style={{ minWidth: 0 }}>
              <div style={{ font: "700 14px/1.3 var(--sans)", color: CHARCOAL }}>{b.nombre}</div>
              <div style={{ fontSize: 12.5, color: "#6E6862", marginTop: 2 }}>{dniConGuiones(b.identidad)} · último día {fechaLarga(b.ultimoDia).toLowerCase()}</div>
              {b.atrasada && <Chip c={C_AMARILLO} style={{ marginTop: 5 }}>Salió antes de este mes y sigue en la planilla</Chip>}
              {b.manual && <Chip c={C_NARANJA} style={{ marginTop: 5 }}>Agregada a mano</Chip>}
            </div>
            <input value={b.texto} onChange={e => setBajas(l => l.map(x => x.identidad === b.identidad ? { ...x, texto: e.target.value.toUpperCase() } : x))} style={{ ...CTRL, width: "100%", color: C_ROJO.color, fontWeight: 700 }} aria-label={`Texto de la baja de ${b.nombre}`} />
          </div>)}
          <details>
            <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "#A94E16" }}>Marcar a otra persona de la planilla</summary>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
              <select value={otra.identidad} onChange={e => setOtra(o => ({ ...o, identidad: e.target.value }))} style={{ ...CTRL, flex: "1 1 240px" }}><option value="">Elegí la persona</option>{st.cruce.filter(x => !bajas.some(b => b.identidad === x.identidad)).map(x => <option key={x.identidad} value={x.identidad}>{x.nombre}</option>)}</select>
              <input type="date" value={otra.fecha} onChange={e => setOtra(o => ({ ...o, fecha: e.target.value }))} style={CTRL} aria-label="Fecha de la baja" />
              <Btn small variant="ghost" onClick={agregarOtra} disabled={!otra.identidad || !otra.fecha}>Agregar</Btn>
            </div>
          </details>
          {sinFicha.length > 0 && <div style={{ padding: "10px 12px", borderRadius: 12, background: C_AMARILLO.bg, color: C_AMARILLO.color, fontSize: 13, lineHeight: 1.5 }}><b>{sinFicha.length === 1 ? "Está en la planilla y no la encuentro en GeoTeam:" : "Están en la planilla y no las encuentro en GeoTeam:"}</b> {sinFicha.map(x => x.nombre).join(" · ")}. Revisá si falta registrar su baja.</div>}
          {despues.length > 0 && <div style={{ fontSize: 12.5, color: "#6E6862" }}>Salieron después de este mes, van en la planilla siguiente: {despues.map(x => `${x.nombre} (${fechaLarga(x.ultimoDia).toLowerCase()})`).join(" · ")}.</div>}
        </div>

        {/* ALTAS */}
        <div style={CAJA}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={TIT}>Altas de {textoPeriodo(st.mes).toLowerCase()}</div>
            <div style={{ marginLeft: "auto" }}><Btn small onClick={descargarWord} disabled={!!ocupado || !nA}>{ocupado === "word" ? "Generando…" : `Descargar Word con ${nA} ${nA === 1 ? "alta" : "altas"}`}</Btn></div>
          </div>
          {!altas.length && <div style={{ fontSize: 13.5, color: "#6E6862" }}>No hay altas registradas en {textoPeriodo(st.mes).toLowerCase()}.</div>}
          {altas.map(a => { const malDni = soloDigitos(a.dni).length !== 13; const k = a.empId || a.dni; const up = (c, v) => setAltas(l => l.map(x => (x.empId || x.dni) === k ? { ...x, [c]: v } : x));
            return <div key={k} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1.6fr) minmax(0,1fr) 120px", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(44,42,40,.07)" }}>
              <input type="checkbox" checked={a.on} onChange={e => up("on", e.target.checked)} style={{ width: 17, height: 17, accentColor: "#C75F1F" }} aria-label={`Incluir a ${a.nombre}`} />
              <div style={{ minWidth: 0 }}>
                <div style={{ font: "700 14px/1.3 var(--sans)", color: CHARCOAL }}>{a.nombre}</div>
                <div style={{ fontSize: 12.5, color: malDni ? C_ROJO.color : "#6E6862", marginTop: 2 }}>{malDni ? `Identidad incompleta: ${a.dni || "sin identidad"}` : dniConGuiones(a.dni)} · ingresó el {fechaLarga(a.fecha).toLowerCase()}</div>
              </div>
              <div style={{ fontSize: 13, color: "#5C5853", minWidth: 0 }}>{a.puesto}</div>
              <input type="number" value={a.salario} onChange={e => up("salario", e.target.value)} style={{ ...CTRL, width: "100%", textAlign: "right" }} aria-label={`Salario de ${a.nombre}`} />
            </div>; })}
          {altas.length > 0 && <div style={{ fontSize: 12, color: "#8A847D" }}>El salario sale de la ficha, sin bonificación; lo podés cambiar aquí antes de bajar el Word.</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C_VERDE.color }}>Se manda al IHSS a más tardar el 30 de {textoPeriodo(st.mes).split(" ")[0].toLowerCase()}.</div>
      </>}
    </div>
  </Modal>;
}
