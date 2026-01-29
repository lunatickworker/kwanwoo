/**
 * Biconomy 설정 확인 유틸리티
 */

import { supabase } from '../supabase/client';

interface BiconomySettings {
  biconomy_enabled: boolean;
  biconomy_api_key?: string;
}

/**
 * Biconomy가 활성화되어 있는지 확인
 */
export async function isBiconomyEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('biconomy_enabled')
      .single();

    if (error) {
      console.error('Biconomy 설정 확인 실패:', error);
      return false;
    }

    return data?.biconomy_enabled ?? false;
  } catch (error) {
    console.error('Biconomy 설정 확인 중 오류:', error);
    return false;
  }
}

/**
 * Biconomy 설정 가져오기
 */
export async function getBiconomySettings(): Promise<BiconomySettings> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('biconomy_enabled, biconomy_api_key')
      .single();

    if (error) {
      console.error('Biconomy 설정 조회 실패:', error);
      return { biconomy_enabled: false };
    }

    return {
      biconomy_enabled: data?.biconomy_enabled ?? false,
      biconomy_api_key: data?.biconomy_api_key,
    };
  } catch (error) {
    console.error('Biconomy 설정 조회 중 오류:', error);
    return { biconomy_enabled: false };
  }
}

/**
 * Biconomy 사용 전 확인
 * 비활성화되어 있으면 에러를 던짐
 */
export async function checkBiconomyEnabled(): Promise<void> {
  const enabled = await isBiconomyEnabled();
  
  if (!enabled) {
    throw new Error('Biconomy가 비활성화되어 있습니다. 시스템 설정에서 활성화해주세요.');
  }
}
