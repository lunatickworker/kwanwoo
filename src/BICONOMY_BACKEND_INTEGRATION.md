# Biconomy Backend Integration Guide

## 🔒 보안 아키텍처

### EOA (Externally Owned Account) 생성 및 관리

```
Frontend (사용자)
    ↓
    ↓ API 요청 (지갑 주소만 받음)
    ↓
Backend (Supabase Edge Function)
    ↓
    1. ethers.js로 EOA 생성
    2. Private Key 암호화 (AES-256-GCM)
    3. DB에 암호화된 키 저장
    4. 사용자에게는 주소만 반환
```

### Biconomy API 호출 플로우

```
Frontend
    ↓
    1. Compose 요청 (거래 내용)
    ↓
Backend
    ↓
    2. Biconomy API에 Compose 호출
    3. Payload 생성
    ↓
Frontend
    ↓
    4. Execute 요청 (wallet_id + payload)
    ↓
Backend
    ↓
    5. DB에서 암호화된 Private Key 조회
    6. Private Key 복호화
    7. Payload 서명
    8. Biconomy API에 Execute 호출
    9. 트랜잭션 해시 반환
```

---

## 🚀 사용 방법

### 1. 환경 변수 설정

```env
# Supabase Edge Function 환경 변수
BICONOMY_API_KEY=your_biconomy_api_key
BICONOMY_API_URL=https://supertransaction.biconomy.io/api/v1
WALLET_ENCRYPTION_KEY=your_strong_encryption_key_minimum_32_characters
```

### 2. 지갑 생성 (EOA)

**Frontend 코드:**
```typescript
// 새 지갑 생성 요청
const response = await fetch(`${BACKEND_URL}/api/wallet/create`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: 'user_123',
    coin_type: 'KRWQ',
    wallet_type: 'hot'
  })
});

const { wallet } = await response.json();
console.log('지갑 주소:', wallet.address);
// 출력: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

**Backend 처리 (자동):**
```typescript
// 1. ethers.js로 실제 EOA 생성
const wallet = ethers.Wallet.createRandom();
// address: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
// privateKey: 0x1234...abcd (사용자에게 노출되지 않음!)

// 2. Private Key 암호화
const encryptedPrivateKey = encrypt(wallet.privateKey);

// 3. DB에 저장
await supabase.from('wallets').insert({
  address: wallet.address,
  encrypted_private_key: encryptedPrivateKey
});

// 4. 사용자에게는 주소만 반환
return { address: wallet.address };
```

---

### 3. Biconomy 트랜잭션 실행

**Frontend 코드:**
```typescript
import { composeTransaction, executeTransaction } from '@/utils/biconomy/smartAccount';

// Step 1: Compose (거래 구성)
const composeResult = await composeTransaction({
  chainId: 8453, // Base
  from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  steps: [
    {
      type: 'transfer',
      token: 'KRWQ',
      to: '0x친구주소',
      amount: '10000'
    }
  ],
  gasPayment: {
    token: 'USDT',
    sponsor: false
  }
});

const { payload, quote } = composeResult;
console.log('가스비 견적:', quote);
// { gasCost: '0.5 USDT', estimatedTime: '~5 seconds' }


// Step 2: Sign & Execute (Backend에서 서명 및 실행)
const executeResult = await executeTransaction(
  'wallet_abc123',  // 지갑 ID (DB에서 private key 조회)
  payload           // Compose에서 받은 payload
);

console.log('트랜잭션 완료:', executeResult.txHash);
// 출력: 0x9876...5432
```

**Backend 처리 (자동):**
```typescript
// Compose API 호출
POST /api/biconomy/compose
→ Biconomy API에 전달
→ Payload 생성하여 반환

// Sign & Execute API 호출
POST /api/biconomy/sign-and-execute
→ 1. DB에서 wallet_id로 encrypted_private_key 조회
→ 2. Private Key 복호화
→ 3. ethers.js로 payload 서명
→ 4. Biconomy API에 Execute 요청
→ 5. 트랜잭션 해시 반환
```

---

## 🔐 보안 특징

### ✅ CORS 문제 해결
- Frontend는 절대 Biconomy API를 직접 호출하지 않음
- 모든 API 호출은 Backend를 통해 프록시됨

### ✅ API Key 보호
- `BICONOMY_API_KEY`는 Backend 환경 변수에만 존재
- Frontend에 절대 노출되지 않음

### ✅ Private Key 보호
- Private Key는 AES-256-GCM으로 암호화되어 DB에 저장
- 복호화는 Backend에서만 가능
- Frontend는 지갑 주소만 알 수 있음

### ✅ 서명 프로세스 보호
- 사용자는 직접 서명하지 않음
- Backend가 안전하게 서명 수행

---

## 📝 API 엔드포인트

### Backend API (Supabase Edge Function)

```typescript
// 1. 지갑 생성
POST /make-server-b6d5667f/api/wallet/create
Body: { user_id, coin_type, wallet_type }
Response: { wallet: { address, balance, ... } }

// 2. Compose
POST /make-server-b6d5667f/api/biconomy/compose
Body: { chainId, from, steps, gasPayment }
Response: { payload, quote }

// 3. Sign & Execute
POST /make-server-b6d5667f/api/biconomy/sign-and-execute
Body: { wallet_id, payload }
Response: { txHash }

// 4. Status
GET /make-server-b6d5667f/api/biconomy/status/:txHash
Response: { status, details }
```

---

## 🎯 실전 예제

### 예제 1: KRWQ 전송

```typescript
// 1. Compose
const { payload, quote } = await composeTransaction({
  chainId: 8453,
  from: userWalletAddress,
  steps: [{
    type: 'transfer',
    token: 'KRWQ',
    to: recipientAddress,
    amount: '10000'
  }],
  gasPayment: { token: 'USDT', sponsor: false }
});

// 2. 사용자에게 견적 보여주기
console.log(`가스비: ${quote.gasCost}`);
if (userConfirms) {
  // 3. Execute (Backend에서 자동 서명)
  const { txHash } = await executeTransaction(walletId, payload);
  console.log('완료:', txHash);
}
```

### 예제 2: 스왑 후 전송

```typescript
const { payload } = await composeTransaction({
  chainId: 8453,
  from: userWalletAddress,
  steps: [
    {
      type: 'swap',
      tokenIn: 'USDT',
      tokenOut: 'KRWQ',
      amountIn: '1000'
    },
    {
      type: 'transfer',
      token: 'KRWQ',
      to: recipientAddress,
      amount: 'MAX'
    }
  ],
  gasPayment: { token: 'USDT', sponsor: false }
});

const { txHash } = await executeTransaction(walletId, payload);
```

### 예제 3: 배치 전송 (에어드랍)

```typescript
const steps = recipients.map(r => ({
  type: 'transfer',
  token: 'KRWQ',
  to: r.address,
  amount: r.amount
}));

const { payload } = await composeTransaction({
  chainId: 8453,
  from: adminWalletAddress,
  steps,
  gasPayment: { sponsor: true } // 운영자가 가스비 부담
});

const { txHash } = await executeTransaction(adminWalletId, payload);
```

---

## 🔄 마이그레이션 체크리스트

- [ ] Supabase Edge Function 배포
- [ ] 환경 변수 설정 (`BICONOMY_API_KEY`, `WALLET_ENCRYPTION_KEY`)
- [ ] DB 마이그레이션 실행 (`add_encrypted_private_key.sql`)
- [ ] Frontend 코드 업데이트 (`composeTransaction`, `executeTransaction` 사용)
- [ ] 기존 지갑 재생성 (encrypted_private_key가 없는 경우)
- [ ] 테스트 실행

---

## ⚠️ 주의사항

1. **Production 환경 변수**
   - `WALLET_ENCRYPTION_KEY`는 최소 32자 이상의 강력한 키 사용
   - 절대 Git에 커밋하지 말 것

2. **기존 지갑 처리**
   - 기존에 생성된 가짜 지갑들은 `encrypted_private_key`가 NULL
   - 실제 사용 전에 새로 생성 필요

3. **Private Key 백업**
   - 암호화 키를 잃어버리면 복구 불가능
   - 안전한 곳에 백업 보관

4. **Rate Limiting**
   - Biconomy API에는 사용량 제한이 있음
   - Production에서는 적절한 Rate Limiting 구현 필요

---

## 📊 성능 최적화

```typescript
// Bad: Frontend에서 직접 호출 (CORS 에러, API 키 노출)
const response = await fetch('https://supertransaction.biconomy.io/api/v1/compose', {
  headers: { 'x-api-key': 'exposed-key-bad!' }
});

// Good: Backend 프록시 사용
const response = await fetch(`${BACKEND_URL}/api/biconomy/compose`, {
  // API 키는 Backend에만 존재
});
```

---

## 🎉 결론

이제 시스템은:
- ✅ 실제 EOA를 생성하고 안전하게 관리합니다
- ✅ Private Key는 Backend에서만 존재합니다
- ✅ CORS 문제가 없습니다
- ✅ API Key가 노출되지 않습니다
- ✅ Biconomy API를 안전하게 사용합니다

**다음 단계**: Guidelines.md의 예제들을 위 방식으로 구현하세요!
