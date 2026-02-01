/**
 * Supabase DB 연결 상태 진단 도구
 */

import { supabase } from './supabase/client';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'down';
  supabaseConnection: boolean;
  authSession: boolean;
  databaseQuery: boolean;
  responseTime: number;
  errors: string[];
}

export async function checkDBHealth(): Promise<HealthCheckResult> {
  const errors: string[] = [];
  const startTime = Date.now();
  let result: HealthCheckResult = {
    status: 'healthy',
    supabaseConnection: false,
    authSession: false,
    databaseQuery: false,
    responseTime: 0,
    errors: [],
  };

  try {
    // 1. Supabase 연결 확인
    console.log('🔍 [DB Health Check] Checking Supabase connection...');
    try {
      const { data, error } = await Promise.race([
        supabase.from('users').select('count()', { count: 'exact' }).limit(1),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), 5000)
        ) as any,
      ]);

      if (error) {
        console.error('❌ Database query failed:', error);
        errors.push(`Database query error: ${error.message}`);
        result.status = 'down';
      } else {
        console.log('✅ Database connection OK');
        result.databaseQuery = true;
      }
    } catch (err: any) {
      console.error('❌ Database connection error:', err);
      errors.push(`Database connection timeout: ${err.message}`);
      result.status = 'down';
    }

    // 2. Auth 세션 확인
    console.log('🔍 [DB Health Check] Checking Auth session...');
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        console.log('✅ Auth session OK');
        result.authSession = true;
      } else {
        console.warn('⚠️ No active auth session');
      }
    } catch (err: any) {
      console.error('❌ Auth session check failed:', err);
      errors.push(`Auth error: ${err.message}`);
    }

    // 3. Supabase 인스턴스 확인
    console.log('🔍 [DB Health Check] Checking Supabase instance...');
    if (supabase) {
      console.log('✅ Supabase instance OK');
      result.supabaseConnection = true;
    } else {
      console.error('❌ Supabase instance is null');
      errors.push('Supabase instance not initialized');
      result.status = 'down';
    }

    // 상태 결정
    if (errors.length === 0) {
      result.status = 'healthy';
    } else if (result.databaseQuery) {
      result.status = 'degraded';
    }

    result.responseTime = Date.now() - startTime;
    result.errors = errors;

    console.log('📊 [DB Health Check] Result:', result);
    return result;
  } catch (err: any) {
    console.error('❌ [DB Health Check] Unexpected error:', err);
    return {
      status: 'down',
      supabaseConnection: false,
      authSession: false,
      databaseQuery: false,
      responseTime: Date.now() - startTime,
      errors: [err.message],
    };
  }
}

/**
 * 모든 주요 테이블 쿼리 테스트
 */
export async function testAllTables(): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  const tables = ['users', 'deposits', 'transfer_requests', 'notifications', 'support_messages'];

  for (const table of tables) {
    try {
      const { error } = await Promise.race([
        supabase.from(table).select('*').limit(1),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 5000)
        ) as any,
      ]);

      results[table] = !error;
      console.log(`${!error ? '✅' : '❌'} ${table}: ${error?.message || 'OK'}`);
    } catch (err: any) {
      results[table] = false;
      console.error(`❌ ${table}: ${err.message}`);
    }
  }

  return results;
}

// 자동 실행: 앱 시작 시 DB 상태 확인
if (typeof window !== 'undefined') {
  console.log('🚀 Running DB health check on app startup...');
  checkDBHealth();
}
