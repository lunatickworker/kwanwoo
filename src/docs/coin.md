# P2P 프로젝트 코인 지갑 시스템 완전 분석

## 📊 현재 프로젝트 상태 (정확한 분석)

### ⚠️ 중요: 현재 구현 상태

| 구성 요소 | 구현 상태 | 상세 |
|-----------|----------|------|
| 데이터베이스 스키마 | ✅ 완료 | `wallets`, `supported_tokens` 테이블 구축됨 |
| UI 컴포넌트 | ✅ 완료 | 사용자 & 지갑 관리, 코인 관리 화면 있음 |
| 지갑 생성 기능 | ⚠️ **하드코딩** | **랜덤 16진수 문자열로 가짜 주소 생성** |
| Private Key 생성 | ❌ 없음 | ethers.js 사용하지 않음 |
| Private Key 저장 | ❌ 없음 | encrypted_private_key 컬럼 비어있음 |
| 입출금 처리 | ⚠️ 부분 구현 | Supertransaction 호출 있으나 테스트 필요 |
| Biconomy 통합 | ✅ 구현됨 | 입출금 관리에서 Supertransaction API 사용 |

---

## 목차
1. [현재 구현된 것 (정확한 분석)](#1-현재-구현된-것-정확한-분석)
2. [문제점: 하드코딩된 지갑 생성](#2-문제점-하드코딩된-지갑-생성)
3. [올바른 지갑 생성 로직 구현](#3-올바른-지갑-생성-로직-구현)
4. [네트워크 추가와 코인 입출금](#4-네트워크-추가와-코인-입출금)
5. [Biconomy 가스비 지원 (현재 상태)](#5-biconomy-가스비-지원-현재-상태)
6. [다른 코인의 가스비 지원 방법](#6-다른-코인의-가스비-지원-방법)
7. [수정 로드맵](#7-수정-로드맵)

---

## 1. 현재 구현된 것 (정확한 분석)

### 1.1 사용자 지갑 관리 (`UserWalletManagement.tsx`)

#### ✅ 기능
- 관리자가 사용자에게 코인 지갑 추가 가능
- `supported_tokens` 테이블에서 활성화된 코인 목록 조회
- 사용자가 이미 보유한 코인 제외하고 추가 가능

#### ⚠️ **문제: 하드코딩된 주소 생성**

```typescript
// /components/UserWalletManagement.tsx (534-544줄)

const handleConfirmAddCoins = async () => {
  if (!selectedUser || selectedCoins.length === 0) return;
  
  setIsAddingCoins(true);

  try {
    for (const coinType of selectedCoins) {
      // ❌ 문제: 랜덤 16진수 문자열로 가짜 주소 생성
      const address = '0x' + Array.from({ length: 40 }, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('');

      // ❌ Private Key 없이 DB에 바로 저장
      await supabase.from('wallets').insert({
        user_id: selectedUser.user_id,
        coin_type: coinType,
        address: address,
        balance: 0,
        wallet_type: 'hot'
        // encrypted_private_key가 없음!
      });
    }

    toast.success(`${selectedCoins.length}개의 코인 지갑이 추가되었습니다`);
    setShowAddCoinModal(false);
    await fetchUserWallets(selectedUser.user_id);
  } catch (error) {
    toast.error('코인 추가 실패');
    console.error(error);
  } finally {
    setIsAddingCoins(false);
  }
};
```

**이 코드의 문제점:**
1. ❌ **실제 블록체인 주소가 아님** - 그냥 랜덤 문자열
2. ❌ **Private Key가 없음** - 트랜잭션 서명 불가능
3. ❌ **입금 불가능** - 실제 주소가 아니므로 블록체인에서 찾을 수 없음
4. ❌ **출금 불가능** - Private Key가 없어 서명 불가능

### 1.2 입출금 관리 (`DepositWithdrawalManagement.tsx`)

#### ✅ Biconomy Supertransaction 통합됨

```typescript
// /components/DepositWithdrawalManagement.tsx (328-344줄)

const transferResponse = await fetch(backendUrl, {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
  },
  body: JSON.stringify({
    chainId: coinData.chain_id,
    from: adminWalletData.address,      // 관리자 지갑
    to: userWalletData.address,         // 사용자 지갑
    token: request.coin_type,
    amount: request.amount.toString(),
    gasPayment: {
      sponsor: true  // ✅ 관리자가 가스비 스폰서
    }
  })
});
```

**현재 상태:**
- ✅ Biconomy Supertransaction API 호출 구현됨
- ✅ 관리자가 사용자에게 코인 전송 기능 있음
- ⚠️ **하지만 사용자 주소가 가짜이므로 실제로 작동하지 않음**

### 1.3 코인 관리 (`CoinManagement.tsx`)

#### ✅ 기능
- `supported_tokens` 테이블 CRUD
- 새 네트워크/코인 추가 가능
- 코인 활성화/비활성화

**이 부분은 정상 작동함.**

---

## 2. 문제점: 하드코딩된 지갑 생성

### 2.1 현재 프로세스

```
관리자가 "코인 추가" 버튼 클릭
    ↓
supported_tokens에서 활성화된 코인 목록 조회
    ↓
사용자가 보유하지 않은 코인 선택
    ↓
❌ 랜덤 16진수 문자열 생성 (0x + 40자)
    ↓
wallets 테이블에 저장
    - address: 가짜 주소
    - encrypted_private_key: NULL ❌
    - balance: 0
```

### 2.2 왜 작동하지 않는가?

#### 가짜 주소의 문제
```typescript
// 현재 생성 방식
const address = '0x' + Array.from({ length: 40 }, () => 
  Math.floor(Math.random() * 16).toString(16)
).join('');

// 결과: 0xa3f5c8d2... (랜덤 문자열)
```

이 주소는:
- ❌ **블록체인에 존재하지 않음**
- ❌ **Private Key와 연결되지 않음**
- ❌ **체크섬(EIP-55)을 통과하지 못할 수 있음**
- ❌ **입금해도 자산을 잃어버림** (Private Key가 없어 회수 불가능)

#### 실제 지갑 생성 방식 (ethers.js)
```typescript
import { ethers } from 'ethers';

// 1. 새 지갑 생성
const wallet = ethers.Wallet.createRandom();

// 2. Private Key 추출
const privateKey = wallet.privateKey;  // 0x... (64자 hex)

// 3. Public Address 파생 (ECDSA secp256k1)
const address = wallet.address;  // 0x... (42자 hex, EIP-55 체크섬)

// 이 주소는 블록체인에서 유효하며, privateKey로 서명 가능
```

---

## 3. 올바른 지갑 생성 로직 구현

### 3.1 필요한 작업

현재 프론트엔드에서 직접 지갑을 생성하고 있으므로, **두 가지 선택지**가 있습니다:

#### Option 1: 프론트엔드에서 직접 생성 (간단, 보안 낮음)
- ethers.js를 프론트엔드에서 import
- 지갑 생성 후 Private Key를 암호화하여 DB 저장
- ⚠️ **Private Key가 클라이언트를 거치므로 위험**

#### Option 2: 백엔드로 위임 (권장, 보안 높음)
- Supabase Edge Function 생성
- 백엔드에서 지갑 생성 및 암호화
- Private Key가 클라이언트를 거치지 않음

### 3.2 Option 1: 프론트엔드 직접 생성 (빠른 수정)

#### 패키지 설치
```bash
npm install ethers
```

#### 수정된 코드
```typescript
// /components/UserWalletManagement.tsx

import { ethers } from 'ethers';
import { encryptData } from '../utils/encryption';

const handleConfirmAddCoins = async () => {
  if (!selectedUser || selectedCoins.length === 0) return;
  
  setIsAddingCoins(true);

  try {
    for (const coinType of selectedCoins) {
      // ✅ 실제 지갑 생성
      const wallet = ethers.Wallet.createRandom();
      const privateKey = wallet.privateKey;  // 0x...
      const address = wallet.address;        // 0x... (EIP-55 체크섬)

      // ✅ Private Key 암호화
      const encryptedPrivateKey = encryptData(privateKey, WALLET_SECRET_KEY);

      // ✅ DB 저장
      await supabase.from('wallets').insert({
        user_id: selectedUser.user_id,
        coin_type: coinType,
        address: address,
        encrypted_private_key: encryptedPrivateKey,  // ✅ 추가됨
        balance: 0,
        wallet_type: 'hot'
      });

      console.log(`✅ ${coinType} 지갑 생성 완료: ${address}`);
    }

    toast.success(`${selectedCoins.length}개의 코인 지갑이 생성되었습니다`);
    setShowAddCoinModal(false);
    await fetchUserWallets(selectedUser.user_id);
  } catch (error) {
    toast.error('지갑 생성 실패');
    console.error(error);
  } finally {
    setIsAddingCoins(false);
  }
};
```

#### 환경 변수 추가 (`.env`)
```env
VITE_WALLET_SECRET_KEY=your_32_byte_hex_key_here
```

#### 암호화 함수 업그레이드 (`/utils/encryption.ts`)

현재 XOR 암호화는 너무 약하므로, **Web Crypto API**를 사용:

```typescript
// /utils/encryption.ts

/**
 * AES-GCM 암호화 (브라우저 Web Crypto API 사용)
 */
export async function encryptDataSecure(data: string, secretKey: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    // 키 생성
    const keyBuffer = encoder.encode(secretKey.padEnd(32, '0').substring(0, 32));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    
    // IV 생성
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // 암호화
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      dataBuffer
    );
    
    // IV + 암호화된 데이터를 결합하여 Base64로 인코딩
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('데이터 암호화에 실패했습니다');
  }
}

/**
 * AES-GCM 복호화
 */
export async function decryptDataSecure(encryptedData: string, secretKey: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    // Base64 디코드
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    // IV와 암호화된 데이터 분리
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    // 키 생성
    const keyBuffer = encoder.encode(secretKey.padEnd(32, '0').substring(0, 32));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    
    // 복호화
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encrypted
    );
    
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('데이터 복호화에 실패했습니다');
  }
}
```

**장점:**
- 빠른 수정 가능
- ethers.js가 실제로 사용됨

**단점:**
- Private Key가 클라이언트를 거침 (보안 위험)
- 브라우저 개발자 도구에서 Private Key 노출 가능

### 3.3 Option 2: 백엔드로 위임 (권장)

#### Supabase Edge Function 생성

```bash
supabase functions new create-wallet
```

#### 코드 구현
```typescript
// supabase/functions/create-wallet/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@5.7.2";

serve(async (req) => {
  try {
    const { user_id, coin_type, wallet_type = 'hot' } = await req.json();

    // 1. 새 지갑 생성
    const wallet = ethers.Wallet.createRandom();
    const privateKey = wallet.privateKey;
    const address = wallet.address;

    // 2. Private Key 암호화 (AES-GCM)
    const encryptedPrivateKey = await encryptPrivateKey(privateKey);

    // 3. Supabase 클라이언트 생성
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 4. DB 저장
    const { data, error } = await supabase
      .from('wallets')
      .insert({
        user_id,
        coin_type,
        address,
        encrypted_private_key: encryptedPrivateKey,
        wallet_type,
        balance: 0,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ ${coin_type} 지갑 생성: ${address}`);

    // 5. 응답 (Private Key는 절대 반환하지 않음!)
    return new Response(
      JSON.stringify({ 
        success: true, 
        wallet_id: data.wallet_id,
        address: data.address,
        coin_type: data.coin_type
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('지갑 생성 실패:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// AES-256-GCM 암호화
async function encryptPrivateKey(privateKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(privateKey);
  
  const keyMaterial = encoder.encode(Deno.env.get("WALLET_ENCRYPTION_KEY")!);
  
  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    "AES-GCM",
    false,
    ["encrypt"]
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  
  return JSON.stringify({
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted))
  });
}
```

#### 프론트엔드 수정
```typescript
// /components/UserWalletManagement.tsx

const handleConfirmAddCoins = async () => {
  if (!selectedUser || selectedCoins.length === 0) return;
  
  setIsAddingCoins(true);

  try {
    for (const coinType of selectedCoins) {
      // ✅ 백엔드 Edge Function 호출
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/create-wallet`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            user_id: selectedUser.user_id,
            coin_type: coinType,
            wallet_type: 'hot'
          })
        }
      );

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error);
      }

      console.log(`✅ ${coinType} 지갑 생성 완료: ${result.address}`);
    }

    toast.success(`${selectedCoins.length}개의 코인 지갑이 생성되었습니다`);
    setShowAddCoinModal(false);
    await fetchUserWallets(selectedUser.user_id);
  } catch (error: any) {
    toast.error(`지갑 생성 실패: ${error.message}`);
    console.error(error);
  } finally {
    setIsAddingCoins(false);
  }
};
```

#### 배포
```bash
supabase functions deploy create-wallet
```

**장점:**
- ✅ **Private Key가 클라이언트를 거치지 않음**
- ✅ 높은 보안성
- ✅ 서버 사이드에서만 복호화 가능

**단점:**
- 백엔드 구축 필요
- 약간 더 복잡한 설정

---

## 4. 네트워크 추가와 코인 입출금

### 4.1 네트워크 추가 (현재 정상 작동)

#### CoinManagement 컴포넌트에서 추가
1. "코인 추가" 버튼 클릭
2. 필수 정보 입력:
   - Symbol (예: AVAX)
   - Name (예: Avalanche)
   - Network (예: Avalanche C-Chain)
   - Contract Address
   - Chain ID (예: 43114)
   - RPC URL
   - Explorer URL

#### 또는 SQL로 직접 추가
```sql
INSERT INTO supported_tokens (
    symbol, name, network, contract_address, 
    decimals, chain_id, rpc_url, explorer_url,
    min_deposit, min_withdrawal, withdrawal_fee, is_active
) VALUES
('AVAX', 'Avalanche', 'Avalanche C-Chain', '0x0000000000000000000000000000000000000000', 
 18, 43114, 'https://api.avax.network/ext/bc/C/rpc', 'https://snowtrace.io', 
 0.01, 0.01, 0.001, true);
```

### 4.2 EVM 호환 체인의 장점

**동일한 Private Key로 모든 EVM 체인에서 같은 주소 사용 가능:**

```typescript
const wallet = ethers.Wallet.createRandom();
const privateKey = wallet.privateKey;

// Ethereum
const ethProvider = new ethers.providers.JsonRpcProvider('https://eth.llamarpc.com');
const ethWallet = wallet.connect(ethProvider);
console.log(ethWallet.address); // 0xABC...123

// Polygon (같은 주소!)
const polygonProvider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
const polygonWallet = wallet.connect(polygonProvider);
console.log(polygonWallet.address); // 0xABC...123

// Base (같은 주소!)
const baseProvider = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');
const baseWallet = wallet.connect(baseProvider);
console.log(baseWallet.address); // 0xABC...123
```

**따라서:**
- ✅ 사용자당 1개의 Private Key만 관리하면 됨
- ✅ 모든 EVM 체인에서 같은 주소 사용
- ✅ 입금 주소 통일 (UX 향상)

**주의:**
- ⚠️ Bitcoin은 별도 Private Key 필요 (다른 알고리즘)
- ⚠️ 하나의 Private Key가 유출되면 모든 체인의 자산 위험

### 4.3 입출금 처리 (현재 부분 구현)

#### 입금 프로세스 (구현 필요)
```
1. 블록체인 모니터링 서비스 구축
   - 사용자 지갑 주소로 들어오는 트랜잭션 감지
   - RPC polling 또는 Webhook 사용
   ↓
2. 트랜잭션 컨펌 대기
   - Ethereum: 12 confirmations
   - Polygon: 128 confirmations
   - Base: 10 confirmations
   ↓
3. deposits 테이블에 기록
   ↓
4. wallets 테이블 balance 업데이트
   ↓
5. 사용자에게 알림
```

#### 출금 프로세스 (Biconomy 사용)
```
1. 사용자 출금 요청
   ↓
2. 백엔드 검증
   - 잔액 확인
   - 2FA 인증
   ↓
3. Private Key 복호화 (백엔드)
   ↓
4. Biconomy Supertransaction 실행
   - USDC로 가스비 지불
   ↓
5. withdrawals 테이블 업데이트
   ↓
6. balance 차감
```

---

## 5. Biconomy 가스비 지원 (현재 상태)

### 5.1 Biconomy의 역할

**Biconomy는 오직 가스비(전송비) 추상화만 담당합니다.**

- ❌ 지갑 생성 X
- ❌ Private Key 관리 X
- ✅ **가스비를 ERC-20 토큰(USDC, USDT)으로 지불** ← 핵심 기능

### 5.2 현재 통합 상태

#### ✅ DepositWithdrawalManagement에서 사용 중

```typescript
// /components/DepositWithdrawalManagement.tsx

const transferResponse = await fetch(backendUrl, {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
  },
  body: JSON.stringify({
    chainId: coinData.chain_id,
    from: adminWalletData.address,      // 관리자 지갑
    to: userWalletData.address,         // 사용자 지갑
    token: request.coin_type,
    amount: request.amount.toString(),
    gasPayment: {
      sponsor: true  // ✅ 관리자가 가스비 스폰서
    }
  })
});
```

**장점:**
- ✅ 사용자는 USDC만 있으면 됨 (ETH 불필요)
- ✅ 가스비를 스테이블코인으로 지불
- ✅ UX 대폭 개선

### 5.3 지원 범위

| 네트워크 | Biconomy 지원 | 가스비 지불 토큰 |
|---------|--------------|-----------------|
| Ethereum | ✅ | USDC, USDT, DAI |
| Polygon | ✅ | USDC, USDT |
| Base | ✅ | USDC, USDT |
| Arbitrum | ✅ | USDC, USDT |
| Optimism | ✅ | USDC, USDT |
| BSC | ✅ | USDT, BUSD |
| **Bitcoin** | ❌ | - |
| **Avalanche** | ⚠️ 확인 필요 | - |

---

## 6. 다른 코인의 가스비 지원 방법

### 6.1 솔루션: 플랫폼 가스비 풀 (권장)

#### 개념
- 플랫폼이 각 네트워크의 네이티브 코인 보유
- 출금 시 플랫폼이 가스비 선지불
- 수수료에서 회수 또는 흡수

#### 구현 (백엔드)
```typescript
// Supabase Edge Function 또는 Node.js

export async function sponsorGasFee(
  userWalletAddress: string,
  network: string,
  estimatedGasFee: string
) {
  const masterWallets = {
    ethereum: new ethers.Wallet(MASTER_ETH_KEY, ethProvider),
    polygon: new ethers.Wallet(MASTER_MATIC_KEY, polygonProvider),
    bsc: new ethers.Wallet(MASTER_BNB_KEY, bscProvider),
    avalanche: new ethers.Wallet(MASTER_AVAX_KEY, avalancheProvider)
  };
  
  const masterWallet = masterWallets[network];
  
  // 플랫폼이 사용자 지갑에 가스비 전송
  const tx = await masterWallet.sendTransaction({
    to: userWalletAddress,
    value: ethers.utils.parseEther(estimatedGasFee)
  });
  
  await tx.wait();
  
  console.log(`✅ ${network} 가스비 선지불: ${estimatedGasFee}`);
  
  return tx.hash;
}
```

#### 악용 방지
```typescript
// Rate Limiting
const limits = {
  maxWithdrawalsPerDay: 10,
  maxGasPerDay: ethers.utils.parseEther('0.1')
};

// 일일 한도 체크
const { data } = await supabase
  .from('gas_sponsorships')
  .select('*')
  .eq('user_id', userId)
  .gte('sponsored_at', new Date(Date.now() - 86400000).toISOString());

if (data.length >= limits.maxWithdrawalsPerDay) {
  throw new Error('일일 출금 횟수 초과');
}
```

### 6.2 Bitcoin 가스비 처리

```typescript
import * as bitcoin from 'bitcoinjs-lib';

async function sendBitcoinWithGasSponsor(
  fromAddress: string,
  toAddress: string,
  amountSatoshi: number
) {
  // 1. UTXO 조회
  const utxos = await getUTXOs(fromAddress);
  
  // 2. Transaction 생성
  const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
  
  // 3. Inputs 추가
  let totalInput = 0;
  utxos.forEach(utxo => {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: Buffer.from(utxo.scriptPubKey, 'hex'),
        value: utxo.value
      }
    });
    totalInput += utxo.value;
  });
  
  // 4. Outputs 추가
  psbt.addOutput({
    address: toAddress,
    value: amountSatoshi
  });
  
  // 5. Fee 계산
  const feeRate = await getRecommendedFeeRate(); // sat/vB
  const txSize = estimateTxSize(utxos.length, 2);
  const fee = feeRate * txSize;
  
  // 6. Change output
  const change = totalInput - amountSatoshi - fee;
  if (change > 546) {
    psbt.addOutput({
      address: fromAddress,
      value: change
    });
  }
  
  // 7. 서명 및 브로드캐스트
  const privateKey = await decryptPrivateKey(fromAddress);
  const keyPair = bitcoin.ECPair.fromPrivateKey(Buffer.from(privateKey, 'hex'));
  psbt.signAllInputs(keyPair);
  psbt.finalizeAllInputs();
  
  const tx = psbt.extractTransaction();
  const txid = await broadcastTransaction(tx.toHex());
  
  return { txid, fee };
}
```

---

## 7. 수정 로드맵

### Phase 1: 지갑 생성 수정 (긴급)
**기간:** 1-2일

- [ ] Option 1 또는 2 선택
- [ ] ethers.js 통합
- [ ] Private Key 암호화 구현
- [ ] 기존 가짜 주소 삭제 (DB 정리)

### Phase 2: 테스트
**기간:** 1일

- [ ] 지갑 생성 테스트
- [ ] 주소 유효성 확인 (EIP-55)
- [ ] 암호화/복호화 테스트

### Phase 3: 입금 시스템 구축
**기간:** 1-2주

- [ ] 블록체인 모니터링 서비스
- [ ] Webhook 또는 RPC polling
- [ ] Confirmations 대기 로직

### Phase 4: 출금 시스템 완성
**기간:** 1주

- [ ] Private Key 복호화
- [ ] 트랜잭션 서명
- [ ] Biconomy 통합 테스트

### Phase 5: 가스비 풀 (선택)
**기간:** 1주

- [ ] 마스터 월렛 관리
- [ ] 가스비 선지불 로직
- [ ] Rate Limiting

---

## 8. 즉시 수정 코드 (Option 1 - 빠른 수정)

### 8.1 패키지 설치
```bash
npm install ethers
```

### 8.2 수정 파일

```typescript
// /components/UserWalletManagement.tsx

import { ethers } from 'ethers';

// ... 기존 코드 ...

const handleConfirmAddCoins = async () => {
  if (!selectedUser || selectedCoins.length === 0) return;
  
  setIsAddingCoins(true);

  try {
    for (const coinType of selectedCoins) {
      // ✅ 실제 지갑 생성
      const wallet = ethers.Wallet.createRandom();
      
      // ✅ Private Key 암호화 (간단한 방식 - 프로덕션에서는 개선 필요)
      const encryptedKey = btoa(wallet.privateKey); // Base64 인코딩 (임시)
      
      await supabase.from('wallets').insert({
        user_id: selectedUser.user_id,
        coin_type: coinType,
        address: wallet.address,  // ✅ 실제 블록체인 주소
        encrypted_private_key: encryptedKey,  // ✅ Private Key 저장
        balance: 0,
        wallet_type: 'hot'
      });

      console.log(`✅ ${coinType} 지갑 생성:`, wallet.address);
    }

    toast.success(`${selectedCoins.length}개의 코인 지갑이 생성되었습니다`);
    setShowAddCoinModal(false);
    await fetchUserWallets(selectedUser.user_id);
  } catch (error: any) {
    toast.error(`지갑 생성 실패: ${error.message}`);
    console.error(error);
  } finally {
    setIsAddingCoins(false);
  }
};
```

**주의:** 
- 이 코드는 임시 해결책입니다
- Base64는 암호화가 아니라 인코딩이므로 보안에 취약합니다
- 프로덕션에서는 AES-GCM 암호화를 사용해야 합니다

---

## 9. 참고 자료

- **Biconomy Supertransaction API**: https://docs.biconomy.io/supertransaction-api
- **Ethers.js**: https://docs.ethers.org/v5/
- **Bitcoin JS**: https://github.com/bitcoinjs/bitcoinjs-lib
- **Web Crypto API**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API

---

## 10. 결론

### 현재 문제 요약
1. ❌ **지갑 주소가 랜덤 문자열** (실제 블록체인 주소 아님)
2. ❌ **Private Key가 없음** (트랜잭션 서명 불가능)
3. ❌ **입출금 불가능** (실제로 작동하지 않음)

### 해결 방법
- ✅ **ethers.js**로 실제 지갑 생성
- ✅ **Private Key 암호화** 후 DB 저장
- ✅ 프론트엔드 (빠름) 또는 백엔드 (안전) 선택

### 다음 단계
1. Phase 1 완료 (지갑 생성 수정)
2. 테스트
3. 입출금 시스템 완성

질문이 있으면 언제든지 문의하세요! 🚀
