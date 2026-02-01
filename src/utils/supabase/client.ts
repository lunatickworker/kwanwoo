import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mzoeeqmtvlnyonicycvg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16b2VlcW10dmxueW9uaWN5Y3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MjIyNzcsImV4cCI6MjA3ODQ5ODI3N30.oo7FsWjthtBtM-Xa1VFJieMGQ4mG__V8w7r9qGBPzaI';

// ⏱️ Supabase 클라이언트 타임아웃 설정 추가
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  // 네트워크 타임아웃: 30초
  realtime: {
    // 30초 후 연결 재시도
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  // Fetch 타임아웃 설정 (fetch 사용하는 경우)
  global: {
    fetch: (url, options = {}) => {
      // 타임아웃 20초 (빠른 응답)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      
      return fetch(url, {
        ...options,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId)).catch(err => {
        // 네트워크 에러 로깅
        if (err.name === 'AbortError') {
          console.warn('⏱️ Supabase query timeout (20s):', url);
        }
        throw err;
      });
    }
  }
});

console.log('✅ Supabase client initialized with 20s timeout');
