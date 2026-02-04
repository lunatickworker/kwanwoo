import crypto from 'crypto';

/**
 * 암호화된 Private Key 복호화
 * AES-256-GCM 사용
 */
export function decryptPrivateKey(encryptedData: string | any): string {
  try {
    // JSON 문자열인 경우 파싱
    let data: any;
    if (typeof encryptedData === 'string') {
      data = JSON.parse(encryptedData);
    } else {
      data = encryptedData;
    }

    // 환경변수에서 암호화 키 조회
    const encryptionKey = process.env.VITE_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY 환경변수가 설정되지 않았습니다');
    }

    // 키를 32바이트로 정규화 (SHA-256)
    const key = crypto
      .createHash('sha256')
      .update(encryptionKey)
      .digest();

    // iv와 데이터를 Buffer로 변환
    const iv = Buffer.from(data.iv);
    const encryptedBuffer = Buffer.from(data.data);
    
    // authTag 있으면 사용 (GCM mode)
    let decipher;
    if (data.authTag) {
      decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(Buffer.from(data.authTag));
    } else {
      // Fallback: CBC mode
      decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    }

    // 복호화
    let decrypted = decipher.update(encryptedBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf-8');
  } catch (error: any) {
    console.error('❌ Private Key 복호화 실패:', error.message);
    throw new Error(`Private Key 복호화 실패: ${error.message}`);
  }
}

/**
 * Private Key 암호화 (DB 저장용)
 * AES-256-GCM 사용
 */
export function encryptPrivateKey(privateKey: string): string {
  try {
    const encryptionKey = process.env.VITE_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY 환경변수가 설정되지 않았습니다');
    }

    // 키를 32바이트로 정규화
    const key = crypto
      .createHash('sha256')
      .update(encryptionKey)
      .digest();

    // 랜덤 IV 생성
    const iv = crypto.randomBytes(16);

    // GCM mode로 암호화
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(privateKey, 'utf-8', 'binary');
    encrypted += cipher.final('binary');

    const authTag = cipher.getAuthTag();

    // 결과를 JSON으로 인코딩
    const result = {
      iv: Array.from(iv),
      data: Array.from(Buffer.from(encrypted, 'binary')),
      authTag: Array.from(authTag),
      algorithm: 'aes-256-gcm'
    };

    return JSON.stringify(result);
  } catch (error: any) {
    console.error('❌ Private Key 암호화 실패:', error.message);
    throw new Error(`Private Key 암호화 실패: ${error.message}`);
  }
}
