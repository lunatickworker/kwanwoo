# API 사용 가이드

Guidelines.md의 5번 항목에 정의된 API 설계를 기반으로 구현되었습니다.

## 아키텍처

```
[프론트엔드] → [API Client] → [Supabase Edge Function] → [PostgreSQL Database]
```

## API 엔드포인트

### 1. Wallet API (지갑)

#### POST /api/wallet/create
새 지갑 주소 생성
```typescript
import { walletApi } from './utils/api/client';

const result = await walletApi.create('user-id', 'BTC', 'hot');
// Response: { success: true, wallet: {...} }
```

#### GET /api/wallet/balance
잔액 조회
```typescript
const result = await walletApi.getBalance('user-id', 'BTC');
// Response: { success: true, wallets: [...] }
```

### 2. Deposit API (입금)

#### POST /api/deposit/notify
입금 알림 (웹훅)
```typescript
import { depositApi } from './utils/api/client';

const result = await depositApi.notify({
  user_id: 'user-id',
  wallet_id: 'wallet-id',
  coin_type: 'BTC',
  amount: 0.5,
  tx_hash: 'transaction-hash',
  confirmations: 3,
  from_address: 'sender-address'
});
// Response: { success: true, deposit: {...} }
```

### 3. Withdrawal API (출금)

#### POST /api/withdrawal/request
출금 요청
```typescript
import { withdrawalApi } from './utils/api/client';

const result = await withdrawalApi.request({
  user_id: 'user-id',
  wallet_id: 'wallet-id',
  coin_type: 'BTC',
  amount: 0.1,
  to_address: 'recipient-address',
  fee: 0.0001
});
// Response: { success: true, withdrawal: {...} }
```

#### GET /api/withdrawal/status/:id
출금 상태 조회
```typescript
const result = await withdrawalApi.getStatus('withdrawal-id');
// Response: { success: true, withdrawal: {...} }
```

### 4. Transaction API (거래 내역)

#### GET /api/transactions/history
거래 내역 조회
```typescript
import { transactionApi } from './utils/api/client';

const result = await transactionApi.getHistory('user-id', 50, 0);
// Response: { success: true, transactions: [...], total: 100, limit: 50, offset: 0 }
```

### 5. Admin API (관리자 전용)

#### GET /api/admin/withdrawals/pending
대기 중인 출금 조회
```typescript
import { adminApi } from './utils/api/client';

const result = await adminApi.getPendingWithdrawals();
// Response: { success: true, withdrawals: [...] }
```

#### POST /api/admin/withdrawal/approve
출금 승인
```typescript
const result = await adminApi.approveWithdrawal(
  'withdrawal-id',
  'admin-user-id',
  'tx-hash' // optional
);
// Response: { success: true, withdrawal: {...} }
```

#### POST /api/admin/withdrawal/reject
출금 거부
```typescript
const result = await adminApi.rejectWithdrawal(
  'withdrawal-id',
  '잔액 부족'
);
// Response: { success: true, withdrawal: {...} }
```

#### GET /api/admin/users
모든 사용자 조회
```typescript
const result = await adminApi.getUsers();
// Response: { success: true, users: [...] }
```

#### GET /api/admin/security-logs
보안 로그 조회
```typescript
const result = await adminApi.getSecurityLogs('high', 100);
// Response: { success: true, logs: [...] }
```

#### GET /api/admin/dashboard/stats
대시보드 통계
```typescript
const result = await adminApi.getDashboardStats();
// Response: {
//   success: true,
//   stats: {
//     totalUsers: 100,
//     pendingWithdrawals: 5,
//     todayDeposits: [...],
//     todayWithdrawals: [...],
//     walletBalances: [...]
//   }
// }
```

## 사용 예시

### React 컴포넌트에서 사용

```typescript
import { useEffect, useState } from 'react';
import { adminApi } from './utils/api/client';

function WithdrawalManagement() {
  const [withdrawals, setWithdrawals] = useState([]);

  useEffect(() => {
    async function fetchWithdrawals() {
      try {
        const result = await adminApi.getPendingWithdrawals();
        if (result.success) {
          setWithdrawals(result.withdrawals);
        }
      } catch (error) {
        console.error('Failed to fetch withdrawals:', error);
      }
    }
    fetchWithdrawals();
  }, []);

  const handleApprove = async (withdrawalId: string) => {
    try {
      const result = await adminApi.approveWithdrawal(
        withdrawalId,
        'admin-123'
      );
      if (result.success) {
        // 승인 성공 처리
        alert('출금이 승인되었습니다.');
      }
    } catch (error) {
      console.error('Approval failed:', error);
    }
  };

  return (
    <div>
      {withdrawals.map(w => (
        <div key={w.withdrawal_id}>
          <p>{w.amount} {w.coin_type}</p>
          <button onClick={() => handleApprove(w.withdrawal_id)}>
            승인
          </button>
        </div>
      ))}
    </div>
  );
}
```

## 에러 처리

모든 API 함수는 에러가 발생하면 throw하므로 try-catch로 처리해야 합니다:

```typescript
try {
  const result = await adminApi.getDashboardStats();
  console.log(result);
} catch (error) {
  console.error('API Error:', error.message);
  // 사용자에게 에러 메시지 표시
}
```

## 인증

API 요청 시 자동으로 Supabase Anon Key가 Authorization 헤더에 포함됩니다.

## 주의사항

1. **보안**: 민감한 작업(출금 승인 등)은 반드시 서버 측에서 추가 인증을 구현해야 합니다.
2. **에러 처리**: 모든 API 호출은 try-catch로 감싸서 에러를 처리하세요.
3. **로딩 상태**: API 호출 중에는 로딩 인디케이터를 표시하세요.
4. **재시도 로직**: 네트워크 오류 시 재시도 로직을 구현하는 것을 권장합니다.
