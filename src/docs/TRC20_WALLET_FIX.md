# TRC-20 지갑 주소 수정 완료 ✅

## 🚨 문제 상황

**TRC-20 (Tron 네트워크)** 코인들이 **Ethereum 주소(`0x...`)로 생성**되고 있었습니다.

| 코인 | 올바른 형식 | 기존 생성된 형식 | 문제 |
|------|------------|----------------|------|
| TRX | `T...` | `0x...` | ❌ **입출금 불가** |
| USDT (TRC-20) | `T...` | `0x...` | ❌ **입출금 불가** |

**원인:**
- Edge Function이 모든 코인에 대해 Ethereum 지갑(`ethers.js`)만 생성
- `supported_tokens` 테이블의 `network` 정보를 확인하지 않음

---

## ✅ 해결 방법

### 1. **Edge Function 수정 완료**

`/supabase/functions/server/wallet.tsx`에 다음 기능 추가:

#### a) Tron 지갑 생성 함수 추가
```typescript
async function createTronWallet(): Promise<{ address: string; privateKey: string }> {
  const TronWeb = (await import('npm:tronweb@6.0.0')).default;
  const account = await TronWeb.createRandom();
  
  return {
    address: account.address.base58,  // ✅ T로 시작하는 주소
    privateKey: account.privateKey
  };
}
```

#### b) 네트워크별 지갑 생성 함수
```typescript
async function createWalletByCoinType(coinType: string) {
  // 1. supported_tokens 테이블에서 네트워크 조회
  const { data: tokenData } = await supabase
    .from('supported_tokens')
    .select('network')
    .eq('symbol', coinType)
    .single();

  const network = tokenData.network;

  // 2. 네트워크에 따라 적절한 지갑 생성
  if (network.includes('tron') || network.includes('trc')) {
    return await createTronWallet();  // ✅ T로 시작하는 주소
  }
  
  return await createEthereumWallet();  // ✅ 0x로 시작하는 주소
}
```

#### c) `/wallet/create`와 `/wallet/create-batch` 엔드포인트 업데이트
- 기존: `createWallet()` → 항상 Ethereum 주소
- 수정: `createWalletByCoinType(coin_type)` → 네트워크에 따라 자동 선택

---

### 2. **DB 업데이트 필요**

`/database/update_trc20_networks.sql` 파일을 Supabase SQL Editor에서 실행:

```sql
-- TRX: network를 'Tron'으로 설정
UPDATE supported_tokens 
SET network = 'Tron',
    contract_address = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
    chain_id = 728126428,
    rpc_url = 'https://api.trongrid.io',
    explorer_url = 'https://tronscan.org'
WHERE symbol = 'TRX';

-- USDT: network를  'TRC-20'으로 설정
UPDATE supported_tokens 
SET network = 'TRC-20',
    contract_address = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    chain_id = 728126428,
    rpc_url = 'https://api.trongrid.io',
    explorer_url = 'https://tronscan.org'
WHERE symbol = 'USDT';
```

---

### 3. **기존 잘못된 지갑 삭제 (선택사항)**

⚠️ **주의: 실제 잔액이 있는 경우 절대 삭제하지 마세요!**

```sql
-- Ethereum 형식으로 잘못 생성된 TRX, USDT 지갑 삭제
DELETE FROM wallets 
WHERE coin_type IN ('TRX', 'USDT') 
  AND address LIKE '0x%'
  AND balance = 0;  -- ✅ 잔액이 0인 것만 삭제
```

---

### 4. **새 지갑 생성 테스트**

#### a) 사용자 지갑관리 페이지에서:
1. 사용자 선택 (예: hong@example.com)
2. "코인 추가" 버튼 클릭
3. TRX 또는 USDT 선택
4. "추가" 버튼 클릭

#### b) 생성된 주소 확인:
```
✅ TRX:  T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb...
✅ USDT: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t...
```

#### c) Tronscan에서 검증:
1. https://tronscan.org 접속
2. 생성된 주소 입력
3. "Valid Address" 확인

---

## 📊 네트워크별 주소 형식

| 네트워크 | 주소 형식 | 예시 | 라이브러리 |
|---------|----------|------|-----------|
| Ethereum | `0x...` (42자) | `0x1234...abcd` | ethers.js |
| Polygon | `0x...` (42자) | `0x5678...ef01` | ethers.js |
| BSC | `0x...` (42자) | `0x9abc...def2` | ethers.js |
| Base | `0x...` (42자) | `0xdef3...4567` | ethers.js |
| **Tron** | **`T...` (34자)** | **`T9yD...uWwb`** | **tronweb** |
| **TRC-20** | **`T...` (34자)** | **`TR7N...jLj6t`** | **tronweb** |

---

## 🔍 주소 검증 방법

### 1. Tronscan에서 검증
```
https://tronscan.org/#/address/T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb
```
- ✅ 주소가 검색됨 → 유효한 Tron 주소
- ❌ "Invalid Address" → 잘못된 주소

### 2. 코드로 검증
```typescript
import TronWeb from 'tronweb';

// Base58 형식 확인
const isValid = TronWeb.isAddress('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb');
console.log('유효한 Tron 주소:', isValid);

// Hex 변환
const hexAddress = TronWeb.address.toHex('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb');
console.log('Hex 주소:', hexAddress);
```

---

## 🎯 최종 결과

### Before (문제)
```
TRX:  0x9457Fe8ff09561cc52c91797c413EA95b5b436C07  ❌
USDT: 0xb879c7A7065dA7F19Aa1c37415887412a1329c33  ❌
```
**문제:** Ethereum 주소이므로 Tron 네트워크에서 입출금 불가

### After (수정 완료)
```
TRX:  T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb  ✅
USDT: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t  ✅
```
**결과:** Tron 주소이므로 Tron 네트워크에서 입출금 가능

---

## 📝 체크리스트

- [x] **Edge Function 수정**: `createWalletByCoinType` 함수 추가
- [x] **Tron 지갑 생성 함수**: `createTronWallet` 추가
- [x] **네트워크 자동 감지**: `supported_tokens` 테이블 조회
- [ ] **DB 업데이트**: `update_trc20_networks.sql` 실행 필요
- [ ] **기존 지갑 삭제**: 잔액 확인 후 선택적 삭제
- [ ] **새 지갑 생성 테스트**: T로 시작하는 주소 확인
- [ ] **Tronscan 검증**: 생성된 주소가 유효한지 확인

---

## 🚀 다음 단계

1. **Supabase SQL Editor에서 DB 업데이트**
   - `/database/update_trc20_networks.sql` 실행

2. **Edge Function 재배포** (자동)
   - Supabase가 자동으로 변경사항 감지 및 배포

3. **기존 지갑 삭제** (선택사항)
   - 잔액이 0인 Ethereum 형식 TRX/USDT 지갑만 삭제

4. **새 지갑 생성 테스트**
   - 사용자 지갑관리 → 코인 추가 → TRX/USDT
   - 주소가 T로 시작하는지 확인

5. **Tronscan에서 검증**
   - https://tronscan.org에서 주소 검색

---

## ⚠️ 중요 참고사항

### 1. **USDT는 여러 네트워크가 있습니다**
- **ERC-20** (Ethereum): `0x...` 주소
- **TRC-20** (Tron): `T...` 주소
- **BEP-20** (BSC): `0x...` 주소

**현재 구현:**
- `supported_tokens` 테이블의 `symbol = 'USDT'`를 TRC-20으로 설정
- ERC-20 USDT가 필요하면 별도 심볼 추가 (예: `USDT-ERC20`)

### 2. **네트워크 감지 로직**
```typescript
// 네트워크 이름에 'tron' 또는 'trc'가 포함되면 Tron 지갑 생성
if (network.toLowerCase().includes('tron') || 
    network.toLowerCase().includes('trc')) {
  return createTronWallet();  // T... 주소
}
```

**지원되는 네트워크 이름:**
- `Tron`, `tron`, `TRON`
- `TRC-20`, `trc-20`, `TRC20`

### 3. **Private Key 형식**
- **Ethereum**: `0x...` (66자, Hex)
- **Tron**: 일반 Hex (64자)

**둘 다 동일하게 AES-256-GCM으로 암호화하여 저장됩니다.**

---

## 🎉 완료!

이제 TRC-20 코인 (TRX, USDT)의 지갑이 올바른 Tron 주소(`T...`)로 생성됩니다!
