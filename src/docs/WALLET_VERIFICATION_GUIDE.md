# 지갑 주소 검증 가이드

## ✅ 지갑 생성 로직 확인

### 1. Edge Function에서 실제 지갑 생성
```typescript
// /supabase/functions/server/wallet.tsx (98-114줄)

async function createWallet(): Promise<{ address: string; privateKey: string }> {
  // ethers.js v6를 사용한 실제 지갑 생성
  const { Wallet } = await import('npm:ethers@6.13.0');
  
  // ✅ 랜덤 지갑 생성 (secp256k1 + keccak256)
  const wallet = Wallet.createRandom();
  
  return {
    address: wallet.address,      // 0x... 형식의 실제 Ethereum 주소
    privateKey: wallet.privateKey  // Private Key (AES-256-GCM으로 암호화 후 저장)
  };
}
```

**주요 특징:**
- ✅ ethers.js v6의 `Wallet.createRandom()` 사용
- ✅ secp256k1 타원곡선 암호화
- ✅ keccak256 해시 함수로 주소 파생
- ✅ Private Key는 AES-256-GCM으로 암호화하여 DB 저장
- ✅ 생성된 주소는 Ethereum, BSC, Polygon, Base 등 모든 EVM 체인에서 사용 가능

---

## 🔍 생성된 주소가 진짜인지 확인하는 방법

### 방법 1: 블록체인 익스플로러에서 확인

#### Ethereum (Mainnet / Testnet)
1. 생성된 주소 복사 (예: `0x1234...abcd`)
2. https://etherscan.io 접속
3. 검색창에 주소 붙여넣기
4. **결과:**
   - 주소가 검색됨 → ✅ 유효한 Ethereum 주소
   - "Invalid Address" → ❌ 잘못된 주소

#### Base (Mainnet)
- https://basescan.org
- 동일한 방법으로 검색

#### Polygon
- https://polygonscan.com
- 동일한 방법으로 검색

#### BSC (Binance Smart Chain)
- https://bscscan.com
- 동일한 방법으로 검색

#### Tron (TRC-20)
- https://tronscan.org
- **주의:** Tron은 EVM 체인이 아니므로 다른 형식 (T로 시작)

---

### 방법 2: ethers.js로 주소 유효성 검증 (프론트엔드)

```typescript
import { ethers } from 'ethers';

// 주소 유효성 검증
function isValidEthereumAddress(address: string): boolean {
  try {
    // ethers.js의 isAddress 사용
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

// 체크섬 주소 변환
function getChecksumAddress(address: string): string {
  try {
    return ethers.getAddress(address);
  } catch (error) {
    throw new Error('Invalid address');
  }
}

// 사용 예시
const address = '0x1234567890123456789012345678901234567890';
console.log('유효한 주소:', isValidEthereumAddress(address));
console.log('체크섬 주소:', getChecksumAddress(address));
```

---

### 방법 3: Web3 Provider로 잔액 조회

```typescript
import { ethers } from 'ethers';

async function checkAddressOnChain(address: string, chainId: number) {
  try {
    // RPC Provider 설정
    const rpcUrls: Record<number, string> = {
      1: 'https://eth.llamarpc.com',           // Ethereum Mainnet
      8453: 'https://mainnet.base.org',        // Base Mainnet
      137: 'https://polygon-rpc.com',          // Polygon
      56: 'https://bsc-dataseed.binance.org'   // BSC
    };

    const provider = new ethers.JsonRpcProvider(rpcUrls[chainId]);
    
    // 1. 주소 유효성 검증
    if (!ethers.isAddress(address)) {
      throw new Error('Invalid address format');
    }

    // 2. 블록체인에서 잔액 조회 (잔액이 0이어도 주소는 유효함)
    const balance = await provider.getBalance(address);
    
    // 3. 트랜잭션 카운트 조회 (nonce)
    const txCount = await provider.getTransactionCount(address);
    
    console.log('✅ 주소 검증 성공:');
    console.log('- 주소:', address);
    console.log('- 잔액:', ethers.formatEther(balance), 'ETH');
    console.log('- 트랜잭션 수:', txCount);
    console.log('- 체인 ID:', chainId);
    
    return {
      isValid: true,
      balance: ethers.formatEther(balance),
      txCount,
      chainId
    };
  } catch (error: any) {
    console.error('❌ 주소 검증 실패:', error.message);
    return {
      isValid: false,
      error: error.message
    };
  }
}

// 사용 예시
const result = await checkAddressOnChain(
  '0x1234567890123456789012345678901234567890',
  8453  // Base Mainnet
);
```

---

### 방법 4: DB에서 Private Key 복호화 후 검증 (Backend Only)

```typescript
// ⚠️ 이 코드는 절대 프론트엔드에서 실행하지 마세요!
// Backend (Edge Function)에서만 실행

async function verifyWalletInDB(walletId: string) {
  // 1. DB에서 지갑 조회
  const { data: wallet } = await supabase
    .from('wallets')
    .select('address, encrypted_private_key')
    .eq('wallet_id', walletId)
    .single();

  if (!wallet) {
    throw new Error('Wallet not found');
  }

  // 2. Private Key 복호화
  const privateKey = await decryptPrivateKey(wallet.encrypted_private_key);

  // 3. Private Key로 주소 재생성
  const { Wallet } = await import('npm:ethers@6.13.0');
  const recoveredWallet = new Wallet(privateKey);

  // 4. 주소 비교
  if (recoveredWallet.address.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error('Address mismatch! Database corrupted!');
  }

  console.log('✅ 지갑 검증 성공:');
  console.log('- DB 주소:', wallet.address);
  console.log('- 재생성 주소:', recoveredWallet.address);
  console.log('- Private Key 복호화:', '성공');

  return {
    isValid: true,
    address: wallet.address
  };
}
```

---

## 📊 실제 생성된 지갑 확인 (현재 시스템)

### 사용자 지갑관리 페이지에서 확인

1. **관리자 로그인** → 사용자 지갑관리
2. **사용자 선택** (예: hong@example.com)
3. **지갑 정보 탭** 클릭
4. **코인 지갑 목록에서 주소 확인**
   - TRX: `0x1234...` (Ethereum 형식)
   - USDT: `0x5678...` (Ethereum 형식)
   - KRWQ: `0x9abc...` (Ethereum 형식)

5. **주소 복사 버튼 클릭**
6. **블록체인 익스플로러에서 검증**
   - https://basescan.org (Base 체인인 경우)
   - https://etherscan.io (Ethereum 체인인 경우)

---

## 🔐 보안 확인

### 1. Private Key는 절대 프론트엔드에 노출되지 않음
```typescript
// ✅ 안전: Private Key는 응답에 포함되지 않음
return c.json({
  success: true,
  wallet: {
    wallet_id: walletData.wallet_id,
    address: walletData.address,        // 주소만 반환
    coin_type: walletData.coin_type,
    wallet_type: walletData.wallet_type
    // ❌ privateKey는 절대 반환하지 않음!
  }
});
```

### 2. Private Key는 AES-256-GCM으로 암호화되어 DB 저장
```typescript
const encryptedPrivateKey = await encryptPrivateKey(privateKey);
// DB: encrypted_private_key 컬럼에 암호화된 데이터 저장
```

### 3. 복호화는 Backend (Edge Function)에서만 가능
- Frontend: 주소만 조회 가능
- Backend: Edge Function secret에 저장된 `WALLET_ENCRYPTION_KEY`로만 복호화 가능

---

## ⚠️ Tron (TRC-20) 주의사항

### Tron은 EVM 체인이 아닙니다!

현재 시스템은 **Ethereum 주소만 생성**합니다 (`0x...` 형식).

**Tron 네트워크 (TRC-20) 지갑을 생성하려면:**

1. **별도의 Tron 지갑 생성 로직 필요**
   - Tron 주소 형식: `T...` (Base58Check 인코딩)
   - 라이브러리: `tronweb` 사용

2. **현재 상태:**
   - ❌ Tron 지갑 생성 미구현
   - ✅ Ethereum 계열 (ETH, BSC, Polygon, Base) 지갑만 생성 가능

3. **TRX, USDT-TRC20 지원하려면:**
   ```typescript
   // /supabase/functions/server/wallet.tsx에 추가 필요
   
   async function createTronWallet() {
     const TronWeb = await import('npm:tronweb');
     const account = await TronWeb.utils.accounts.generateAccount();
     
     return {
       address: account.address.base58,  // T로 시작하는 주소
       privateKey: account.privateKey
     };
   }
   ```

---

## 📝 요약

### ✅ 현재 시스템은 진짜 블록체인 지갑을 생성합니다

| 항목 | 상태 | 설명 |
|------|------|------|
| Ethereum 주소 생성 | ✅ 완료 | ethers.js v6 사용 |
| Private Key 암호화 | ✅ 완료 | AES-256-GCM |
| DB 안전 저장 | ✅ 완료 | encrypted_private_key 컬럼 |
| EVM 호환 | ✅ 완료 | ETH, BSC, Polygon, Base 등 |
| Tron 지원 | ❌ 미구현 | 별도 구현 필요 |

### 🔍 검증 방법

1. **가장 쉬운 방법:** 블록체인 익스플로러에서 주소 검색
   - https://basescan.org
   - https://etherscan.io

2. **프로그래밍 방식:** ethers.js로 주소 유효성 검증
   ```typescript
   ethers.isAddress(address)
   ```

3. **완전한 검증:** RPC Provider로 잔액 조회
   ```typescript
   provider.getBalance(address)
   ```

---

## 🎯 결론

**TRX와 USDT 지갑이 생성되었다면 그것은 진짜 Ethereum 주소입니다!**

- ✅ 실제 블록체인에서 사용 가능
- ✅ 입출금 가능
- ✅ Private Key는 안전하게 암호화되어 저장됨
- ⚠️ 단, Tron 네트워크가 아닌 **Ethereum 계열 체인에서만** 사용 가능

**Tron (TRC-20) 지원이 필요하면 별도로 Tron 지갑 생성 로직을 추가해야 합니다.**
