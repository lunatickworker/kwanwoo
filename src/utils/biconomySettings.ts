import { supabase } from './supabase/client';

/**
 * Biconomy 설정 조회
 */
export async function getBiconomySettings(): Promise<{ enabled: boolean }> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('biconomy_enabled')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // 설정이 없으면 기본값 false
        return { enabled: false };
      }
      console.error('Biconomy 설정 조회 실패:', error);
      return { enabled: false };
    }

    return {
      enabled: data?.biconomy_enabled ?? false,
    };
  } catch (error) {
    console.error('Biconomy 설정 조회 중 오류:', error);
    return { enabled: false };
  }
}

/**
 * Biconomy 활성화 여부 확인
 */
export async function isBiconomyEnabled(): Promise<boolean> {
  const settings = await getBiconomySettings();
  return settings.enabled;
}
