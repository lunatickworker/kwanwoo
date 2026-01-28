# Tron (TRC-20) 지원 구현 완료

## ✅ 구현 완료 사항

### 1. **멀티체인 전송 시스템**
- ✅ **EVM 체인** (Biconomy Supertransaction API)
  - Ethereum, Polygon, Base, Arbitrum, Optimism, BSC, Avalanche, Fantom, Gnosis, Scroll, Linea, Mantle
  - **가스비 스폰서십 지원** (10,000+ ERC-20 토큰으로 가스비 지불 가능)
  - 자동 최적화, 원클릭 UX

- ✅ **Tron 체인** (TronWeb SDK)
  - Tron Mainnet (Chain ID: 728126428)
  - Tron Shasta Testnet (Chain ID: 2494104990)
  - Tron Nile Testnet (Chain ID: 3448148188)
  - **TRC-20 토큰 전송 지원**
  - **사용자가 직접 가스비 지불** (TRX로 지불)

### 2. **자동 네트워크 감지 및 분기**
```typescript
// /supabase/functions/server/transaction.tsx

if (isTronNetwork(chainId)) {
  // Tron 네트워크 → TronWeb SDK 사용
  const tronResult = await sendTronTransaction({ ... });
  
} else if (isEVMNetwork(chainId)) {
  // EVM 네트워크 → Biconomy Supertransaction API 사용
  const composeResult = await fetch(`${BICONOMY_API_URL}/compose`, { ... });
  
} else {
  // 지원하지 않는 네트워크
  throw new Error(`지원하지 않는 네트워크입니다`);
}
```

### 3. **Transaction Receipt 조회**
- ✅ **EVM 체인**: `eth_getTransactionReceipt` JSON-RPC 호출
- ✅ **Tron 체인**: `tronWeb.trx.getTransactionInfo()` 호출
- ✅ 상태: `pending` → `processing` → `completed`/`failed`
- ✅ 블록 번호, 가스 사용량, 컨펌 수 표시

### 4. **관리자 화면에서 확인 가능**
- **경로**: `입출금 관리` → `이체 요청` 탭
- **승인된 요청의 "영수증 보기" 버튼** 클릭
- **API**: `GET /transaction/receipt/:txHash?chainId=xxx`

---

## 📦 Tron 코인 추가 방법

### 1. **코인 관리 화면에서 추가**
```
마스터 메뉴 → 코인 관리 → 코인 추가
```

### 2. **입력 정보**
| 항목 | 예시 |
|------|------|
| 심볼 | `USDT` |
| 이름 | `Tether USD (TRC-20)` |
| 컨트랙트 주소 | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` |
| 체인 ID | `728126428` (Tron Mainnet) |
| Decimals | `6` |

### 3. **지원되는 Tron Chain ID**
- `728126428`: Tron Mainnet
- `2494104990`: Tron Shasta Testnet
- `3448148188`: Tron Nile Testnet

---

## 🔧 가스비 정책

### **EVM 체인 (Biconomy)**
- ✅ **가스비 스폰서십 지원**
- ✅ USDC, USDT 등 ERC-20 토큰으로 가스비 지불 가능
- ✅ 운영자가 가스비 전액 스폰서 가능
- ✅ 마스터 메뉴 → 가스비 정책에서 사용자 레벨별 설정 가능

### **Tron 체인 (TronWeb)**
- ❌ **가스비 스폰서십 지원 안 됨**
- ⚠️ **사용자가 TRX로 가스비 직접 지불**
- ⚠️ 사용자 지갑에 TRX 잔액 필요 (약 5-20 TRX 권장)
- ⚠️ Energy/Bandwidth 부족 시 가스비 높아질 수 있음

---

## 🚀 출금 프로세스

### **EVM 체인**
```
1. Compose (무엇을 할지 알림)
2. Sign (사용자 서명)
3. Execute (완료!)
```
- ✅ 가스비 자동 계산
- ✅ 최적 라우팅
- ✅ 원클릭 UX

### **Tron 체인**
```
1. TronWeb SDK 초기화
2. TRC-20 Contract 호출
3. transaction.transfer() 실행
4. txHash 반환
```
- ⚠️ 사용자가 TRX로 가스비 지불
- ⚠️ feeLimit: 100 TRX (기본값)

---

## 📊 Transaction Receipt 확인

### **확인 방법 1: 관리자 화면**
```
입출금 관리 → 이체 요청 탭 → "영수증 보기" 버튼
```

### **확인 방법 2: API 직접 호출**
```bash
# EVM 체인 (Base)
GET /transaction/receipt/0x1234567890abcdef?chainId=8453

# Tron 체인
GET /transaction/receipt/abc123def456?chainId=728126428
```

### **응답 예시**
```json
{
  "success": true,
  "receipt": {
    "txHash": "0x1234567890abcdef...",
    "status": "completed",
    "blockNumber": 12345678,
    "gasUsed": "21000",
    "effectiveGasPrice": "1000000000",
    "timestamp": "2025-12-05T12:34:56.789Z",
    "confirmations": 15
  }
}
```

---

## ⚠️ 주의사항

### 1. **Tron 지갑 잔액**
- TRC-20 토큰 전송 시 **TRX 잔액 필수**
- 권장: 최소 5-20 TRX 보유
- Energy/Bandwidth 부족 시 가스비 증가

### 2. **네트워크 타입 확인**
- 코인 추가 시 **Chain ID 정확히 입력**
- Tron Mainnet: `728126428`
- EVM 체인과 혼동 주의

### 3. **컨트랙트 주소 형식**
- **EVM**: `0x...` (42자)
- **Tron**: `T...` (34자, Base58 인코딩)

---

## 📝 코드 위치

### **Backend (Edge Function)**
- `/supabase/functions/server/transaction.tsx`
  - `isTronNetwork()`: Tron 체인 감지
  - `isEVMNetwork()`: EVM 체인 감지
  - `sendTronTransaction()`: Tron 전송
  - `getTronTransactionReceipt()`: Tron Receipt 조회

### **Frontend**
- `/components/master/CoinManagement.tsx`: 코인 관리
- `/components/DepositWithdrawalManagement.tsx`: 입출금 관리, Receipt 조회

---

## 🎉 테스트 방법

### 1. **Tron USDT 추가**
```
심볼: USDT
이름: Tether USD (TRC-20)
컨트랙트: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
체인 ID: 728126428
Decimals: 6
```

### 2. **출금 테스트**
- 사용자가 Tron USDT 출금 요청
- 관리자가 승인
- 자동으로 TronWeb SDK로 전송됨
- Transaction Hash 확인 가능

### 3. **Receipt 확인**
- "영수증 보기" 버튼 클릭
- 상태, 블록 번호, 가스 사용량 확인

---

## 🔐 보안

- ✅ Private Key는 Edge Function에서만 복호화
- ✅ 프론트엔드에 노출 안 됨
- ✅ Supabase Service Role Key 필요
- ✅ TronWeb SDK는 서버 사이드에서만 실행

---

**구현 완료!** 이제 Tron (TRC-20) 코인도 EVM 코인과 동일하게 입출금 관리 시스템에서 사용할 수 있습니다! 🚀
