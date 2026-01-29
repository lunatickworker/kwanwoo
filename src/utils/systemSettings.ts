/**
 * 시스템 설정 관리 유틸리티
 * - Biconomy API Key 등 민감한 설정을 암호화하여 저장
 * - 관리자 페이지에서 사용
 */

import { supabase } from './supabase/client';
import { encryptData, decryptData } from './encryption';

export interface BiconomySettings {
  apiKey: string;
  apiUrl: string;
  enabled: boolean;
}

/**
 * Biconomy 설정 조회 (복호화)
 */
export async function getBiconomySettings(): Promise<BiconomySettings | null> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('biconomy_api_key, biconomy_bundler_url, biconomy_paymaster_url, biconomy_enabled')
      .eq('id', 1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // 데이터가 없으면 null 반환
        return null;
      }
      throw error;
    }

    if (!data) return null;

    // API Key 복호화 (암호화되어 있는 경우)
    let decryptedApiKey = data.biconomy_api_key || '';
    
    // 암호화된 키인지 확인 후 복호화 시도
    if (decryptedApiKey && decryptedApiKey.includes(':')) {
      try {
        decryptedApiKey = decryptData(decryptedApiKey);
      } catch (decryptError) {
        console.warn('API Key decryption failed, using as-is:', decryptError);
        // 복호화 실패 시 원본 사용
      }
    }

    return {
      apiKey: decryptedApiKey,
      apiUrl: data.biconomy_bundler_url || 'https://supertransaction.biconomy.io/api/v1',
      enabled: data.biconomy_enabled ?? false,
    };
  } catch (error) {
    console.error('Get Biconomy settings error:', error);
    return null;
  }
}

/**
 * Biconomy 설정 저장 (암호화)
 */
export async function saveBiconomySettings(
  settings: BiconomySettings,
  userId: string
): Promise<void> {
  try {
    // API Key 암호화
    const encryptedApiKey = settings.apiKey ? encryptData(settings.apiKey) : null;
    
    // DB에 저장 (upsert)
    const { error } = await supabase
      .from('system_settings')
      .upsert({
        id: 1,
        biconomy_api_key: encryptedApiKey,
        biconomy_bundler_url: settings.apiUrl || null,
        biconomy_enabled: settings.enabled,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (error) throw error;
  } catch (error) {
    console.error('Save Biconomy settings error:', error);
    throw new Error('Biconomy 설정 저장에 실패했습니다');
  }
}
