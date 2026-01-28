# 도메인 및 접근 구조 가이드

## 📋 문서 정보
- **작성일**: 2025-11-29
- **버전**: 1.0
- **목적**: Multi-Tenancy 시스템의 도메인 구조 및 권한 기반 접근 명확화
- **참조**: hierachy_version1.md, logic_for_multiTenancy1.md

---

## 🌐 도메인 구조

### 센터별 도메인 할당

각 센터는 **주도메인 1개**를 가지며, 이를 기반으로 **서브도메인**이 자동 생성됩니다.

```
센터 A:
├─ example.com        (주도메인 - 회원 접속용)
└─ admin.example.com  (서브도메인 - 관리자 접속용)

센터 B:
├─ crypto-exchange.com      (주도메인 - 회원 접속용)
└─ admin.crypto-exchange.com (서브도메인 - 관리자 접속용)
```

---

## 👥 계층별 접근 방식

### 1️⃣ 마스터 (Lv0)
- **도메인**: `master-platform.com` (고정)
- **접근 방식**: 직접 도메인 접속
- **페이지**: 마스터 대시보드 (PC 형태)

```
https://master-platform.com
  ↓ 로그인
  ↓ role = 'master' 확인
  ↓ 마스터 대시보드
```

---

### 2️⃣ 에이전시 (Lv1)
- **도메인**: `master-platform.com` (마스터와 같은 도메인)
- **접근 방식**: 계정 권한으로 구분
- **페이지**: 에이전시 대시보드 (PC 형태)

```
https://master-platform.com
  ↓ 로그인
  ↓ role = 'agency' 확인
  ↓ 자동 리다이렉트 → 에이전시 대시보드
```

**핵심**: 마스터와 같은 도메인을 사용하지만, `role` 필드로 구분하여 다른 페이지를 보여줌

---

### 3️⃣ 센터 (Lv2)
- **도메인**: `admin.example.com` (센터별 서브도메인)
- **접근 방식**: 서브도메인 접속
- **페이지**: 센터 관리자 대시보드 (PC 형태)

```
https://admin.example.com
  ↓ 로그인
  ↓ role = 'center' 확인
  ↓ tenant_id = center_uuid 설정
  ↓ 센터 관리자 대시보드
```

**센터가 할 수 있는 일**:
- ✅ 가맹점(store) 생성 및 관리
- ✅ 회원(user) 관리
- ✅ 코인 구매 요청 승인
- ✅ 입출금 관리
- ✅ 커미션 설정

---

### 4️⃣ 가맹점 (Lv3) - Store
- **도메인**: `admin.example.com` (센터와 같은 도메인) ⭐
- **접근 방식**: 계정 권한으로 구분 (role='store')
- **페이지**: 가맹점 관리자 대시보드 (PC 형태)

```
https://admin.example.com
  ↓ 로그인
  ↓ role = 'store' 확인
  ↓ tenant_id = center_uuid (부모 센터 ID)
  ↓ 자동 리다이렉트 → 가맹점 대시보드
```

**핵심**: 센터와 같은 도메인(`admin.example.com`)을 사용하지만, `role='store'`로 구분하여 **가맹점 전용 페이지**를 보여줌

**가맹점이 볼 수 있는 것**:
- ✅ 자기 가맹점 커미션 통계
- ✅ 자기 가맹점으로 유입된 거래 내역
- ✅ 정산 요청
- ✅ 가맹점 지갑 관리

**가맹점이 할 수 없는 것**:
- ❌ 다른 가맹점 데이터 조회
- ❌ 센터 전체 데이터 조회
- ❌ 회원 직접 생성

---

### 5️⃣ 회원 (Lv4) - User/Member
- **도메인**: `example.com` (주도메인)
- **접근 방식**: 주도메인 접속
- **페이지**: 회원용 앱 (반응형 - 모바일/데스크톱)

```
https://example.com
  ↓ 로그인
  ↓ role = 'user' 확인
  ↓ tenant_id = center_uuid (소속 센터 ID)
  ↓ 회원 지갑 페이지
```

**회원이 할 수 있는 것**:
- ✅ 코인 구매 요청
- ✅ 코인 입금/출금
- ✅ 코인 스왑
- ✅ 거래 내역 조회
- ✅ 고객센터 문의

---

## 🔐 권한 기반 라우팅 로직

### Frontend 라우팅 (App.tsx 예시)

```typescript
// /App.tsx
import { useEffect, useState } from 'react';
import { getUserRole, getTenantInfo } from '@/api/auth';

export default function App() {
  const [role, setRole] = useState<string | null>(null);
  const [tenant, setTenant] = useState<any>(null);
  
  useEffect(() => {
    const hostname = window.location.hostname;
    
    // 로그인 여부 확인
    const user = getCurrentUser();
    
    if (!user) {
      // 미로그인 → 로그인 페이지
      return <LoginPage />;
    }
    
    setRole(user.role);
    
    // tenant 정보 로드 (센터/가맹점/회원만)
    if (['center', 'store', 'user'].includes(user.role)) {
      const tenantInfo = await getTenantInfo(hostname);
      setTenant(tenantInfo);
    }
  }, []);
  
  // 역할별 라우팅
  if (role === 'master') {
    return <MasterDashboard />;
  }
  
  if (role === 'agency') {
    return <AgencyDashboard />;
  }
  
  if (role === 'center') {
    return <CenterDashboard tenant={tenant} />;
  }
  
  if (role === 'store') {
    // ⭐ 가맹점: 센터와 같은 도메인이지만 다른 페이지
    return <StoreDashboard tenant={tenant} />;
  }
  
  if (role === 'user') {
    return <UserApp tenant={tenant} />;
  }
  
  return <NotFoundPage />;
}
```

---

## 🏢 센터 생성 시 도메인 할당

### 센터 생성 프로세스

```typescript
// /api/master/create-center.ts
export async function createCenter(req: CreateCenterRequest) {
  const { centerName, domain, ...rest } = req;
  
  // 1. 주도메인 중복 체크
  const existingCenter = await checkDomainAvailable(domain);
  if (existingCenter) {
    throw new Error(`${domain}은 이미 사용 중입니다.`);
  }
  
  // 2. 센터 생성
  const centerId = crypto.randomUUID();
  
  const center = await supabase.from('users').insert({
    id: centerId,
    role: 'center',
    tenant_id: centerId, // ⭐ 자기 자신이 tenant_id
    center_name: centerName,
    domain: domain, // example.com
    ...rest
  });
  
  // 3. DNS 자동 설정 (선택)
  // - example.com → 회원용 (CloudFlare/Route53)
  // - admin.example.com → 관리자용
  
  return {
    success: true,
    centerId: centerId,
    userDomain: domain, // example.com
    adminDomain: `admin.${domain}` // admin.example.com
  };
}
```

---

## 🗂️ 데이터베이스 설계 (수정)

### Users 테이블

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 계층 정보
  role TEXT NOT NULL CHECK (role IN ('master', 'agency', 'center', 'store', 'user')),
  -- ⭐ merchant → store로 변경
  
  -- Multi-Tenancy
  tenant_id UUID NULL REFERENCES users(id),
  parent_id UUID NULL REFERENCES users(id),
  
  -- 기본 정보
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  
  -- 센터 전용
  center_name TEXT NULL, -- role='center'만
  domain TEXT UNIQUE NULL, -- role='center'만, 예: example.com (주도메인)
  logo_url TEXT NULL,
  template_id TEXT NULL,
  
  -- 가맹점 전용
  store_code TEXT UNIQUE NULL, -- role='store'만
  -- ⭐ merchant_code → store_code로 변경
  
  -- 회원 전용
  referral_code TEXT NULL, -- role='user'만, 가입 시 사용한 가맹점 코드
  
  -- 디자인 테마 (센터 전용)
  design_theme JSONB NULL,
  
  -- 커미션
  commission_rate DECIMAL(5,2) DEFAULT 0.00,
  
  -- 상태
  is_active BOOLEAN DEFAULT true,
  is_approved BOOLEAN DEFAULT false,
  
  -- 타임스탬프
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_domain ON users(domain);
CREATE INDEX idx_users_store_code ON users(store_code);
```

### Domain Mappings 테이블

```sql
CREATE TABLE domain_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  domain TEXT UNIQUE NOT NULL, -- example.com 또는 admin.example.com
  center_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  domain_type TEXT CHECK (domain_type IN ('main', 'admin')),
  -- 'main': 회원용 주도메인 (example.com)
  -- 'admin': 관리자용 서브도메인 (admin.example.com)
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_domain_mappings_domain ON domain_mappings(domain);
CREATE INDEX idx_domain_mappings_center_id ON domain_mappings(center_id);
```

---

## 🛠️ 센터 생성 시 자동 도메인 매핑

```typescript
// 센터 생성 후 도메인 매핑 자동 생성
async function createCenterDomains(centerId: string, mainDomain: string) {
  // 1. 주도메인 매핑 (회원용)
  await supabase.from('domain_mappings').insert({
    domain: mainDomain, // example.com
    center_id: centerId,
    domain_type: 'main',
    is_active: true
  });
  
  // 2. 관리자 서브도메인 매핑 (센터/가맹점용)
  await supabase.from('domain_mappings').insert({
    domain: `admin.${mainDomain}`, // admin.example.com
    center_id: centerId,
    domain_type: 'admin',
    is_active: true
  });
}
```

---

## 🎨 UI 형태

### 회원(user) - 반응형

```
기존: /user/App.tsx (모바일 최적화)
→ 수정: 반응형으로 변경

- 모바일: 기존 디자인 유지
- 태블릿: 2열 카드 레이아웃
- 데스크톱: 3열 카드 레이아웃 + 사이드바 옵션
```

### 가맹점(store) - PC 형태

```
기존: 없음 (신규 개발)
→ 데스크톱 최적화

- 사이드바 네비게이션
- 넓은 테이블 뷰
- 차트/통계 대시보드
- 모바일 지원 안 함 (PC 전용)
```

---

## 🔄 가맹점 계정 생성

### 센터가 가맹점 생성 시

```typescript
// /api/center/create-store.ts
export async function createStore(req: CreateStoreRequest) {
  const { centerId, username, email, password, storeName, commissionRate } = req;
  
  // 1. 센터 정보 조회
  const center = await getCenter(centerId);
  
  // 2. 가맹점 생성
  const storeId = crypto.randomUUID();
  const storeCode = `STORE_${Date.now()}`; // 가맹점 코드 자동 생성
  
  const store = await supabase.from('users').insert({
    id: storeId,
    role: 'store', // ⭐ 'merchant' 대신 'store'
    tenant_id: center.tenant_id, // ⭐ 부모 센터의 tenant_id 상속
    parent_id: centerId,
    username: username,
    email: email,
    password_hash: await hash(password),
    store_code: storeCode, // ⭐ merchant_code 대신 store_code
    commission_rate: commissionRate,
    is_active: true,
    is_approved: false // 마스터 승인 필요
  });
  
  return {
    success: true,
    storeId: storeId,
    storeCode: storeCode,
    accessUrl: `admin.${center.domain}`, // ⭐ 센터와 같은 도메인
    message: `로그인 후 role='store'로 가맹점 페이지 접근`
  };
}
```

---

## 🧪 테스트 시나리오

### 시나리오 1: 센터 A 전체 흐름

```
1. 마스터가 센터 A 생성
   - 주도메인: example.com
   - 센터명: Example Exchange
   
2. 자동 생성되는 것:
   - example.com → 회원용
   - admin.example.com → 관리자용 (센터/가맹점 공통)
   
3. 센터 A 관리자 로그인:
   https://admin.example.com
   └─ 로그인 (role='center')
   └─ 센터 대시보드
   
4. 센터 A가 가맹점 생성:
   - 가맹점 이름: Store 1
   - 가맹점 코드: STORE_1701234567
   - 접속 도메인: admin.example.com (센터와 같음)
   
5. 가맹점 로그인:
   https://admin.example.com
   └─ 로그인 (role='store')
   └─ 자동 리다이렉트 → 가맹점 대시보드
   
6. 회원 가입:
   https://example.com
   └─ 회원가입 (referral_code: STORE_1701234567 입력)
   └─ 회원 앱
```

---

## 📝 체크리스트 업데이트 필요 사항

### Phase 0: 도메인 인프라 설정 (추가)

```markdown
- [ ] DNS Provider 계정 준비 (Cloudflare/Route53)
- [ ] Wildcard SSL 인증서 발급 준비
- [ ] 로컬 개발용 /etc/hosts 설정

### 0.1 마스터 플랫폼 도메인 설정
- [ ] master-platform.com 도메인 구입
- [ ] DNS A 레코드 설정
- [ ] SSL 인증서 설치

### 0.2 센터 도메인 자동 매핑 시스템
- [ ] domain_mappings 테이블 생성
- [ ] 센터 생성 시 자동 매핑 로직 구현
- [ ] example.com → main
- [ ] admin.example.com → admin (자동 생성)

### 0.3 역할 기반 라우팅 시스템
- [ ] App.tsx에 role 체크 로직 추가
- [ ] master → MasterDashboard
- [ ] agency → AgencyDashboard
- [ ] center → CenterDashboard
- [ ] store → StoreDashboard (센터와 같은 도메인)
- [ ] user → UserApp (반응형)
```

---

## 🎯 핵심 정리

1. **도메인 구조**:
   - 회원: `example.com` (주도메인)
   - 센터/가맹점: `admin.example.com` (서브도메인 공유, role로 구분)
   - 마스터/에이전시: `master-platform.com` (role로 구분)

2. **권한 구분**:
   - 같은 도메인이라도 `role` 필드로 다른 페이지 제공
   - 가맹점은 센터와 도메인을 공유하지만 데이터는 격리

3. **용어 통일**:
   - merchant → **store**
   - merchant_code → **store_code**
   - merchant_applications → **store_applications**

4. **UI 형태**:
   - 회원: 반응형 (모바일 우선)
   - 센터/가맹점: PC 형태 (데스크톱 최적화)

---

**다음 단계**: implementation_checklist.md 업데이트

