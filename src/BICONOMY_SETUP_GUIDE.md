# 🚀 Biconomy Supertransaction 설정 가이드

## 📋 개요

이 시스템은 Biconomy Supertransaction API를 통합하여 안전하고 효율적인 암호화폐 출금 및 스왑 기능을 제공합니다. 모든 민감한 API Key는 암호화되어 데이터베이스에 저장됩니다.

---

## 🔧 설정 단계

### 1️⃣ 데이터베이스 마이그레이션

Supabase SQL Editor에서 다음 파일을 실행하세요:

```bash
/database/system_settings_migration.sql
```

이 스크립트는:
- ✅ `system_settings` 테이블 생성
- ✅ 자동 `updated_at` 트리거 설정
- ✅ RLS(Row Level Security) 활성화 - 관리자만 접근 가능
- ✅ 인덱스 생성

---

### 2️⃣ Biconomy API Key 발급

1. 🌐 [https://supertransaction.biconomy.io](https://supertransaction.biconomy.io) 방문
2. 📧 이메일로 가입 (무료!)
3. 🔑 API Key 발급받기
   - 형식 예시: `mee_VPQhU1Xe7Xq3w9M59EvFab`

**무료 티어 (Free Tier)**:
- 월 1,000 트랜잭션
- 모든 기능 사용 가능
- 커뮤니티 지원

---

### 3️⃣ 관리자 페이지에서 설정

1. **관리자 로그인**
   ```
   URL: http://localhost:3000/admin
   ```

2. **Biconomy 설정 메뉴**
   - 왼쪽 사이드바에서 "⚙️ Biconomy 설정" 클릭

3. **API Key 입력**
   - API Key 입력 (자동으로 마스킹됨: `mee_***************vFab`)
   - API URL: `https://supertransaction.biconomy.io/api/v1` (기본값)
   - "연결 테스트" 버튼으로 API 연결 확인 ✅

4. **설정 저장**
   - "저장" 버튼 클릭
   - API Key는 XOR 암호화 + Base64로 자동 암호화되어 DB에 저장됨 🔒

5. **Biconomy 활성화**
   - "Biconomy 활성화" 토글을 켜기
   - 이제 사용자 페이지에서 Supertransaction 기능 사용 가능!

---

## 🎨 사용자 경험

### 사용자 페이지 (모바일 최적화)

**출금 페이지**:
- ⚡ "스마트 거래" 토글 (Supertransaction 활성화 시)
- 💰 가스비 USDC로 자동 지불
- 🎯 한 번의 서명으로 완료
- 📊 실시간 가스비 견적 표시

**스왑 페이지**:
- 🔄 "스마트 스왑" 토글
- 📈 최적 경로 자동 선택
- 💎 슬리피지 자동 최소화

---

## 🛡️ 보안 기능

### 암호화

```typescript
// API Key 암호화 (저장 시)
encryptData(apiKey) // XOR + Base64

// API Key 복호화 (사용 시)
decryptData(encryptedApiKey)

// API Key 마스킹 (표시 시)
maskApiKey(apiKey) // "mee_***************vFab"
```

### 접근 제어

- ✅ **RLS 정책**: 관리자만 `system_settings` 테이블 접근 가능
- ✅ **암호화 저장**: API Key는 평문으로 저장되지 않음
- ✅ **환경 분리**: 프론트엔드에 API Key 노출 없음

---

## 📊 아키텍처

```
┌─────────────────┐
│  사용자 페이지   │
│ (Mobile UI)     │
└────────┬────────┘
         │
         │ 1. 출금/스왑 요청
         ▼
┌─────────────────────────────────┐
│  /utils/api/biconomy.ts         │
│  - composeBiconomyTransaction() │
│  - executeBiconomyTransaction() │
│  - getBiconomyTransactionStatus()│
└────────┬────────────────────────┘
         │
         │ 2. DB에서 설정 조회
         ▼
┌─────────────────────────────────┐
│  /utils/systemSettings.ts       │
│  - getBiconomySettings()        │
│    → 암호화된 API Key 복호화    │
└────────┬────────────────────────┘
         │
         │ 3. Biconomy API 호출
         ▼
┌─────────────────────────────────┐
│  Biconomy Supertransaction API  │
│  - Compose (가스비 견적)         │
│  - Execute (트랜잭션 실행)       │
│  - Status (상태 조회)            │
└─────────────────────────────────┘
```

---

## 🔍 테스트 방법

### 1. 연결 테스트
```typescript
// 관리자 페이지 > Biconomy 설정 > "연결 테스트" 버튼
await testBiconomyConnection(apiKey, apiUrl);
// ✅ 성공: "연결 성공!"
// ❌ 실패: "API Key를 확인해주세요"
```

### 2. 출금 테스트
1. 사용자 페이지 로그인
2. 출금 페이지 이동
3. "⚡ 스마트 거래" 토글 켜기
4. 금액 및 주소 입력
5. "출금 요청" 버튼 클릭
6. 관리자 페이지에서 승인
   - Supertransaction payload가 함께 저장됨
   - 관리자 승인 시 자동 실행

### 3. 스왑 테스트
1. 스왑 페이지 이동
2. "🔄 스마트 스왑" 토글 켜기
3. 토큰 선택 및 금액 입력
4. 가스비 견적 확인
5. "스왑 실행" 버튼 클릭

---

## 📂 주요 파일 구조

```
/utils/
  ├── encryption.ts                 # 암호화/복호화 유틸리티
  ├── systemSettings.ts             # 시스템 설정 관리
  └── api/
      └── biconomy.ts               # Biconomy API 호출

/components/
  └── BiconomySettings.tsx          # 관리자 설정 페이지

/user/components/
  ├── Withdrawal.tsx                # 출금 페이지 (Supertransaction 통합)
  └── Swap.tsx                      # 스왑 페이지 (Supertransaction 통합)

/database/
  └── system_settings_migration.sql # DB 마이그레이션 스크립트
```

---

## 🔄 작동 흐름

### Compose → Sign → Execute

```typescript
// 1️⃣ Compose: 무엇을 할지 알림
const { payload, quote } = await composeBiconomyTransaction({
  chainId: 8453, // Base
  from: userAddress,
  steps: [
    { type: 'transfer', token: 'USDT', to: recipient, amount: '100' }
  ],
  gasPayment: { sponsor: false, token: 'USDC' }
});

// 가스비 견적 표시
console.log(quote.gasCost); // "0.5 USDC"
console.log(quote.estimatedTime); // "~5 seconds"

// 2️⃣ DB에 저장 (pending 상태)
await supabase.from('withdrawals').insert({
  supertransaction_payload: payload,
  gas_quote: quote,
  status: 'pending'
});

// 3️⃣ 관리자 승인 시 Execute
const { txHash } = await executeBiconomyTransaction({
  payload: payload,
  signature: adminSignature
});

// 4️⃣ 완료!
console.log('TX Hash:', txHash);
```

---

## ⚠️ 주의사항

### 운영 환경 (Production)

1. **더 강력한 암호화 사용**
   ```typescript
   // 현재: XOR + Base64 (간단한 인코딩)
   // 권장: AES-256-GCM (실제 암호화)
   
   // Web Crypto API 사용 예시
   const key = await crypto.subtle.generateKey(
     { name: 'AES-GCM', length: 256 },
     true,
     ['encrypt', 'decrypt']
   );
   ```

2. **환경 변수로 암호화 키 관리**
   ```env
   ENCRYPTION_KEY=your-32-byte-secret-key
   ```

3. **감사 로그 (Audit Log)**
   - API Key 접근 기록
   - 설정 변경 이력
   - 관리자 작업 로그

4. **백업**
   - `system_settings` 테이블 정기 백업
   - 암호화 키 안전한 곳에 보관

---

## 🐛 트러블슈팅

### ❌ "Biconomy가 활성화되지 않았습니다"
**해결**: 관리자 페이지 > Biconomy 설정 > "Biconomy 활성화" 토글 켜기

### ❌ "API Key가 설정되지 않았습니다"
**해결**: 관리자 페이지 > Biconomy 설정 > API Key 입력 및 저장

### ❌ "연결 테스트 실패"
**원인**:
1. 잘못된 API Key
2. 네트워크 문제
3. CORS 이슈 (브라우저)

**해결**:
1. Biconomy 대시보드에서 API Key 재확인
2. 네트워크 연결 확인
3. API URL이 정확한지 확인

### ❌ "RLS policy violation"
**원인**: 관리자가 아닌 사용자가 `system_settings` 접근 시도

**해결**: 관리자 계정으로 로그인 필요

---

## 📚 참고 자료

- **Biconomy 공식 문서**: https://docs.biconomy.io/supertransaction-api
- **Discord**: https://discord.gg/biconomy
- **GitHub**: https://github.com/bcnmy

---

## 🎉 완료!

이제 Biconomy Supertransaction이 완전히 통합되었습니다!

### 체크리스트
- ✅ DB 마이그레이션 완료
- ✅ API Key 발급 및 입력
- ✅ 연결 테스트 성공
- ✅ Biconomy 활성화
- ✅ 사용자 페이지에서 출금/스왑 테스트

**시작하기**: 관리자 페이지 > Biconomy 설정 🚀
