# 센터 도메인 자동 매핑 시스템 설계

## 📋 문서 정보
- **작성일**: 2025-12-01
- **버전**: 1.0
- **목적**: 센터 생성 시 도메인 자동 매핑 시스템 구현 가이드
- **참조**: implementation_checklist.md (Phase 1.2), domain_and_access_structure.md

---

## 🎯 개요

각 센터는 생성 시 **주도메인 1개**를 할당받으며, 시스템이 자동으로 **서브도메인**을 생성합니다.

### 도메인 구조

```
센터 생성 시 입력: example.com

자동 생성되는 도메인:
├─ example.com        (주도메인 - 회원 접속용, domain_type='main')
└─ admin.example.com  (서브도메인 - 센터/가맹점 관리자용, domain_type='admin')
```

---

## 🗄️ 데이터베이스 구조

### domain_mappings 테이블

```sql
CREATE TABLE domain_mappings (
  domain_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT UNIQUE NOT NULL,           -- 전체 도메인 (example.com 또는 admin.example.com)
  center_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  domain_type TEXT CHECK (domain_type IN ('main', 'admin')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_domain_mappings_domain ON domain_mappings(domain);
CREATE INDEX idx_domain_mappings_center_id ON domain_mappings(center_id);
CREATE INDEX idx_domain_mappings_is_active ON domain_mappings(is_active);
```

### users 테이블 (센터 정보)

```sql
-- 센터 관련 컬럼
user_id UUID PRIMARY KEY,
role TEXT CHECK (role IN ('master', 'agency', 'center', 'store', 'user')),
tenant_id UUID REFERENCES users(user_id),
center_name TEXT,
domain TEXT UNIQUE,  -- 주도메인만 저장 (예: example.com)
logo_url TEXT,
template_id TEXT,
design_theme JSONB
```

---

## 🔧 센터 생성 프로세스

### 1단계: 센터 정보 입력

```typescript
interface CreateCenterRequest {
  centerName: string;      // 센터명
  domain: string;          // 주도메인 (예: example.com)
  username: string;        // 센터 관리자 아이디
  email: string;          // 이메일
  password: string;       // 비밀번호
  templateId?: string;    // 디자인 템플릿 (선택)
  logoFile?: File;        // 로고 이미지 (선택)
}
```

### 2단계: 도메인 중복 검사

```typescript
// 주도메인 중복 확인
const { data: existingDomain } = await supabase
  .from('domain_mappings')
  .select('domain_id')
  .eq('domain', domain)  // example.com
  .single();

if (existingDomain) {
  throw new Error('이미 사용 중인 도메인입니다');
}

// 서브도메인 중복 확인
const { data: existingAdminDomain } = await supabase
  .from('domain_mappings')
  .select('domain_id')
  .eq('domain', `admin.${domain}`)  // admin.example.com
  .single();

if (existingAdminDomain) {
  throw new Error('이미 사용 중인 관리자 도메인입니다');
}
```

### 3단계: 센터 생성

```typescript
const centerId = crypto.randomUUID();

const { error: centerError } = await supabase
  .from('users')
  .insert({
    user_id: centerId,
    role: 'center',
    tenant_id: centerId,  // ⭐ 센터는 자기 자신이 tenant_id
    center_name: centerName,
    domain: domain,  // 주도메인만 저장
    username: username,
    email: email,
    password_hash: hashedPassword,
    template_id: templateId || 'modern',
    logo_url: logoUrl,
    is_active: true,
    created_at: new Date().toISOString()
  });
```

### 4단계: 도메인 매핑 자동 생성

```typescript
// 2개의 도메인 매핑 레코드 생성
const domainMappings = [
  {
    domain: domain,              // example.com
    center_id: centerId,
    domain_type: 'main',         // 회원용
    is_active: true
  },
  {
    domain: `admin.${domain}`,   // admin.example.com
    center_id: centerId,
    domain_type: 'admin',        // 관리자용
    is_active: true
  }
];

const { error: mappingError } = await supabase
  .from('domain_mappings')
  .insert(domainMappings);

if (mappingError) {
  // 롤백: 생성된 센터 삭제
  await supabase
    .from('users')
    .delete()
    .eq('user_id', centerId);
  
  throw new Error('도메인 매핑 생성 실패');
}
```

---

## 🌐 DNS 설정 방법

### 옵션 1: 수동 DNS 설정

센터 생성 후 DNS 제공자(Cloudflare, Route53 등)에서 수동으로 설정:

```
1. DNS 관리 페이지 접속
2. A 레코드 또는 CNAME 레코드 추가:
   - example.com → Vercel DNS (cname.vercel-dns.com)
   - admin.example.com → Vercel DNS (cname.vercel-dns.com)
```

### 옵션 2: Cloudflare API 자동 설정 (선택)

```typescript
// Cloudflare API를 사용한 자동 DNS 설정
async function createCloudflareRecords(domain: string) {
  const cloudflareApiKey = process.env.CLOUDFLARE_API_KEY;
  const cloudflareZoneId = process.env.CLOUDFLARE_ZONE_ID;
  
  // 주도메인 CNAME 레코드
  await fetch(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/dns_records`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cloudflareApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'CNAME',
      name: domain,
      content: 'cname.vercel-dns.com',
      proxied: true
    })
  });
  
  // 관리자 서브도메인 CNAME 레코드
  await fetch(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/dns_records`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cloudflareApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'CNAME',
      name: `admin.${domain}`,
      content: 'cname.vercel-dns.com',
      proxied: true
    })
  });
}
```

---

## 🚀 Vercel 도메인 자동 추가

### Vercel API를 통한 도메인 등록

```typescript
async function addVercelDomains(domain: string) {
  const vercelToken = process.env.VITE_VERCEL_TOKEN;
  const vercelProjectId = process.env.VITE_VERCEL_PROJECT_ID;
  
  const domains = [domain, `admin.${domain}`];
  
  for (const d of domains) {
    await fetch(`https://api.vercel.com/v9/projects/${vercelProjectId}/domains`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: d
      })
    });
  }
}
```

### 환경 변수 설정 (Vercel Dashboard)

```bash
# Vercel Dashboard → Settings → Environment Variables

VITE_VERCEL_TOKEN=your_vercel_token_here
VITE_VERCEL_PROJECT_ID=prj_xxx

# 선택사항 (Cloudflare 자동 설정)
CLOUDFLARE_API_KEY=your_cloudflare_api_key
CLOUDFLARE_ZONE_ID=your_zone_id
```

---

## 🔍 도메인 조회 시스템

### Frontend에서 Tenant 정보 조회

```typescript
// /utils/domain.ts 사용
import { getTenantInfo } from '@/utils/domain';

// 현재 호스트명으로 자동 조회
const tenantInfo = await getTenantInfo();

console.log(tenantInfo);
// {
//   centerId: 'center-uuid',
//   centerName: 'Example Exchange',
//   domain: 'example.com',
//   domainType: 'main' or 'admin',
//   logoUrl: 'https://...',
//   templateId: 'modern',
//   designTheme: { ... }
// }
```

### 도메인 타입별 라우팅

```typescript
// /App.tsx에서 사용
const domainType = await getDomainType();

if (domainType === 'main') {
  // 회원용 도메인 → UserApp
  return <UserApp />;
} else if (domainType === 'admin') {
  // 관리자용 도메인 → role에 따라 CenterDashboard 또는 StoreDashboard
  if (user.role === 'center') {
    return <CenterDashboard />;
  } else if (user.role === 'store') {
    return <StoreDashboard />;
  }
}
```

---

## 🧪 테스트 시나리오

### 시나리오 1: 센터 생성

```typescript
// 1. 센터 생성 요청
const result = await createCenter({
  centerName: 'Test Exchange',
  domain: 'test.example.com',
  username: 'test_center',
  email: 'center@test.com',
  password: 'secure_password',
  templateId: 'modern'
});

console.log(result);
// {
//   success: true,
//   centerId: 'uuid-xxx',
//   userDomain: 'test.example.com',
//   adminDomain: 'admin.test.example.com'
// }

// 2. domain_mappings 확인
const { data: mappings } = await supabase
  .from('domain_mappings')
  .select('*')
  .eq('center_id', result.centerId);

console.log(mappings);
// [
//   {
//     domain: 'test.example.com',
//     center_id: 'uuid-xxx',
//     domain_type: 'main',
//     is_active: true
//   },
//   {
//     domain: 'admin.test.example.com',
//     center_id: 'uuid-xxx',
//     domain_type: 'admin',
//     is_active: true
//   }
// ]
```

### 시나리오 2: 도메인 접속 테스트

```bash
# 1. 회원용 도메인 접속
https://test.example.com
→ UserApp 렌더링 (반응형)

# 2. 관리자용 도메인 - 센터 로그인
https://admin.test.example.com
→ 로그인 (role='center')
→ CenterDashboard 렌더링 (PC 형태)

# 3. 관리자용 도메인 - 가맹점 로그인
https://admin.test.example.com
→ 로그인 (role='store')
→ StoreDashboard 렌더링 (PC 형태)
```

### 시나리오 3: 잘못된 접근 처리

```typescript
// 회원이 관리자 도메인에 접속
https://admin.test.example.com
→ role='user'로 로그인 시도
→ 자동 리다이렉트: https://test.example.com

// 센터가 회원 도메인에 접속
https://test.example.com
→ role='center'로 로그인 시도
→ 자동 리다이렉트: https://admin.test.example.com
```

---

## 📊 데이터 흐름도

```
1. 센터 생성 요청
   ↓
2. 도메인 중복 검사
   ├─ domain_mappings에서 중복 확인
   └─ example.com, admin.example.com 모두 확인
   ↓
3. users 테이블에 센터 생성
   ├─ role='center'
   ├─ tenant_id=centerId (자기 자신)
   └─ domain=example.com
   ↓
4. domain_mappings 테이블에 2개 레코드 생성
   ├─ example.com (main)
   └─ admin.example.com (admin)
   ↓
5. Vercel API 호출 (선택)
   ├─ example.com 도메인 추가
   └─ admin.example.com 도메인 추가
   ↓
6. 완료
   └─ DNS 설정 안내 (수동 or 자동)
```

---

## 🔒 보안 고려사항

### 1. 도메인 검증

```typescript
// 유효한 도메인 형식 검사
function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
  return domainRegex.test(domain);
}

// 금지된 도메인 체크
const RESERVED_DOMAINS = ['localhost', 'admin', 'www', 'api', 'app'];

function isReservedDomain(domain: string): boolean {
  const subdomain = domain.split('.')[0];
  return RESERVED_DOMAINS.includes(subdomain.toLowerCase());
}
```

### 2. 도메인 소유권 확인 (선택)

```typescript
// DNS TXT 레코드를 통한 소유권 확인
async function verifyDomainOwnership(domain: string): Promise<boolean> {
  const verificationToken = crypto.randomUUID();
  
  // 1. 검증 토큰 생성 및 저장
  await supabase
    .from('domain_verifications')
    .insert({
      domain: domain,
      token: verificationToken,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24시간
    });
  
  // 2. 사용자에게 TXT 레코드 추가 요청
  console.log(`다음 TXT 레코드를 DNS에 추가하세요:`);
  console.log(`_verification.${domain} TXT "${verificationToken}"`);
  
  // 3. DNS 조회로 확인 (Node.js dns 모듈 사용)
  // ... DNS 조회 로직
  
  return true;
}
```

### 3. Rate Limiting

```typescript
// 센터 생성 요청 제한 (IP당 하루 10개)
const RATE_LIMIT = {
  maxCentersPerDay: 10,
  maxCentersPerIP: 5
};
```

---

## ✅ 체크리스트

- [x] domain_mappings 테이블 생성 (Phase 0 완료)
- [x] 센터 생성 API 설계
- [x] 도메인 중복 검사 로직
- [x] 자동 서브도메인 생성 로직
- [ ] Vercel API 연동 (Phase 1.4)
- [ ] Cloudflare API 연동 (선택사항)
- [x] Frontend 도메인 조회 유틸리티 (/utils/domain.ts)
- [x] 역할 기반 라우팅 시스템 (/App.tsx)
- [ ] 도메인 소유권 확인 시스템 (선택사항)

---

## 📚 관련 문서

- implementation_checklist.md - Phase 1.2
- domain_and_access_structure.md - 도메인 구조
- migration_001_multi_tenancy.sql - DB 마이그레이션
- /utils/domain.ts - 도메인 조회 유틸리티
- /App.tsx - 역할 기반 라우팅

---

## 🎉 완료 기준

1. ✅ 센터 생성 시 2개의 도메인 매핑 자동 생성
2. ✅ Frontend에서 현재 도메인으로 Tenant 정보 조회 가능
3. ✅ 역할과 도메인 타입에 따라 올바른 페이지 렌더링
4. ⏳ Vercel에 도메인 자동 추가 (Phase 1.4에서 구현)
5. ⏳ DNS 설정 자동화 (선택사항)

**현재 상태**: Phase 1.2 완료 ✅
