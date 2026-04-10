import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bvwqtfhezfgafwjcgrpv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2d3F0ZmhlemZnYWZ3amNncnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDc5NjYsImV4cCI6MjA5MTQyMzk2Nn0.EYcJBnYRnQRCzFwidfsCkaEGHGlDEAAvlsX5BrYNPRU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Shared store backed by Supabase (replaces localStorage).
 * Uses a simple key-value table: app_data(key TEXT, value JSONB).
 * Falls back to localStorage if Supabase fails.
 */
export const store = {
  async get(k) {
    try {
      const { data, error } = await supabase
        .from('app_data')
        .select('value')
        .eq('key', k)
        .single();
      if (error || !data) return null;
      return data.value;
    } catch {
      // Fallback to localStorage
      try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : null;
      } catch { return null; }
    }
  },

  async set(k, v) {
    try {
      const { error } = await supabase
        .from('app_data')
        .upsert({ key: k, value: v, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      // Also save to localStorage as cache
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
      console.error('Supabase write error, saving to localStorage:', e);
      localStorage.setItem(k, JSON.stringify(v));
    }
  },
};
