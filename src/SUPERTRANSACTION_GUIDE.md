# Biconomy Supertransaction 통합 가이드

## 🎯 개요

이 프로젝트는 Biconomy Supertransaction API를 활용하여 암호화폐 입출금 관리 시스템에 다음 기능을 추가합니다:

- ✅ **가스 추상화**: USDT, USDC 등 ERC-20 토큰으로 가스비 지불
- ✅ **최적 경로**: 자동으로 최적의 DEX와 브릿지 선택
- ✅ **빠른 실행**: Compose → Sign → Execute 3단계 프로세스
- ✅ **실시간 모니터링**: 관리자 대시보드에서 모든 트랜잭션 추적

## 📁 프로젝트 구조

```
/
├── user/                          # 사용자 페이지 (모바일 최적화)
│   ├── components/
│   │   ├── Withdrawal.tsx         # ⚡ Supertransaction 출금
│   │   ├── Swap.tsx              # ⚡ Supertransaction 스왑
│   │   └── ...
│   └── App.tsx
│
├── components/                    # 관리자 페이지
│   ├── AdminApp.tsx
│   ├── SupertransactionMonitor.tsx # ⚡ NEW: Supertransaction 모니터
│   ├── Sidebar.tsx
│   └── ...
│
├── hooks/
│   └── useSupertransaction.ts     # ⚡ Supertransaction Hook
│
├── utils/
│   └── biconomy/
│       └── supertransaction.ts    # ⚡ Supertransaction API 유틸리티
│
├── database/
│   └── supertransaction_migration.sql  # DB 마이그레이션
│
└── guidelines/
    ├── Guidelines.md              # Biconomy Supertransaction API 완벽 가이드
    └── env.md                     # 환경 변수 설정
```

## 🚀 시작하기

### 1. 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 추가하세요:

```env
# Supabase
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Biconomy Supertransaction API
VITE_BICONOMY_SUPERTRANSACTION_API_KEY=your_api_key_here

# 기본 설정
VITE_DEFAULT_CHAIN_ID=8453  # Base Chain
VITE_GAS_SPONSORSHIP_ENABLED=false
```

### 2. API Key 발급

1. [Biconomy Supertransaction](https://supertransaction.biconomy.io) 방문
2. "Get API Key" 클릭
3. 이메일로 즉시 발급 (무료!)
4. API Key를 `.env` 파일에 추가

### 3. 데이터베이스 마이그레이션

```bash
# Supabase SQL Editor에서 실행
psql < database/supertransaction_migration.sql
```

또는 Supabase Dashboard → SQL Editor → New Query → 파일 내용 붙여넣기 → Run

### 4. 의존성 설치

```bash
npm install ethers jsqr
```

## 💡 사용 방법

### 사용자: 출금하기 (Supertransaction)

1. **출금 페이지 접속**
   - 사용자 앱에서 "출금" 선택
   - 코인 선택 (BTC, ETH, USDT, USDC, BNB)

2. **Supertransaction 활성화**
   - "Supertransaction" 토글 ON
   - 가스비 지불 토큰 선택 (USDT, USDC, ETH)

3. **출금 정보 입력**
   - 받는 주소 입력 (또는 QR 스캔)
   - 출금 수량 입력
   - 자동으로 가스비 견적 조회

4. **실행**
   - "⚡ Supertransaction 출금" 버튼 클릭
   - MetaMask에서 서명 1회
   - 완료! (일반 출금보다 70% 빠름)

### 사용자: 스왑하기 (Supertransaction)

1. **스왑 페이지 접속**
   - "Swap" 메뉴 선택

2. **Supertransaction 활성화**
   - "Supertransaction Swap" 토글 ON
   - 가스비 토큰 선택

3. **스왑 정보 입력**
   - 보내는 코인 & 받는 코인 선택
   - 수량 입력
   - 자동으로 최적 DEX 경로 조회

4. **실행**
   - "⚡ Supertransaction Swap" 버튼 클릭
   - 자동으로 최저 가격으로 스왑 완료

### 관리자: 모니터링

1. **Admin Panel 접속**
   - `/admin` 경로로 이동
   - 관리자 계정으로 로그인

2. **Supertransaction 메뉴**
   - Sidebar에서 "⚡ Supertransaction" 클릭
   - NEW 배지가 표시됨

3. **대시보드 확인**
   - 전체 트랜잭션 통계
   - Supertransaction 채택률
   - 완료/진행중/실패 현황

4. **필터링**
   - 방식: 전체/Supertransaction/일반
   - 상태: pending/processing/completed/failed

5. **상세 조회**
   - 각 트랜잭션의 👁️ 아이콘 클릭
   - TX Hash, 가스비, 실시간 상태 확인
   - Compose → Sign → Execute 진행 단계 표시

## 🔧 기술 세부사항

### Compose → Sign → Execute 프로세스

```typescript
// 1. Compose: 트랜잭션 구성
const { payload, quote } = await composeTransaction({
  chainId: 8453, // Base
  from: userAddress,
  steps: [
    {
      type: 'transfer',
      token: 'USDT',
      to: recipientAddress,
      amount: '100'
    }
  ],
  gasPayment: {
    token: 'USDT',
    sponsor: false
  }
});

// 2. Sign: 사용자 서명 (MetaMask)
const signature = await signer.signMessage(JSON.stringify(payload));

// 3. Execute: 블록체인 실행
const { txHash } = await executeTransaction({
  payload,
  signature
});
```

### Hook 사용법

```typescript
import { useSupertransaction } from '@/hooks/useSupertransaction';

function MyComponent() {
  const { transfer, isLoading, currentStep, quote } = useSupertransaction();

  const handleTransfer = async () => {
    try {
      const result = await transfer({
        chainId: 8453,
        from: userAddress,
        to: recipientAddress,
        token: 'USDT',
        amount: '100',
        signer,
        gasToken: 'USDT',
        sponsor: false
      });
      
      console.log('TX Hash:', result.txHash);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div>
      {isLoading && <p>진행 중: {currentStep}</p>}
      {quote && <p>가스비: {quote.gasCost}</p>}
      <button onClick={handleTransfer}>전송</button>
    </div>
  );
}
```

## 📊 데이터베이스 스키마

### withdrawals 테이블 (업데이트)

```sql
ALTER TABLE withdrawals 
ADD COLUMN method VARCHAR(20) DEFAULT 'standard',  -- 'supertransaction' | 'standard'
ADD COLUMN gas_token VARCHAR(10),                  -- 'USDT' | 'USDC' | 'ETH'
ADD COLUMN gas_cost VARCHAR(50),                   -- '0.5 USDT'
ADD COLUMN super_payload JSONB,                    -- Compose payload
ADD COLUMN super_status VARCHAR(20);               -- 'composing' | 'signing' | 'executing'
```

### coin_swaps 테이블 (업데이트)

```sql
ALTER TABLE coin_swaps 
ADD COLUMN method VARCHAR(20) DEFAULT 'standard',
ADD COLUMN gas_token VARCHAR(10),
ADD COLUMN gas_cost VARCHAR(50),
ADD COLUMN super_payload JSONB,
ADD COLUMN super_status VARCHAR(20);
```

### supertransaction_logs (NEW)

```sql
CREATE TABLE supertransaction_logs (
  id UUID PRIMARY KEY,
  user_id UUID,
  transaction_type VARCHAR(20),  -- 'withdrawal' | 'swap' | 'transfer'
  tx_hash VARCHAR(100),
  step VARCHAR(20),              -- 'compose' | 'sign' | 'execute'
  status VARCHAR(20),            -- 'pending' | 'completed' | 'failed'
  payload JSONB,
  gas_token VARCHAR(10),
  gas_cost VARCHAR(50),
  execution_time INTEGER,        -- 밀리초
  created_at TIMESTAMP
);
```

## 🎨 사용자 경험 (UX) 최적화

### 1. 실시간 진행 상태

```
⚡ Supertransaction 진행 중...

✅ 1. Compose (트랜잭션 구성)
🔄 2. Sign (사용자 서명)
⏳ 3. Execute (실행)
```

### 2. 가스비 견적 표시

```
💡 Supertransaction 견적
예상 가스비: 0.5 USDT
예상 처리 시간: ~5 seconds
```

### 3. 토글 UI

```
⚡ Supertransaction     [ON]
✅ 가스비를 USDT로 지불 | 빠른 처리 | 최적 경로
```

## 🔐 보안

### 서명 검증

- Merkle Tree를 사용한 단일 해시 서명
- 모든 작업이 하나의 서명으로 승인됨
- Nonce & Expiry로 재사용 방지

### 환경 변수 보호

```typescript
// ❌ 클라이언트 노출 금지
const API_KEY = process.env.BICONOMY_API_KEY;

// ✅ 서버 사이드에서만 사용
// 또는 Vite 환경 변수 사용
const API_KEY = import.meta.env.VITE_BICONOMY_SUPERTRANSACTION_API_KEY;
```

## 📈 비용 및 성능

### Biconomy API 사용료

```
Free Tier:
- 월 1,000 트랜잭션
- 모든 기능 사용 가능
- 커뮤니티 지원

Pro Tier ($99/월):
- 월 50,000 트랜잭션
- 우선 지원
- 분석 대시보드
```

### 성능 비교

| 항목 | 일반 방식 | Supertransaction |
|------|----------|------------------|
| 처리 시간 | ~30초 | ~5초 (70% 빠름) |
| 서명 횟수 | 2-3회 | 1회 |
| 가스비 | ETH 필수 | USDT/USDC 가능 |
| 최적화 | 수동 | 자동 |

## 🐛 디버깅

### 에러 처리

```typescript
try {
  await transfer(...);
} catch (error: any) {
  if (error.code === 'INSUFFICIENT_BALANCE') {
    console.error('잔액 부족:', error.details);
  }
  
  if (error.code === 'SLIPPAGE_EXCEEDED') {
    console.error('슬리피지 초과');
  }
  
  if (error.code === 'USER_REJECTED') {
    console.error('사용자 서명 거부');
  }
}
```

### 로그 확인

```sql
-- Supertransaction 로그 조회
SELECT * FROM supertransaction_logs
WHERE user_id = 'xxx'
ORDER BY created_at DESC
LIMIT 10;

-- 실패한 트랜잭션만
SELECT * FROM supertransaction_logs
WHERE status = 'failed'
ORDER BY created_at DESC;
```

## 🚀 다음 단계

1. **P2P 전송 기능 추가**
   - 사용자 간 직접 송금
   - 배치 전송 (에어드랍)

2. **크로스체인 기능**
   - Polygon → Base 브릿징
   - 멀티체인 지갑 관리

3. **가스비 스폰서십**
   - 관리자가 가스비 부담
   - 조건부 스폰서십 (VIP 사용자)

4. **분석 대시보드**
   - 가스비 절감 통계
   - 사용자별 Supertransaction 채택률
   - 체인별 성능 비교

## 📚 참고 자료

- [Biconomy Supertransaction API 문서](https://docs.biconomy.io/supertransaction-api)
- [Guidelines.md](/guidelines/Guidelines.md) - 완벽 가이드
- [Biconomy Discord](https://discord.gg/biconomy)
- [GitHub Issues](https://github.com/bcnmy)

## 💬 지원

문제가 발생하거나 질문이 있으시면:

1. GitHub Issues 등록
2. Discord 커뮤니티 참여
3. support@biconomy.io 이메일

---

**Made with ⚡ by Biconomy Supertransaction API**
