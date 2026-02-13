/**
 * 환경변수에서 암호화 키 조회 (WALLET_ENCRYPTION_KEY 사용)
 * 백엔드와 동일한 암호화 키 사용
 */
function getEncryptionKey(): string {
  // Vite 환경 (클라이언트)
  const viteKey = import.meta.env.VITE_WALLET_ENCRYPTION_KEY;
  if (viteKey) {
    console.log('✅ WALLET_ENCRYPTION_KEY 환경변수 로드됨, 길이:', (viteKey as string).length);
    return viteKey as string;
  }

  // 기본값 (개발용)
  const defaultKey = 'default-encryption-key-please-change-in-production';
  console.warn('⚠️ WALLET_ENCRYPTION_KEY 환경변수 없음, 기본값 사용 (개발용)');
  return defaultKey;
}

/**
 * 암호화된 Private Key 복호화
 * Web Crypto API 사용 (백엔드와 동일)
 * AES-256-GCM 사용
 */
export async function decryptPrivateKey(encryptedData: string | any): Promise<string> {
  try {
    // JSON 문자열인 경우 파싱
    let data: any;
    if (typeof encryptedData === 'string') {
      data = JSON.parse(encryptedData);
    } else {
      data = encryptedData;
    }

    console.log('🔐 [해독 시작]', {
      iv: Array.isArray(data.iv) ? `배열 길이 ${data.iv.length}` : typeof data.iv,
      data: Array.isArray(data.data) ? `배열 길이 ${data.data.length}` : typeof data.data,
      keys: Object.keys(data),
      rawData: JSON.stringify(encryptedData).substring(0, 200)
    });

    const encryptionKey = getEncryptionKey();
    console.log('🔑 [환경변수]', {
      keyExists: Boolean(encryptionKey),
      keyLength: encryptionKey?.length || 0,
      isDefault: encryptionKey === 'default-encryption-key-please-change-in-production'
    });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // 256-bit 키 생성 (백엔드와 동일)
    console.log('🔐 [SHA-256 해싱]');
    const keyMaterial = await crypto.subtle.digest(
      'SHA-256',
      encoder.encode(encryptionKey)
    );

    console.log('🔐 [키 import]');
    const key = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      'AES-GCM',
      false,
      ['decrypt']
    );

    // 데이터 검증
    if (!Array.isArray(data.iv) || data.iv.length !== 12) {
      throw new Error(`IV 길이 오류: ${data.iv?.length} (12이어야 함)`);
    }
    if (!Array.isArray(data.data) || data.data.length === 0) {
      throw new Error(`암호화 데이터 오류: 길이 ${data.data?.length}`);
    }

    const ivArray = new Uint8Array(data.iv);
    const dataArray = new Uint8Array(data.data);

    console.log('🔐 [decrypt 호출]', {
      ivBytes: Array.from(ivArray).slice(0, 6),
      dataBytes: Array.from(dataArray).slice(0, 6),
      dataLength: dataArray.length
    });

    // 복호화
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivArray },
      key,
      dataArray
    );

    const result = decoder.decode(decrypted);
    console.log('✅ [복호화 성공]', { length: result.length, preview: result.substring(0, 50) });
    return result;
  } catch (error: any) {
    console.error('❌ [복호화 실패]', {
      errorName: error.name,
      errorMessage: error.message,
      errorCode: error.code,
      errorFull: error.toString()
    });
    throw new Error(`Private Key 복호화 실패: ${error.message || error.name || '알 수 없는 오류'}`);
  }
}

/**
 * Private Key 암호화 (DB 저장용)
 * Web Crypto API 사용 (백엔드와 동일)
 * AES-256-GCM 사용
 */
export async function encryptPrivateKey(privateKey: string): Promise<string> {
  try {
    const encryptionKey = getEncryptionKey();
    const encoder = new TextEncoder();
    const data = encoder.encode(privateKey);

    // 256-bit 키 생성 (백엔드와 동일)
    const keyMaterial = await crypto.subtle.digest(
      'SHA-256',
      encoder.encode(encryptionKey)
    );

    const key = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      'AES-GCM',
      false,
      ['encrypt']
    );

    // 랜덤 IV 생성 (12바이트)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 암호화
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    // IV + 암호화된 데이터를 JSON으로 저장 (백엔드와 동일)
    return JSON.stringify({
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted))
    });
  } catch (error: any) {
    console.error('❌ Private Key 암호화 실패:', error.message);
    throw new Error(`Private Key 암호화 실패: ${error.message}`);
  }
}
