// =====================================================================
// GeoChat — MENSAJERIA INTERNA GRUPO GEOTECNICA
// =====================================================================
// Nivel A: canales fijos + DMs + tiempo real (polling 5s) + badge +
// sonido al llegar mensaje mientras estas adentro del sistema.
//
// STORAGE:
// - chat-channel-<id>      → array de mensajes del canal
// - chat-dm-<a>-<b>        → array de mensajes (a y b ordenados alfa)
// - chat-read-<username>   → { [convId]: lastReadTs }
//
// CADA MENSAJE: { id, sender, body, ts }
//
// LIMITACIONES (documentadas):
// - Polling 5s (no WebSocket): mensajes pueden tardar hasta 5s en llegar
// - Race condition: si 2 personas mandan dentro del mismo ciclo, uno
//   puede quedar atras y perderse. Bajo en equipos chicos, aceptamos.
// =====================================================================

import { useState, useEffect, useRef } from "react";
import { store } from "./supabase.js";
import { BRAND, FONT, R } from "./theme.js";
import { USERS, userColor, userInitials } from "./users.js";

// ── CANALES FIJOS ──
export const CHANNELS = [
  { id: "general",   name: "general",   icon: "📣", desc: "Anuncios y conversacion general" },
  { id: "compras",   name: "compras",   icon: "🧾", desc: "Equipo de Compras / Operaciones" },
  { id: "rrhh",      name: "rrhh",      icon: "👥", desc: "Recursos Humanos" },
  { id: "logistica", name: "logistica", icon: "🚛", desc: "Logistica y flota" },
  { id: "almacen",   name: "almacen",   icon: "📦", desc: "Almacen e inventario" },
];

// ── KEY BUILDERS ──
export const channelKey = (id) => `chat-channel-${id}`;
export const dmKey = (a, b) => {
  const sorted = [a, b].sort();
  return `chat-dm-${sorted[0]}-${sorted[1]}`;
};
export const dmConvId = (otherUsername) => `dm-${otherUsername}`;
export const channelConvId = (id) => `channel-${id}`;
export const readKey = (username) => `chat-read-${username}`;

// ── UID local ──
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ── Sonido breve (2 tonos cortos via Web Audio API, sin assets externos) ──
let audioCtx = null;
export const playBeep = () => {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = (freq, delay, dur = 0.12) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.connect(g); g.connect(audioCtx.destination);
      osc.frequency.value = freq;
      const t0 = audioCtx.currentTime + delay;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.08, t0 + 0.01);
      g.gain.linearRampToValueAtTime(0, t0 + dur);
      osc.start(t0); osc.stop(t0 + dur);
    };
    beep(880, 0);
    beep(1320, 0.16);
  } catch {}
};

// ── Util: formatear hora del mensaje ──
const fmtTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const hhmm = d.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return hhmm;
  if (isYesterday) return `Ayer ${hhmm}`;
  return d.toLocaleString("es-HN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

// ── Agrupar mensajes por dia para mostrar separadores ──
const dayHeader = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoy";
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-HN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
};

// =====================================================================
// HELPER PARA EL BADGE GLOBAL EN App.jsx (export)
// =====================================================================
// Fetch all conversation data + read state, compute unread count per conv,
// returns total and breakdown. App.jsx llama esto cada N segundos.
export async function fetchUnreadSummary(currentUsername) {
  if (!currentUsername) return { total: 0, byConv: {} };
  try {
    const readState = (await store.get(readKey(currentUsername))) || {};
    const otherUsers = USERS.filter(u => u.username !== currentUsername);
    const fetches = [
      ...CHANNELS.map(c => store.get(channelKey(c.id)).then(msgs => ({ convId: channelConvId(c.id), msgs }))),
      ...otherUsers.map(u => store.get(dmKey(currentUsername, u.username)).then(msgs => ({ convId: dmConvId(u.username), msgs }))),
    ];
    const results = await Promise.all(fetches);
    const byConv = {};
    let total = 0;
    for (const r of results) {
      const msgs = Array.isArray(r.msgs) ? r.msgs : [];
      const lastRead = readState[r.convId] || "1970-01-01T00:00:00Z";
      const unread = msgs.filter(m => m.sender !== currentUsername && m.ts > lastRead).length;
      if (unread > 0) byConv[r.convId] = unread;
      total += unread;
    }
    return { total, byConv };
  } catch {
    return { total: 0, byConv: {} };
  }
}

// =====================================================================
// COMPONENTE PRINCIPAL
// =====================================================================
export default function ChatModule({ userRole, userName, onBack, onLogout }) {
  // currentUser = el usuario logueado. Buscamos su entrada en USERS por label.
  const currentUser = USERS.find(u => u.label === userName) || { username: userName, label: userName, role: userRole };
  const meUsername = currentUser.username;
  const meLabel = currentUser.label;

  const [sec, setSec] = useState({ kind: "channel", id: "general" }); // { kind: 'channel'|'dm', id: channelId | otherUsername }
  const [allMessages, setAllMessages] = useState({}); // { [storageKey]: [msgs] }
  const [readState, setReadState] = useState({});    // { [convId]: lastReadTs }
  const [draft, setDraft] = useState("");
  const [sb, setSb] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [unreadByConv, setUnreadByConv] = useState({}); // { [convId]: count }
  const [sending, setSending] = useState(false);

  // Refs para evitar dependencias en useEffect que causen re-fetches innecesarios
  const lastMsgCountRef = useRef({});
  const messagesEndRef = useRef(null);

  const otherUsers = USERS.filter(u => u.username !== meUsername);

  // Conv actual (canal o DM)
  const currentConvId = sec.kind === "channel" ? channelConvId(sec.id) : dmConvId(sec.id);
  const currentStorageKey = sec.kind === "channel" ? channelKey(sec.id) : dmKey(meUsername, sec.id);
  const currentMessages = allMessages[currentStorageKey] || [];

  // ── Polling de todas las conversaciones cada 5s ──
  const pollAll = async () => {
    try {
      const channelFetches = CHANNELS.map(c => store.get(channelKey(c.id)).then(m => [channelKey(c.id), Array.isArray(m) ? m : []]));
      const dmFetches = otherUsers.map(u => store.get(dmKey(meUsername, u.username)).then(m => [dmKey(meUsername, u.username), Array.isArray(m) ? m : []]));
      const readFetch = store.get(readKey(meUsername)).then(r => r || {});
      const [results, read] = await Promise.all([Promise.all([...channelFetches, ...dmFetches]), readFetch]);
      const merged = {};
      results.forEach(([k, v]) => { merged[k] = v; });

      // Detectar mensajes nuevos para sonido + badge
      let newFromOthers = false;
      for (const [k, msgs] of Object.entries(merged)) {
        const prevCount = lastMsgCountRef.current[k] || 0;
        if (msgs.length > prevCount) {
          // Hay mensajes nuevos en esta conv. Solo sonar si NO los envie yo.
          const fresh = msgs.slice(prevCount);
          if (fresh.some(m => m.sender !== meUsername)) newFromOthers = true;
        }
        lastMsgCountRef.current[k] = msgs.length;
      }

      // Calcular unread por conv
      const unread = {};
      for (const c of CHANNELS) {
        const msgs = merged[channelKey(c.id)] || [];
        const lastRead = read[channelConvId(c.id)] || "1970-01-01T00:00:00Z";
        const count = msgs.filter(m => m.sender !== meUsername && m.ts > lastRead).length;
        if (count > 0) unread[channelConvId(c.id)] = count;
      }
      for (const u of otherUsers) {
        const msgs = merged[dmKey(meUsername, u.username)] || [];
        const lastRead = read[dmConvId(u.username)] || "1970-01-01T00:00:00Z";
        const count = msgs.filter(m => m.sender !== meUsername && m.ts > lastRead).length;
        if (count > 0) unread[dmConvId(u.username)] = count;
      }

      setAllMessages(merged);
      setReadState(read);
      setUnreadByConv(unread);

      // Reproducir sonido si hay mensajes nuevos de otros y la ventana esta visible
      if (newFromOthers && loaded && !document.hidden) {
        playBeep();
      }
      if (!loaded) setLoaded(true);
    } catch (e) {
      console.warn("[GeoChat] poll failed", e);
    }
  };

  useEffect(() => {
    pollAll();
    const t = setInterval(pollAll, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Marcar conversacion actual como leida cuando cambia o llegan mensajes ──
  useEffect(() => {
    if (!loaded || currentMessages.length === 0) return;
    const newestTs = currentMessages[currentMessages.length - 1]?.ts;
    if (!newestTs) return;
    if (readState[currentConvId] === newestTs) return; // ya esta al dia
    const nextRead = { ...readState, [currentConvId]: newestTs };
    setReadState(nextRead);
    store.set(readKey(meUsername), nextRead);
    // Limpiar unread local
    setUnreadByConv(prev => {
      const cp = { ...prev };
      delete cp[currentConvId];
      return cp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConvId, currentMessages.length, loaded]);

  // ── Auto-scroll al final cuando llegan mensajes nuevos ──
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentMessages.length, currentConvId]);

  // ── Enviar mensaje ──
  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      // Fetch latest array para minimizar race condition
      const existing = (await store.get(currentStorageKey)) || [];
      const msg = {
        id: uid(),
        sender: meUsername,
        body,
        ts: new Date().toISOString(),
      };
      const next = [...existing, msg];
      // Optimistic UI: actualizar inmediatamente
      setAllMessages(prev => ({ ...prev, [currentStorageKey]: next }));
      setDraft("");
      await store.set(currentStorageKey, next);
      // Actualizar el lastRead a este mensaje (yo lo lei al mandarlo)
      const nextRead = { ...readState, [currentConvId]: msg.ts };
      setReadState(nextRead);
      await store.set(readKey(meUsername), nextRead);
    } catch (e) {
      alert("No se pudo enviar el mensaje. Intentalo de nuevo.");
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    // Enter envia (Shift+Enter hace salto de linea)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Header titulo ──
  const headerTitle = sec.kind === "channel"
    ? `# ${CHANNELS.find(c => c.id === sec.id)?.name || sec.id}`
    : (USERS.find(u => u.username === sec.id)?.label || sec.id);
  const headerDesc = sec.kind === "channel"
    ? CHANNELS.find(c => c.id === sec.id)?.desc
    : `Mensaje directo`;

  // ── Render un mensaje ──
  const renderMessage = (msg, prevMsg) => {
    const senderUser = USERS.find(u => u.username === msg.sender);
    const senderLabel = senderUser?.label || msg.sender;
    const isMe = msg.sender === meUsername;
    const showHeader = !prevMsg || prevMsg.sender !== msg.sender || (new Date(msg.ts) - new Date(prevMsg.ts)) > 5 * 60 * 1000;
    const color = userColor(msg.sender);

    return <div key={msg.id} style={{ display: "flex", gap: 10, marginTop: showHeader ? 14 : 2, paddingLeft: showHeader ? 0 : 46 }}>
      {showHeader && <div style={{
        width: 36, height: 36, borderRadius: "50%", background: color, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: 13, flexShrink: 0, fontFamily: FONT.body,
      }}>
        {userInitials(senderLabel)}
      </div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        {showHeader && <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: BRAND.charcoal }}>
            {senderLabel}{isMe && <span style={{ color: BRAND.stone, fontWeight: 400, marginLeft: 4 }}>(tú)</span>}
          </span>
          <span style={{ fontSize: 11, color: BRAND.stone }}>{fmtTime(msg.ts)}</span>
        </div>}
        <div style={{ fontSize: 14, color: BRAND.ink, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.body}</div>
      </div>
    </div>;
  };

  // ── Sidebar item (canal o DM) ──
  const SidebarItem = ({ icon, label, sublabel, active, unread, onClick }) => (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        background: active ? BRAND.orange : "transparent",
        color: active ? "#fff" : BRAND.darkText,
        border: "none",
        padding: sb ? "10px 16px" : "10px 12px",
        textAlign: "left",
        cursor: "pointer",
        fontSize: 13,
        fontFamily: "inherit",
        fontWeight: active ? 700 : 500,
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderLeft: active ? "3px solid #fff" : "3px solid transparent",
        position: "relative",
      }}
    >
      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
      {sb && <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
        {sublabel && <div style={{ fontSize: 10, color: active ? "rgba(255,255,255,0.7)" : BRAND.darkTextMuted, fontWeight: 400 }}>{sublabel}</div>}
      </span>}
      {unread > 0 && <span style={{
        background: active ? "#fff" : BRAND.orange,
        color: active ? BRAND.orange : "#fff",
        borderRadius: R.full,
        fontSize: 10,
        fontWeight: 800,
        padding: "2px 7px",
        minWidth: 18,
        textAlign: "center",
      }}>{unread}</span>}
    </button>
  );

  // ── Group messages by day for headers ──
  const groupedMessages = (() => {
    const groups = [];
    let lastDay = null;
    currentMessages.forEach(msg => {
      const day = new Date(msg.ts).toDateString();
      if (day !== lastDay) {
        groups.push({ kind: "day", label: dayHeader(msg.ts), key: `day-${day}` });
        lastDay = day;
      }
      groups.push({ kind: "msg", msg });
    });
    return groups;
  })();

  return <div style={{ display: "flex", height: "100vh", fontFamily: FONT.body, background: BRAND.beige, color: BRAND.charcoal }}>
    {/* Sidebar */}
    <div style={{ width: sb ? 280 : 60, background: BRAND.darkBg, color: BRAND.darkText, transition: "width .2s", overflow: "hidden", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: sb ? "20px 16px" : "20px 12px", borderBottom: `1px solid ${BRAND.darkBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setSb(!sb)} style={{ background: "none", border: "none", color: BRAND.darkTextMuted, fontSize: 20, cursor: "pointer", flexShrink: 0 }}>☰</button>
        {sb && <div>
          <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 1.5, color: BRAND.darkText, fontFamily: FONT.display }}>GeoChat 💬</div>
          <div style={{ fontSize: 9, letterSpacing: 2, color: BRAND.darkTextMuted, fontWeight: 600, marginTop: 2 }}>MENSAJERIA INTERNA</div>
        </div>}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
        {/* Canales */}
        {sb && <div style={{ padding: "4px 16px", fontSize: 10, color: BRAND.darkTextMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Canales</div>}
        {CHANNELS.map(c => (
          <SidebarItem
            key={c.id}
            icon={c.icon}
            label={`# ${c.name}`}
            active={sec.kind === "channel" && sec.id === c.id}
            unread={unreadByConv[channelConvId(c.id)] || 0}
            onClick={() => setSec({ kind: "channel", id: c.id })}
          />
        ))}

        {/* DMs */}
        {sb && <div style={{ padding: "16px 16px 4px", fontSize: 10, color: BRAND.darkTextMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Mensajes directos</div>}
        {otherUsers.map(u => (
          <SidebarItem
            key={u.username}
            icon={<span style={{
              width: 20, height: 20, borderRadius: "50%", background: userColor(u.username), color: "#fff",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 800,
            }}>{userInitials(u.label)}</span>}
            label={u.label}
            sublabel={u.role}
            active={sec.kind === "dm" && sec.id === u.username}
            unread={unreadByConv[dmConvId(u.username)] || 0}
            onClick={() => setSec({ kind: "dm", id: u.username })}
          />
        ))}
      </div>

      <div style={{ padding: 14, borderTop: `1px solid ${BRAND.darkBorder}` }}>
        {sb && <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{
            width: 28, height: 28, borderRadius: "50%", background: userColor(meUsername), color: "#fff",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 11,
          }}>{userInitials(meLabel)}</span>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.darkText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meLabel}</div>
            <div style={{ fontSize: 9, color: BRAND.darkTextMuted }}>{userRole}</div>
          </div>
        </div>}
        <button onClick={onBack} style={{ width: "100%", background: BRAND.darkSurface, color: BRAND.darkText, border: `1px solid ${BRAND.darkBorder}`, borderRadius: R.sm, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 6 }}>
          {sb ? "← Volver al panel" : "←"}
        </button>
        <button onClick={onLogout} style={{ width: "100%", background: BRAND.red, color: "#fff", border: "none", borderRadius: R.sm, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {sb ? "Cerrar sesion" : "✕"}
        </button>
      </div>
    </div>

    {/* Main chat area */}
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: BRAND.cream }}>
      {/* Header */}
      <div style={{ padding: "16px 28px", background: BRAND.cream, borderBottom: `1px solid ${BRAND.borderSoft}`, display: "flex", alignItems: "center", gap: 14 }}>
        {sec.kind === "dm" && <span style={{
          width: 40, height: 40, borderRadius: "50%", background: userColor(sec.id), color: "#fff",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 14, flexShrink: 0,
        }}>{userInitials(USERS.find(u => u.username === sec.id)?.label || sec.id)}</span>}
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontFamily: FONT.display, fontSize: 19, fontWeight: 800, color: BRAND.charcoal }}>{headerTitle}</h1>
          {headerDesc && <div style={{ fontSize: 11, color: BRAND.stone, marginTop: 2 }}>{headerDesc}</div>}
        </div>
        <div style={{ fontSize: 10, color: BRAND.stone, fontStyle: "italic" }}>
          🟢 Conectado · Actualiza cada 5s
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 28px" }}>
        {!loaded && <div style={{ textAlign: "center", padding: 40, color: BRAND.stone }}>Cargando mensajes...</div>}
        {loaded && groupedMessages.length === 0 && <div style={{ textAlign: "center", padding: 60, color: BRAND.stone, fontSize: 13 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: BRAND.charcoal }}>
            {sec.kind === "channel" ? `Bienvenido a #${sec.id}` : `Conversa con ${USERS.find(u => u.username === sec.id)?.label}`}
          </div>
          <div>Aun no hay mensajes. Sé el primero en escribir abajo.</div>
        </div>}
        {groupedMessages.map((item, idx) => {
          if (item.kind === "day") {
            return <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 12, margin: idx === 0 ? "0 0 4px" : "20px 0 4px" }}>
              <div style={{ flex: 1, height: 1, background: BRAND.borderSoft }} />
              <span style={{ fontSize: 11, color: BRAND.stone, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{item.label}</span>
              <div style={{ flex: 1, height: 1, background: BRAND.borderSoft }} />
            </div>;
          }
          // Buscar el msg anterior real
          const prevReal = (() => {
            for (let i = idx - 1; i >= 0; i--) if (groupedMessages[i].kind === "msg") return groupedMessages[i].msg;
            return null;
          })();
          return renderMessage(item.msg, prevReal);
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "12px 28px 18px", background: BRAND.cream, borderTop: `1px solid ${BRAND.borderSoft}` }}>
        <div style={{ display: "flex", gap: 10, background: "#fff", border: `1px solid ${BRAND.borderHard}`, borderRadius: R.md, padding: "10px 14px", alignItems: "flex-end" }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={sec.kind === "channel" ? `Mensaje a #${sec.id}` : `Mensaje a ${USERS.find(u => u.username === sec.id)?.label || sec.id}`}
            rows={1}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              resize: "none",
              fontSize: 14,
              fontFamily: "inherit",
              color: BRAND.charcoal,
              background: "transparent",
              maxHeight: 120,
              lineHeight: 1.5,
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!draft.trim() || sending}
            style={{
              background: !draft.trim() || sending ? BRAND.stone : BRAND.orange,
              color: "#fff",
              border: "none",
              borderRadius: R.sm,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 700,
              cursor: !draft.trim() || sending ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              flexShrink: 0,
            }}
          >{sending ? "..." : "Enviar"}</button>
        </div>
        <div style={{ fontSize: 10, color: BRAND.stone, marginTop: 6, textAlign: "right", fontStyle: "italic" }}>
          ↩ Enter para enviar · Shift+Enter para salto de linea
        </div>
      </div>
    </div>
  </div>;
}
