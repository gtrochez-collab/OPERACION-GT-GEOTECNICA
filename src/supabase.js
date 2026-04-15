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

export const store = {
  async get(k) {
    // 1) Intentar Supabase primero
    let cloudValue = undefined;
    try {
      const { data, error } = await supabase
        .from('app_data')
        .select('value')
        .eq('key', k)
        .maybeSingle();
      if (!error && data) {
        cloudValue = data.value;
        // Refrescar cache local
        try { localStorage.setItem(k, JSON.stringify(cloudValue)); } catch {}
      } else if (error && error.code !== 'PGRST116') {
        console.warn('Supabase get warning for', k, error);
      }
    } catch (e) {
      console.warn('Supabase get network error for', k, e);
    }
    if (cloudValue !== undefined && cloudValue !== null) return cloudValue;

    // 2) Fallback a localStorage si la nube no tiene nada
    try {
      const v = localStorage.getItem(k);
      if (v) {
        const parsed = JSON.parse(v);
        // Si tenemos datos locales pero nube vacia, reportar que hay datos sin sincronizar
        if (parsed) console.info(`[store] usando cache local para ${k} (nube sin datos)`);
        return parsed;
      }
    } catch {}
    return null;
  },

  async set(k, v) {
    // 1) Guardar SIEMPRE en localStorage primero (red de seguridad)
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
      console.error(`[store] no se pudo guardar en cache local: ${k}`, e);
    }

    // 2) Intentar Supabase
    try {
      const { error } = await supabase
        .from('app_data')
        .upsert({ key: k, value: v, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      notifySync({ ok: true, error: null, lastKey: k });
      return true;
    } catch (e) {
      console.error(`[store] NO se sincronizo a la nube: ${k}`, e);
      notifySync({ ok: false, error: { key: k, message: e.message || String(e) }, lastKey: k });
      return false;
    }
  },
};
