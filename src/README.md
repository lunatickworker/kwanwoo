# P2P 코인 입출금 관리 시스템

Biconomy Supertransaction API와 Supabase를 활용한 Web3 P2P 거래 플랫폼

## 🚀 주요 기능

- ✅ **3단계 Supertransaction** - Compose → Sign → Execute
- ✅ **가스비 추상화** - 10,000+ ERC-20 토큰으로 가스비 지불
- ✅ **P2P 거래** - 직접 거래로 최적 가격 발견
- ✅ **KYC 인증** - 안전한 거래를 위한 신원 인증
- ✅ **크로스체인 지원** - 40+ 블록체인 지원
- ✅ **실시간 트랜잭션 추적** - 모든 거래 내역 확인

## 🛠️ 기술 스택

- **Frontend**: Vite + React 18 + TypeScript
- **Styling**: Tailwind CSS
- **Blockchain**: Ethers.js + Biconomy API
- **Database**: Supabase (PostgreSQL)
- **Routing**: React Router v6
- **Icons**: Lucide React

## 📦 설치 방법

### 1. 프로젝트 생성
```bash
npm create vite@latest p2p-crypto-platform -- --template react-ts
cd p2p-crypto-platform
```

### 2. 의존성 설치
```bash
npm install @supabase/supabase-js ethers@5.7.2 lucide-react react-router-dom
npm install -D tailwindcss postcss autoprefixer
npx tailwin