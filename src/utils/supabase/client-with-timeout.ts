import { supabase } from './client';

/**
 * Supabase 쿼리에 타임아웃을 추가하는 래퍼
 * 네트워크 끊김 시 무한 대기 방지 (15초)
 */
const QUERY_TIMEOUT = 15000; // 15초

export async function withTimeout<T>(
  promise: Promise<T>,
  timeout: number = QUERY_TIMEOUT
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Database query timeout')), timeout)
    ),
  ]);
}

/**
 * Supabase 쿼리 래퍼 - 타임아웃과 기본값 지원
 */
export async function queryWithFallback<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  fallbackData: T | null = null
): Promise<{ data: T | null; error: any }> {
  try {
    const result = await withTimeout(queryFn());
    return result;
  } catch (error: any) {
    console.warn('Query timeout/failed, using fallback:', error?.message);
    return { data: fallbackData, error };
  }
}

export { supabase };
