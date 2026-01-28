# 🔥❄️ Hot Wallet vs Cold Wallet 관리 가이드

## 개념 정리

### 🔥 Hot Wallet (핫 월렛)
- **정의**: 인터넷에 연결된 온라인 지갑
- **용도**: 일상적인 거래, 빠른 입출금
- **장점**: 즉시 사용 가능, 편리함
- **단점**: 해킹 위험 존재
- **권장 보유량**: 일일 거래량의 2-3배

### ❄️ Cold Wallet (콜드 월렛)
- **정의**: 인터넷과 분리된 오프라인 지갑
- **용도**: 장기 보관, 대량 자산 보관
- **장점**: 해킹으로부터 안전
- **단점**: 사용이 불편, 전송 시간 소요
- **권장 보유량**: 전체 자산의 70-80%

---

## 데이터베이스 설정

### 1. wallets 테이블에 wallet_type 컬럼 추가

```sql
-- wallet_type 컬럼 추가 (hot 또는 cold)
ALTER TABLE wallets
ADD COLUMN wallet_type TEXT DEFAULT 'hot' CHECK (wallet_type IN ('hot', 'cold'));

-- 기존 데이터 업데이트 (선택사항)
UPDATE wallets
SET wallet_type = 'hot'
WHERE wallet_type IS NULL;
```

### 2. 인덱스 추가 (성능 최적화)

```sql
-- user_id + wallet_type 복합 인덱스
CREATE INDEX idx_wallets_user_wallet_type ON wallets(user_id, wallet_type);

-- coin_type + wallet_type 복합 인덱스
CREATE INDEX idx_wallets_coin_wallet_type ON wallets(coin_type, wallet_type);
```

---

## 관리 전략

### 💰 자산 배분 전략

```
총 자산: 100억 원

Hot Wallet (30억):
- KRWQ: 20억 (일일 거래용)
- USDT: 5억 (가스비 및 스왑용)
- ETH: 5억 (이더리움 네트워크 가스비)

Cold Wallet (70억):
- KRWQ: 50억 (장기 보관)
- BTC: 10억 (비트코인 예비)
- ETH: 10억 (이더리움 예비)
```

### 🔄 Hot → Cold 이동 시나리오

**언제 이동하나요?**
1. Hot Wallet 잔액이 일일 거래량의 5배 이상일 때
2. 장기 보관이 필요한 자산일 때
3. 보안 위협이 감지되었을 때

**이동 절차:**
```typescript
// 1. Cold Wallet 생성 (오프라인)
// 2. Hot Wallet에서 Cold Wallet로 전송
// 3. 트랜잭션 확인 (충분한 컨펌 대기)
// 4. DB 업데이트

const moveToCold = async (amount: number, coinType: string) => {
  // Hot Wallet에서 차감
  await supabase
    .from('wallets')
    .update({ balance: hotBalance - amount })
    .eq('wallet_type', 'hot')
    .eq('coin_type', coinType);

  // Cold Wallet에 추가
  await supabase
    .from('wallets')
    .update({ balance: coldBalance + amount })
    .eq('wallet_type', 'cold')
    .eq('coin_type', coinType);
};
```

### 🔄 Cold → Hot 이동 시나리오

**언제 이동하나요?**
1. Hot Wallet 잔액이 일일 거래량의 1배 미만일 때
2. 대량 출금 요청이 예정되어 있을 때
3. 긴급 유동성이 필요할 때

**이동 절차:**
```typescript
// Cold Wallet은 오프라인이므로 수동 프로세스 필요
// 1. Cold Wallet을 온라인에 연결 (보안 환경)
// 2. 필요한 만큼만 Hot Wallet로 전송
// 3. 즉시 Cold Wallet을 오프라인으로 전환
// 4. DB 업데이트
```

---

## 보안 체크리스트

### ✅ Hot Wallet 보안
- [ ] Multi-signature 설정 (2/3 이상)
- [ ] IP 화이트리스트 설정
- [ ] 일일 출금 한도 설정
- [ ] 실시간 모니터링 활성화
- [ ] 2FA (Two-Factor Authentication) 활성화

### ✅ Cold Wallet 보안
- [ ] 하드웨어 지갑 사용 (Ledger, Trezor 등)
- [ ] Private Key 백업 (3곳 이상, 분산 보관)
- [ ] 정기적인 지갑 테스트 (소액 전송 테스트)
- [ ] 물리적 보안 (금고, 은행 안전 금고 등)
- [ ] 접근 권한 최소화 (CEO, CTO만)

---

## 모니터링 및 알림

### 📊 모니터링 지표

```typescript
// 1. Hot Wallet 비율 모니터링
const hotRatio = hotWalletTotal / (hotWalletTotal + coldWalletTotal);

if (hotRatio > 0.4) {
  alert('Hot Wallet 비율이 40%를 초과했습니다. Cold Wallet으로 이동하세요.');
}

if (hotRatio < 0.1) {
  alert('Hot Wallet 비율이 10% 미만입니다. 유동성을 확보하세요.');
}

// 2. 일일 거래량 대비 Hot Wallet 잔액
const dailyTxVolume = await getDailyTransactionVolume();
const hotBalance = await getHotWalletBalance();

if (hotBalance < dailyTxVolume * 2) {
  alert('Hot Wallet 잔액이 일일 거래량의 2배 미만입니다.');
}
```

### 🔔 알림 설정

```sql
-- Hot Wallet 잔액 부족 알림
CREATE OR REPLACE FUNCTION notify_low_hot_wallet()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.wallet_type = 'hot' AND NEW.balance < 1000000 THEN
    PERFORM pg_notify(
      'low_hot_wallet',
      json_build_object(
        'coin_type', NEW.coin_type,
        'balance', NEW.balance,
        'wallet_id', NEW.wallet_id
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hot_wallet_balance_check
  AFTER UPDATE ON wallets
  FOR EACH ROW
  EXECUTE FUNCTION notify_low_hot_wallet();
```

---

## FAQ

### Q1. Hot Wallet과 Cold Wallet을 어떻게 구분하나요?
A: `wallet_type` 컬럼을 사용합니다. 'hot'은 온라인 지갑, 'cold'는 오프라인 지갑입니다.

### Q2. Cold Wallet에서 바로 사용자에게 전송할 수 있나요?
A: 불가능합니다. Cold Wallet은 오프라인이므로, 먼저 Hot Wallet로 이동한 후 사용자에게 전송해야 합니다.

### Q3. 관리자가 여러 명인데 각자 Hot/Cold Wallet을 가져야 하나요?
A: 아니요. 관리자는 공용 Hot/Cold Wallet을 사용하며, 권한 관리를 통해 접근을 제어합니다.

### Q4. Hot Wallet 비율은 얼마가 적절한가요?
A: 일반적으로 20-30%가 적절합니다. 거래량이 많으면 30-40%, 적으면 10-20%로 조정하세요.

### Q5. Cold Wallet을 자동으로 관리할 수 있나요?
A: Cold Wallet의 핵심은 오프라인 보관이므로, 자동화는 보안상 권장하지 않습니다. 수동으로 관리하세요.

---

## 실전 예제

### 시나리오 1: 대량 구매 요청 처리

```typescript
// 사용자가 1억 원 구매 요청
const purchaseAmount = 100000000;
const hotWalletBalance = await getHotWalletBalance('KRWQ');

if (hotWalletBalance < purchaseAmount) {
  // Hot Wallet 부족 → 관리자에게 알림
  await sendAdminAlert({
    type: 'insufficient_hot_wallet',
    required: purchaseAmount,
    available: hotWalletBalance,
    action: 'Cold Wallet에서 Hot Wallet로 이동 필요'
  });
  
  // 관리자 승인 대기
  return { status: 'pending', reason: 'Hot Wallet 잔액 부족' };
}

// 충분하면 즉시 처리
await processPurchase(purchaseAmount);
```

### 시나리오 2: 정기적인 Hot/Cold 밸런싱

```typescript
// 매일 자정 실행
async function dailyRebalance() {
  const totalBalance = await getTotalBalance('KRWQ');
  const hotBalance = await getHotWalletBalance('KRWQ');
  const coldBalance = await getColdWalletBalance('KRWQ');
  
  const targetHotRatio = 0.3; // 30%
  const targetHotBalance = totalBalance * targetHotRatio;
  
  if (hotBalance > targetHotBalance * 1.5) {
    // Hot → Cold 이동
    const moveAmount = hotBalance - targetHotBalance;
    await moveToCold(moveAmount, 'KRWQ');
    console.log(`${moveAmount} KRWQ를 Cold Wallet으로 이동했습니다.`);
  }
  
  if (hotBalance < targetHotBalance * 0.5) {
    // Cold → Hot 이동 필요 (관리자 알림)
    const moveAmount = targetHotBalance - hotBalance;
    await sendAdminAlert({
      type: 'rebalance_required',
      action: 'Cold Wallet에서 Hot Wallet로 이동 필요',
      amount: moveAmount
    });
  }
}
```

---

## 요약

✅ **Hot Wallet**: 일상적인 거래용 (20-30%)
✅ **Cold Wallet**: 장기 보관용 (70-80%)
✅ **모니터링**: 비율 확인, 잔액 부족 알림
✅ **보안**: Hot은 Multi-sig, Cold는 하드웨어 지갑
✅ **밸런싱**: 정기적으로 Hot/Cold 비율 조정

---

**작성일**: 2025-01-20
**작성자**: Admin Team
**버전**: 1.0
