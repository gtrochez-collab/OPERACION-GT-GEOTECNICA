import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bvwqtfhezfgafwjcgrpv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2d3F0ZmhlemZnYWZ3amNncnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDc5NjYsImV4cCI6MjA5MTQyMzk2Nn0.EYcJBnYRnQRCzFwidfsCkaEGHGlDEAAvlsX5BrYNPRU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Shared store backed by Supabase (replaces localStorage).
 * Uses a simple key-value table: app_data(key TEXT, value JSONB).
 * Falls back to localStorage if Supabase fails, so nothing is lost.
 */

// Estado global de sincronizacion
let syncListeners = new Set();
let lastSyncState = { ok: true, error: null, at: null };
const notifySync = (state) => {
  lastSyncState = { ...lastSyncState, ...state, at: new Date().toISOString() };
  syncListeners.forEach(fn => { try { fn(lastSyncState); } catch {} });
};
export const onSyncStateChange = (fn) => {
  syncListeners.add(fn);
  fn(lastSyncState);
  return () => syncListeners.delete(fn);
};
export const getSyncState = () => lastSyncState;

// Helpers internos para timestamp local. Guardamos el ts en una key paralela
// ${k}__ts para mantener backwards compat: el valor del item sigue siendo el
// JSON puro (sin wrappers). Codigo que lee localStorage directo no se rompe.
const TS_SUFFIX = '__ts';

// Limite por item: si un value es > este tamaño, NO se guarda en localStorage
// (vive solo en cloud). Esto evita que dataUrls de PDFs/fotos llenen el cache
// local hasta romperlo. Cloud (Supabase) los maneja sin problema.
const MAX_LOCAL_VALUE_BYTES = 500 * 1024; // 500 KB

// Orden de evicción cuando localStorage se llena. Items con estos prefijos se
// borran primero porque son "regenerables" desde cloud o de bajo valor.
// Items que no matchean ningun prefijo (cp-purchases, hr-emps, lg-vehicles, etc)
// son CRITICOS y nunca se evictan automaticamente.
const EVICTION_PRIORITY_PREFIXES = [
  'cp-file-',       // archivos PDF/foto de compras (cloud es source of truth)
  'chat-channel-',  // mensajes de canales (cloud es source of truth)
  'chat-dm-',       // mensajes directos (cloud es source of truth)
  'chat-read-',     // estado de lectura del chat (no critico)
];

// Liberar espacio borrando items por prefijo en orden de prioridad.
// Retorna bytes liberados.
const freeUpLocalSpace = (neededBytes) => {
  let freed = 0;
  try {
    const keys = Object.keys(localStorage);
    for (const prefix of EVICTION_PRIORITY_PREFIXES) {
      const matching = keys.filter(k => k.startsWith(prefix) && !k.endsWith(TS_SUFFIX));
      for (const k of matching) {
        try {
          const size = (localStorage.getItem(k) || '').length;
          localStorage.removeItem(k);
          try { localStorage.removeItem(k + TS_SUFFIX); } catch {}
          freed += size;
          if (freed >= neededBytes) return freed;
        } catch {}
      }
    }
  } catch (e) {
    console.warn('[store] error liberando espacio local', e);
  }
  return freed;
};

const readLocalWithTs = (k) => {
  let value = undefined, ts = null;
  try {
    const raw = localStorage.getItem(k);
    if (raw !== null) value = JSON.parse(raw);
  } catch (e) {
    console.warn(`[store] localStorage corrupto para ${k}, ignorando`, e);
  }
  try {
    ts = localStorage.getItem(k + TS_SUFFIX);
  } catch {}
  return { value, ts };
};

const writeLocalWithTs = (k, v, ts) => {
  let json;
  try {
    json = JSON.stringify(v);
  } catch (e) {
    console.error(`[store] no se pudo serializar ${k}`, e);
    return;
  }

  // Item demasiado grande: NO guardar en local. Vive solo en cloud.
  // Esto cubre principalmente cp-file-* (PDFs/fotos en base64), que pueden
  // pesar varios MB cada uno y llenan el cache muy rapido.
  if (json.length > MAX_LOCAL_VALUE_BYTES) {
    // Si habia version vieja del item, limpiarla
    try {
      localStorage.removeItem(k);
      localStorage.removeItem(k + TS_SUFFIX);
    } catch {}
    return;
  }

  // Intento 1: write normal
  try {
    localStorage.setItem(k, json);
    localStorage.setItem(k + TS_SUFFIX, ts);
    return;
  } catch (e) {
    const isQuota = e?.name === 'QuotaExceededError' || e?.code === 22 || e?.code === 1014;
    if (!isQuota) {
      console.error(`[store] error inesperado guardando ${k}`, e);
      return;
    }
    // Quota lleno: liberar espacio y reintentar
    const freed = freeUpLocalSpace(json.length * 2);
    console.warn(`[store] localStorage lleno, liberados ${(freed/1024/1024).toFixed(2)}MB. Reintentando ${k}...`);
    try {
      localStorage.setItem(k, json);
      localStorage.setItem(k + TS_SUFFIX, ts);
      return;
    } catch (e2) {
      console.error(`[store] cache local saltado para ${k} tras liberar espacio — la nube tiene los datos.`, e2);
    }
  }
};

// ── Migracion automatica al cargar el modulo ──
// Limpia cualquier cp-file-* y chat-channel-/chat-dm- viejos que esten ocupando
// espacio en localStorage. Estos items son regenerables desde cloud, asi que
// no se pierde nada — solo se libera espacio para data critica.
// Se ejecuta UNA vez por sesion (cuando se importa el modulo).
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    let cleaned = 0;
    let freed = 0;
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      // Solo limpiar archivos. Mensajes de chat los dejamos para fast load
      // (solo se evictan si hace falta espacio via freeUpLocalSpace).
      if (k.startsWith('cp-file-') && !k.endsWith(TS_SUFFIX)) {
        try {
          freed += (localStorage.getItem(k) || '').length;
          localStorage.removeItem(k);
          try { localStorage.removeItem(k + TS_SUFFIX); } catch {}
          cleaned++;
        } catch {}
      }
    }
    if (cleaned > 0) {
      console.info(`[store] migracion: limpiados ${cleaned} archivos del cache local (${(freed/1024/1024).toFixed(2)}MB liberados). Los archivos viven en cloud.`);
    }
  }
} catch {}

export const store = {
  async get(k) {
    // 1) Leer ambos: cloud (con su updated_at) y local (con su ts).
    let cloudValue = undefined;
    let cloudTs = null;
    try {
      const { data, error } = await supabase
        .from('app_data')
        .select('value, updated_at')
        .eq('key', k)
        .maybeSingle();
      if (!error && data) {
        cloudValue = data.value;
        cloudTs = data.updated_at || null;
      } else if (error && error.code !== 'PGRST116') {
        console.warn('Supabase get warning for', k, error);
      }
    } catch (e) {
      console.warn('Supabase get network error for', k, e);
    }
    const { value: localValue, ts: localTs } = readLocalWithTs(k);

    // 2) Resolucion de cual usar:
    //    - Si tenemos cloud Y local con ambos timestamps, comparar y usar el mas reciente.
    //      Esto es CRITICO: si un set local fallo en sincronizar a la nube, el local quedo
    //      mas nuevo. Sin esta comparacion, sobrescribiriamos el local con el cloud viejo y
    //      perderiamos los cambios. Bug clasico reportado por el usuario: "no se guardan las
    //      solicitudes despues de refrescar".
    //    - Si solo hay cloud, usar cloud (y refrescar cache local).
    //    - Si solo hay local, usar local.
    if (cloudValue !== undefined && cloudValue !== null) {
      if (localValue !== undefined && localValue !== null && localTs && cloudTs) {
        const localDate = new Date(localTs);
        const cloudDate = new Date(cloudTs);
        if (!isNaN(localDate) && !isNaN(cloudDate) && localDate > cloudDate) {
          console.warn(`[store] cache local mas reciente que nube para "${k}" (local=${localTs} vs nube=${cloudTs}). Usando local. Probable sync fallido previamente — intentando re-sincronizar en background.`);
          // Disparar un re-sync en background (sin bloquear el get). Si la nube esta otra vez
          // disponible, se pondra al dia. No esperamos el resultado.
          this.set(k, localValue).catch(() => {});
          return localValue;
        }
      }
      // Cloud gana — refrescar cache local con el cloud value Y su ts.
      writeLocalWithTs(k, cloudValue, cloudTs || new Date().toISOString());
      return cloudValue;
    }

    // Solo local disponible
    if (localValue !== undefined && localValue !== null) {
      console.info(`[store] usando cache local para ${k} (nube sin datos)`);
      return localValue;
    }
    return null;
  },

  async set(k, v) {
    const ts = new Date().toISOString();
    // 1) Guardar SIEMPRE en localStorage primero (red de seguridad), con timestamp.
    writeLocalWithTs(k, v, ts);

    // 2) Intentar Supabase con retry-with-backoff (3 intentos: 0ms, 600ms, 1800ms)
    // Esto absorbe glitches de red intermitentes (WiFi inestable, throttling, etc.)
    // sin tener que mostrarle un error feo al usuario.
    const delays = [0, 600, 1800];
    let lastError = null;
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt] > 0) await new Promise(r => setTimeout(r, delays[attempt]));
      try {
        const { error } = await supabase
          .from('app_data')
          .upsert({ key: k, value: v, updated_at: ts }, { onConflict: 'key' });
        if (error) throw error;
        if (attempt > 0) console.info(`[store] sincronizado tras ${attempt + 1} intentos: ${k}`);
        notifySync({ ok: true, error: null, lastKey: k });
        return true;
      } catch (e) {
        lastError = e;
        console.warn(`[store] intento ${attempt + 1}/3 fallo para ${k}:`, e.message || e);
      }
    }
    // Todos los retries fallaron. El local ya quedo guardado con su ts, asi que
    // store.get() lo va a preferir sobre el cloud viejo. Cuando recupere conexion,
    // el proximo get(k) va a disparar un re-sync automatico en background.
    const errMsg = lastError?.message || String(lastError);
    console.error(`[store] NO se sincronizo a la nube tras 3 intentos: ${k}`, lastError);
    notifySync({ ok: false, error: { key: k, message: errMsg }, lastKey: k });
    return false;
  },

  // Exponer el ultimo error para que la UI pueda mostrarlo
  getLastError: () => lastSyncState.error,
};
