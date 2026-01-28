# Multi-Tenancy 구현 가이드 (센터 기반 멀티 테넌시)

## 📋 문서 개요
- **작성일**: 2025-11-28
- **버전**: 1.0
- **목적**: hierachy_version1.md 기반 센터/가맹점/회원 생성 시 Multi-Tenancy 구현 전략
- **참조**: hierachy_version1.md, logic_for_multiTenancy.md

---

## 🎯 Multi-Tenancy 목적

**하나의 프로젝트/시스템**에서 **여러 센터(테넌트)**가 독립적으로 운영되도록 지원:

### 주요 요구사항
1. ✅ **데이터 분리**: 각 센터의 데이터가 절대 섞이지 않도록
2. ✅ **도메인 분리**: 각 센터마다 독립적인 도메인 (예: center1.com, center2.com)
3. ✅ **디자인 커스터마이징**: 각 센터마다 다른 디자인 테마/컬러
4. ✅ **레이아웃 템플릿**: 5가지 레이아웃 중 선택 가능
5. ✅ **로고 커스터마이징**: 각 센터마다 독립적인 로고
6. ✅ **독립적 운영**: 각 센터가 자체 가맹점/회원 관리

---

## 🏗️ 시스템 계층 구조 (tenant_id 기반)

```
마스터(Lv0) - tenant_id: NULL
  ↓
에이전시(Lv1) - tenant_id: NULL (통합 뷰어)
  ↓
센터(Lv2) ⭐ - tenant_id: center_uuid (테넌트 시작점)
  ↓
가맹점(Lv3) - tenant_id: 부모 센터의 center_uuid (상속)
  ↓
회원(Lv4) - tenant_id: 소속 센터의 center_uuid (상속)
```

### 핵심 원칙
- **센터(Lv2)가 테넌트의 시작점**: 센터 생성 시 고유한 `tenant_id` 부여
- **하위 계층은 tenant_id 상속**: 가맹점/회원은 소속 센터의 `tenant_id`를 그대로 사용
- **모든 쿼리에 tenant_id 조건 추가**: 데이터 격리 보장

---

## 📊 데이터베이스 설계

### 1. Users 테이블 (통합 사용자 테이블)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 계층 정보
  role TEXT NOT NULL CHECK (role IN ('master', 'agency', 'center', 'store', 'user')),
  -- ⭐ merchant → store로 용어 통일
  
  -- Multi-Tenancy 핵심 컬럼 ⭐
  tenant_id UUID NULL REFERENCES users(id),
  -- tenant_id는 소속 센터(Lv2)의 id를 가리킴
  -- master, agency: NULL (전체 시스템 접근)
  -- center: 자기 자신의 id (테넌트 시작점)
  -- merchant, user: 소속 센터의 id (상속)
  
  -- 계층 관계
  parent_id UUID NULL REFERENCES users(id),
  -- 직속 상위 계층 (에이전시 → 센터, 센터 → 가맹점)
  
  -- 기본 정보
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  
  -- 센터 전용 정보
  center_name TEXT NULL, -- role='center'인 경우만
  domain TEXT UNIQUE NULL, -- role='center'인 경우만, 예: center1.example.com
  logo_url TEXT NULL, -- 센터 로고 URL
  template_id TEXT NULL CHECK (template_id IN ('modern', 'classic', 'minimal', 'gaming', 'luxury')), -- 레이아웃 템플릿
  
  -- 가맹점 전용 정보
  store_code TEXT UNIQUE NULL, -- role='store'인 경우만 (파트너 코드)
  -- ⭐ merchant_code → store_code로 변경
  
  -- 회원 전용 정보
  referral_code TEXT NULL, -- role='user'인 경우, 가입 시 사용한 가맹점 코드
  
  -- 커미션 설정
  commission_rate DECIMAL(5,2) DEFAULT 0.00,
  -- master가 agency/center 생성 시 설정
  -- center가 merchant 생성 시 설정
  
  -- 디자인 설정 (센터 전용)
  design_theme JSONB NULL,
  -- {
  --   "primaryColor": "#3B82F6",
  --   "secondaryColor": "#8B5CF6",
  --   "logoUrl": "https://cdn.example.com/center1/logo.png",
  --   "fontFamily": "Pretendard"
  -- }
  
  -- 상태 관리
  is_active BOOLEAN DEFAULT true,
  is_approved BOOLEAN DEFAULT false, -- 가맹점 승인 여부
  
  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성 (성능 최적화)
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_parent_id ON users(parent_id);
CREATE INDEX idx_users_domain ON users(domain) WHERE domain IS NOT NULL;
CREATE INDEX idx_users_store_code ON users(store_code) WHERE store_code IS NOT NULL;
-- ⭐ merchant_code → store_code 인덱스 변경
```

### 2. Wallets 테이블 (지갑 정보)

```sql
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Multi-Tenancy ⭐
  tenant_id UUID NULL REFERENCES users(id),
  -- users 테이블의 tenant_id와 동일하게 설정
  
  -- 지갑 정보
  address TEXT UNIQUE NOT NULL,
  chain_id INTEGER NOT NULL,
  
  -- 잔액
  balance DECIMAL(36,18) DEFAULT 0,
  
  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wallets_tenant_id ON wallets(tenant_id);
CREATE INDEX idx_wallets_user_id ON wallets(user_id);
```

### 3. Transactions 테이블 (트랜잭션 내역)

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Multi-Tenancy ⭐
  tenant_id UUID NULL REFERENCES users(id),
  -- 트랜잭션이 발생한 센터의 tenant_id
  
  -- 트랜잭션 정보
  from_user_id UUID REFERENCES users(id),
  to_user_id UUID REFERENCES users(id),
  amount DECIMAL(36,18) NOT NULL,
  token TEXT NOT NULL,
  
  -- 블록체인 정보
  tx_hash TEXT UNIQUE NOT NULL,
  chain_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  
  -- 트랜잭션 타입
  tx_type TEXT NOT NULL CHECK (tx_type IN ('deposit', 'withdraw', 'transfer', 'swap', 'purchase')),
  
  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_tenant_id ON transactions(tenant_id);
CREATE INDEX idx_transactions_from_user_id ON transactions(from_user_id);
CREATE INDEX idx_transactions_to_user_id ON transactions(to_user_id);
```

### 4. Commissions 테이블 (커미션 내역)

```sql
CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Multi-Tenancy ⭐
  tenant_id UUID NULL REFERENCES users(id),
  -- 커미션이 발생한 센터의 tenant_id
  
  -- 커미션 정보
  user_id UUID NOT NULL REFERENCES users(id), -- 커미션 받는 사람
  transaction_id UUID REFERENCES transactions(id),
  amount DECIMAL(36,18) NOT NULL,
  commission_rate DECIMAL(5,2) NOT NULL,
  
  -- 정산 상태
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'requested', 'approved', 'paid')),
  settlement_id UUID NULL, -- 정산 요청 시 생성
  
  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_commissions_tenant_id ON commissions(tenant_id);
CREATE INDEX idx_commissions_user_id ON commissions(user_id);
```

### 5. Purchase_Requests 테이블 (구매 요청)

```sql
CREATE TABLE purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Multi-Tenancy ⭐
  tenant_id UUID NULL REFERENCES users(id),
  -- 구매 요청이 발생한 센터의 tenant_id
  
  -- 구매 정보
  user_id UUID NOT NULL REFERENCES users(id), -- 구매 요청한 회원
  center_id UUID NOT NULL REFERENCES users(id), -- 승인할 센터
  merchant_id UUID NULL REFERENCES users(id), -- 최종 코인이 갈 가맹점
  
  amount DECIMAL(36,18) NOT NULL,
  token TEXT NOT NULL,
  
  -- 상태
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  
  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_purchase_requests_tenant_id ON purchase_requests(tenant_id);
CREATE INDEX idx_purchase_requests_user_id ON purchase_requests(user_id);
CREATE INDEX idx_purchase_requests_center_id ON purchase_requests(center_id);
```

### 6. Domain_Mappings 테이블 (도메인 맵핑)

```sql
CREATE TABLE domain_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 센터 정보
  center_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- center_id = tenant_id (센터는 자기 자신이 tenant)
  
  -- 도메인 정보
  domain TEXT UNIQUE NOT NULL, -- 예: center1.example.com
  is_active BOOLEAN DEFAULT true,
  
  -- SSL 설정
  ssl_enabled BOOLEAN DEFAULT false,
  ssl_cert_path TEXT NULL,
  
  -- CDN 설정
  cdn_url TEXT NULL, -- 예: https://cdn.example.com/center1
  
  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_domain_mappings_center_id ON domain_mappings(center_id);
CREATE INDEX idx_domain_mappings_domain ON domain_mappings(domain);
```

---

## 🔧 구현 로직

### 1. 센터 생성 (마스터가 실행)

```typescript
// /api/master/create-center

interface CreateCenterRequest {
  username: string;
  email: string;
  password: string;
  centerName: string;
  domain: string; // 예: center1.example.com
  commissionRate: number; // 예: 0.2 (0.2%)
  agencyId?: string; // 소속 에이전시 (선택사항)
  
  // 템플릿 및 디자인 설정 ⭐
  templateId: 'modern' | 'classic' | 'minimal' | 'gaming' | 'luxury';
  logoFile?: File; // 로고 파일 (선택사항)
  customColors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
}

async function createCenter(req: CreateCenterRequest) {
  // 1. 템플릿 프리셋 로드
  const templatePreset = getTemplatePreset(req.templateId);
  
  // 2. 커스텀 컬러와 프리셋 컬러 병합
  const finalColors = {
    ...templatePreset.colors,
    ...(req.customColors || {})
  };
  
  // 3. 센터 계정 생성
  const centerId = generateUUID();
  
  let logoUrl: string | null = null;
  
  // 4. 로고 업로드 (있는 경우)
  if (req.logoFile) {
    const uploadResult = await uploadCenterLogo({
      centerId,
      logoFile: req.logoFile
    });
    logoUrl = uploadResult.logoUrl;
  }
  
  // 5. DB에 센터 생성
  const centerUser = await db.users.insert({
    id: centerId,
    role: 'center',
    tenant_id: centerId, // ⭐ 핵심: 자기 자신을 tenant_id로 설정
    parent_id: req.agencyId || null, // 에이전시 소속이면 agency_id
    username: req.username,
    email: req.email,
    password_hash: await hashPassword(req.password),
    center_name: req.centerName,
    domain: req.domain,
    logo_url: logoUrl, // ⭐ 로고 URL
    template_id: req.templateId, // ⭐ 템플릿 ID
    commission_rate: req.commissionRate,
    design_theme: {
      colors: finalColors,
      fonts: templatePreset.fonts,
      layout: templatePreset.layout
    },
    is_active: true,
    is_approved: true // 마스터가 생성하므로 자동 승인
  });
  
  // 2. 도메인 맵핑 생성
  await db.domain_mappings.insert({
    center_id: centerId,
    domain: req.domain,
    is_active: true,
    cdn_url: `https://cdn.example.com/${centerId}`
  });
  
  // 3. 센터 지갑 생성
  const walletAddress = await generateWalletAddress();
  await db.wallets.insert({
    user_id: centerId,
    tenant_id: centerId, // ⭐ 센터의 tenant_id
    address: walletAddress,
    chain_id: 8453, // Base 체인
    balance: 0
  });
  
  // 4. 에이전시에 알림 (있는 경우)
  if (req.agencyId) {
    await sendNotification(req.agencyId, {
      type: 'center_created',
      message: `새로운 센터 "${req.centerName}"이 생성되었습니다.`
    });
  }
  
  return {
    success: true,
    centerId: centerId,
    domain: req.domain
  };
}
```

### 2. 가맹점 생성 (센터가 실행)

```typescript
// /api/center/create-merchant

interface CreateMerchantRequest {
  username: string;
  email: string;
  password: string;
  merchantCode: string; // 파트너 코드 (고유값)
  commissionRate: number; // 예: 0.5 (0.5%)
}

async function createMerchant(centerId: string, req: CreateMerchantRequest) {
  // 1. 센터 정보 조회
  const center = await db.users.findOne({ id: centerId, role: 'center' });
  if (!center) {
    throw new Error('센터를 찾을 수 없습니다.');
  }
  
  // 2. 가맹점 계정 생성
  const merchantId = generateUUID();
  
  const merchantUser = await db.users.insert({
    id: merchantId,
    role: 'merchant',
    tenant_id: center.tenant_id, // ⭐ 핵심: 부모 센터의 tenant_id 상속
    parent_id: centerId, // 소속 센터
    username: req.username,
    email: req.email,
    password_hash: await hashPassword(req.password),
    merchant_code: req.merchantCode,
    commission_rate: req.commissionRate,
    is_active: true,
    is_approved: false // 마스터 승인 대기
  });
  
  // 3. 가맹점 지갑 생성
  const walletAddress = await generateWalletAddress();
  await db.wallets.insert({
    user_id: merchantId,
    tenant_id: center.tenant_id, // ⭐ 센터의 tenant_id 상속
    address: walletAddress,
    chain_id: 8453,
    balance: 0
  });
  
  // 4. 마스터에게 승인 요청 알림
  await sendNotificationToMaster({
    type: 'merchant_approval_request',
    centerId: centerId,
    merchantId: merchantId,
    merchantCode: req.merchantCode,
    message: `센터 "${center.center_name}"에서 가맹점 "${req.merchantCode}" 승인 요청`
  });
  
  return {
    success: true,
    merchantId: merchantId,
    merchantCode: req.merchantCode,
    status: 'pending_approval'
  };
}
```

### 3. 회원 생성 (회원 가입)

```typescript
// /api/public/signup

interface SignupRequest {
  username: string;
  email: string;
  password: string;
  referralCode: string; // 가맹점 코드 (필수)
}

async function signup(req: SignupRequest) {
  // 1. 가맹점 조회 (referral_code = merchant_code)
  const merchant = await db.users.findOne({
    role: 'merchant',
    merchant_code: req.referralCode,
    is_active: true,
    is_approved: true
  });
  
  if (!merchant) {
    throw new Error('유효하지 않은 추천 코드입니다.');
  }
  
  // 2. 소속 센터 조회
  const center = await db.users.findOne({
    id: merchant.parent_id,
    role: 'center'
  });
  
  if (!center || !center.is_active) {
    throw new Error('센터가 비활성화되었습니다.');
  }
  
  // 3. 회원 계정 생성
  const userId = generateUUID();
  
  const user = await db.users.insert({
    id: userId,
    role: 'user',
    tenant_id: center.tenant_id, // ⭐ 핵심: 센터의 tenant_id 상속
    parent_id: merchant.id, // 소속 가맹점
    username: req.username,
    email: req.email,
    password_hash: await hashPassword(req.password),
    referral_code: req.referralCode,
    is_active: true,
    is_approved: true
  });
  
  // 4. 회원 지갑 생성
  const walletAddress = await generateWalletAddress();
  await db.wallets.insert({
    user_id: userId,
    tenant_id: center.tenant_id, // ⭐ 센터의 tenant_id 상속
    address: walletAddress,
    chain_id: 8453,
    balance: 0
  });
  
  return {
    success: true,
    userId: userId,
    walletAddress: walletAddress,
    centerId: center.id,
    centerName: center.center_name
  };
}
```

### 4. 데이터 조회 (tenant_id 필터링)

```typescript
// 모든 데이터 조회 시 tenant_id 필터링 필수

// 예시 1: 센터가 소속 회원 조회
async function getCenterUsers(centerId: string) {
  const center = await db.users.findOne({ id: centerId, role: 'center' });
  
  // tenant_id 필터링 ⭐
  const users = await db.users.find({
    tenant_id: center.tenant_id,
    role: 'user',
    is_active: true
  });
  
  return users;
}

// 예시 2: 센터가 소속 트랜잭션 조회
async function getCenterTransactions(centerId: string) {
  const center = await db.users.findOne({ id: centerId, role: 'center' });
  
  // tenant_id 필터링 ⭐
  const transactions = await db.transactions.find({
    tenant_id: center.tenant_id
  }).orderBy('created_at', 'desc');
  
  return transactions;
}

// 예시 3: 가맹점이 소속 회원 조회
async function getMerchantUsers(merchantId: string) {
  const merchant = await db.users.findOne({ id: merchantId, role: 'merchant' });
  
  // tenant_id + parent_id 필터링 ⭐
  const users = await db.users.find({
    tenant_id: merchant.tenant_id, // 같은 센터
    parent_id: merchantId, // 소속 가맹점
    role: 'user',
    is_active: true
  });
  
  return users;
}
```

---

## 🌐 도메인 기반 라우팅

### 1. 미들웨어: 도메인 식별

```typescript
// /middleware/tenant-resolver.ts

export async function tenantResolver(req: Request, res: Response, next: NextFunction) {
  const hostname = req.hostname; // 예: center1.example.com
  
  // 1. 도메인으로 센터 조회
  const domainMapping = await db.domain_mappings.findOne({
    domain: hostname,
    is_active: true
  });
  
  if (!domainMapping) {
    return res.status(404).json({
      error: 'Unknown domain',
      message: '등록되지 않은 도메인입니다.'
    });
  }
  
  // 2. 센터 정보 조회
  const center = await db.users.findOne({
    id: domainMapping.center_id,
    role: 'center',
    is_active: true
  });
  
  if (!center) {
    return res.status(403).json({
      error: 'Center inactive',
      message: '센터가 비활성화되었습니다.'
    });
  }
  
  // 3. 요청 객체에 tenant 정보 추가
  req.tenant = {
    centerId: center.id,
    tenantId: center.tenant_id,
    centerName: center.center_name,
    domain: hostname,
    designTheme: center.design_theme,
    cdnUrl: domainMapping.cdn_url
  };
  
  next();
}

// 사용 예시
app.use('/api/user/*', tenantResolver);
app.use('/user/*', tenantResolver);
```

### 2. 프론트엔드: 동적 디자인 적용

```typescript
// /pages/_app.tsx (Next.js 예시)

interface TenantInfo {
  centerId: string;
  centerName: string;
  domain: string;
  logoUrl: string | null;
  templateId: string;
  designTheme: {
    colors: {
      primary: string;
      secondary: string;
      background: string;
      card: string;
      text: string;
      accent: string;
    };
    fonts: {
      heading: string;
      body: string;
    };
    layout: {
      type: string;
      cardStyle: string;
      spacing: string;
    };
  };
}

export default function App({ Component, pageProps }: AppProps) {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  
  useEffect(() => {
    // 서버에서 tenant 정보 가져오기
    fetch('/api/tenant/info')
      .then(res => res.json())
      .then(data => setTenant(data));
  }, []);
  
  useEffect(() => {
    if (tenant?.designTheme) {
      // ⭐ CSS 변수 동적 적용 (템플릿 기반)
      const { colors, fonts } = tenant.designTheme;
      
      document.documentElement.style.setProperty('--color-primary', colors.primary);
      document.documentElement.style.setProperty('--color-secondary', colors.secondary);
      document.documentElement.style.setProperty('--color-background', colors.background);
      document.documentElement.style.setProperty('--color-card', colors.card);
      document.documentElement.style.setProperty('--color-text', colors.text);
      document.documentElement.style.setProperty('--color-accent', colors.accent);
      
      // 폰트 적용
      document.documentElement.style.setProperty('--font-heading', fonts.heading);
      document.documentElement.style.setProperty('--font-body', fonts.body);
      
      // ⭐ 로고를 파비콘으로 설정
      if (tenant.logoUrl) {
        const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
        if (favicon) {
          favicon.href = tenant.logoUrl;
        }
      }
      
      // 페이지 타이틀에 센터 이름 추가
      document.title = `${tenant.centerName} - 암호화폐 관리 시스템`;
    }
  }, [tenant]);
  
  // ⭐ 템플릿별 레이아웃 컴포넌트 선택
  const LayoutComponent = getLayoutComponent(tenant?.templateId);
  
  return (
    <LayoutComponent tenant={tenant}>
      <Component {...pageProps} tenant={tenant} />
    </LayoutComponent>
  );
}

// 템플릿별 레이아웃 컴포넌트
function getLayoutComponent(templateId?: string) {
  switch (templateId) {
    case 'modern':
      return ModernLayout;
    case 'classic':
      return ClassicLayout;
    case 'minimal':
      return MinimalLayout;
    case 'gaming':
      return GamingLayout;
    case 'luxury':
      return LuxuryLayout;
    default:
      return ModernLayout;
  }
}
```

### 3. 템플릿별 레이아웃 컴포넌트

```typescript
// /components/layouts/ModernLayout.tsx
export function ModernLayout({ tenant, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* 가로 네비게이션 */}
      <header className="bg-[var(--color-card)] border-b border-gray-700">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          {/* 로고 */}
          {tenant?.logoUrl && (
            <img src={tenant.logoUrl} alt={tenant.centerName} className="h-10" />
          )}
          
          {/* 네비게이션 */}
          <nav className="flex gap-6">
            <a href="/" className="text-[var(--color-text)] hover:text-[var(--color-primary)]">홈</a>
            <a href="/trade" className="text-[var(--color-text)] hover:text-[var(--color-primary)]">거래</a>
            <a href="/wallet" className="text-[var(--color-text)] hover:text-[var(--color-primary)]">지갑</a>
            <a href="/settings" className="text-[var(--color-text)] hover:text-[var(--color-primary)]">설정</a>
          </nav>
        </div>
      </header>
      
      {/* 메인 컨텐츠 */}
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}

// /components/layouts/ClassicLayout.tsx
export function ClassicLayout({ tenant, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--color-background)] flex">
      {/* 사이드바 */}
      <aside className="w-64 bg-[var(--color-card)] border-r border-gray-700 flex flex-col">
        {/* 로고 */}
        <div className="p-6 border-b border-gray-700">
          {tenant?.logoUrl && (
            <img src={tenant.logoUrl} alt={tenant.centerName} className="h-12 mx-auto" />
          )}
        </div>
        
        {/* 네비게이션 */}
        <nav className="flex-1 p-4 space-y-2">
          <a href="/" className="block px-4 py-2 rounded hover:bg-[var(--color-primary)]">홈</a>
          <a href="/trade" className="block px-4 py-2 rounded hover:bg-[var(--color-primary)]">거래</a>
          <a href="/wallet" className="block px-4 py-2 rounded hover:bg-[var(--color-primary)]">지갑</a>
          <a href="/settings" className="block px-4 py-2 rounded hover:bg-[var(--color-primary)]">설정</a>
        </nav>
      </aside>
      
      {/* 메인 컨텐츠 */}
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}

// /components/layouts/MinimalLayout.tsx
export function MinimalLayout({ tenant, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* 중앙 헤더 */}
      <header className="text-center py-12">
        {/* 로고 */}
        {tenant?.logoUrl && (
          <img src={tenant.logoUrl} alt={tenant.centerName} className="h-16 mx-auto mb-6" />
        )}
        
        {/* 네비게이션 */}
        <nav className="flex gap-8 justify-center">
          <a href="/" className="text-[var(--color-text)] hover:text-[var(--color-primary)] border-b-2 border-transparent hover:border-[var(--color-primary)]">홈</a>
          <a href="/trade" className="text-[var(--color-text)] hover:text-[var(--color-primary)]">거래</a>
          <a href="/wallet" className="text-[var(--color-text)] hover:text-[var(--color-primary)]">지갑</a>
          <a href="/settings" className="text-[var(--color-text)] hover:text-[var(--color-primary)]">설정</a>
        </nav>
      </header>
      
      {/* 메인 컨텐츠 (중앙 정렬) */}
      <main className="max-w-4xl mx-auto px-8 py-8">
        {children}
      </main>
    </div>
  );
}

// Gaming, Luxury 레이아웃도 유사하게 구현...
```

---

## 🎨 레이아웃 템플릿 시스템

### 개요
각 센터는 **5가지 레이아웃 템플릿** 중 하나를 선택할 수 있으며, **독립적인 로고**를 업로드할 수 있습니다.

---

## 📐 5가지 레이아웃 템플릿

### 템플릿 1: Modern (모던)
**특징**: 심플하고 깔끔한 카드 레이아웃, 대시보드 중심
**적합**: 일반 비즈니스, 금융 서비스

```
┌─────────────────────────────────────┐
│ [로고]        홈  거래  지갑  설정   │ ← 가로 네비게이션
├─────────────────────────────────────┤
│                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐│
│  │ 카드 1  │ │ 카드 2  │ │ 카드 3  ││ ← 그리드 레이아웃
│  └─────────┘ └─────────┘ └─────────┘│
│                                     │
│  ┌───────────────────────────────┐  │
│  │      메인 컨텐츠 영역         │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### 템플릿 2: Classic (클래식)
**특징**: 전통적인 사이드바 레이아웃, 정보 밀도 높음
**적합**: 관리 시스템, 데이터 중심 서비스

```
┌─────┬───────────────────────────────┐
│     │ [로고]            프로필      │
│ 홈  ├───────────────────────────────┤
│ 거래│                               │
│ 지갑│  ┌─────────┐  ┌─────────┐     │
│ 설정│  │ 통계 1  │  │ 통계 2  │     │
│     │  └─────────┘  └─────────┘     │
│     │                               │
│     │  ┌─────────────────────┐      │
│  ↑  │  │  데이터 테이블      │      │
│사이드│  └─────────────────────┘      │
│바   │                               │
└─────┴───────────────────────────────┘
```

### 템플릿 3: Minimal (미니멀)
**특징**: 여백 많고 깔끔, 집중도 높음
**적합**: 프리미엄 서비스, 아트/갤러리

```
┌─────────────────────────────────────┐
│                                     │
│           [로고]                    │
│                                     │
│   홈    거래    지갑    설정        │ ← 중앙 네비게이션
│   ━━━                               │
├─────────────────────────────────────┤
│                                     │
│                                     │
│      ┌─────────────────────┐        │
│      │                     │        │
│      │   메인 컨텐츠       │        │ ← 중앙 정렬
│      │                     │        │
│      └─────────────────────┘        │
│                                     │
│                                     │
└─────────────────────────────────────┘
```

### 템플릿 4: Gaming (게이밍)
**특징**: 다이나믹한 레이아웃, 강렬한 컬러, 애니메이션
**적합**: 게임 관련 서비스, 엔터테인먼트

```
┌─────────────────────────────────────┐
│  [로고]  ━━  홈  거래  지갑  설정  ━━│ ← 네온 효과
├─────────────────────────────────────┤
│ ╔═══════╗  ┌─────────────────────┐  │
│ ║ 레벨  ║  │  ▓▓▓ 포인트 ▓▓▓    │  │
│ ║  42   ║  └─────────────────────┘  │
│ ╚═══════╝                           │
│                                     │
│  ╭─────────╮  ╭─────────╮           │
│  │ 미션 1  │  │ 미션 2  │  ← 각진 디자인
│  ╰─────────╯  ╰─────────╯           │
│                                     │
│  ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰           │ ← 프로그레스 바
└─────────────────────────────────────┘
```

### 템플릿 5: Luxury (럭셔리)
**특징**: 고급스러운 디자인, 골드/다크 컬러, 세련된 타이포
**적합**: VIP 서비스, 하이엔드 금융

```
┌─────────────────────────────────────┐
│                                     │
│          ✦ [로고] ✦                 │
│                                     │
│       ━━━━━━━━━━━━━━━━━            │
│       HOME · TRADE · WALLET         │ ← 대문자, 골드 액센트
│       ━━━━━━━━━━━━━━━━━            │
│                                     │
│    ┏━━━━━━━━━━━━━━━━━━━━━┓         │
│    ┃                     ┃         │
│    ┃   프리미엄 컨텐츠    ┃         │ ← 골드 테두리
│    ┃                     ┃         │
│    ┗━━━━━━━━━━━━━━━━━━━━━┛         │
│                                     │
└─────────────────────────────────────┘
```

---

## 🎨 디자인 테마 관리

### 1. CSS 변수 기반 테마 시스템

```css
/* /styles/globals.css */

:root {
  /* 기본 테마 (센터별로 동적 변경) */
  --color-primary: #3B82F6;
  --color-secondary: #8B5CF6;
  --color-background: #0F172A;
  --color-card: #1E293B;
  --color-text: #F1F5F9;
  --color-text-secondary: #94A3B8;
  
  /* 폰트 */
  --font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
  
  /* 간격 */
  --spacing-xs: 0.5rem;
  --spacing-sm: 1rem;
  --spacing-md: 1.5rem;
  --spacing-lg: 2rem;
  --spacing-xl: 3rem;
  
  /* 그림자 */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

/* 컴포넌트에서 사용 */
.card {
  background-color: var(--color-card);
  color: var(--color-text);
  box-shadow: var(--shadow-md);
}

.btn-primary {
  background-color: var(--color-primary);
  color: white;
}

.btn-secondary {
  background-color: var(--color-secondary);
  color: white;
}
```

### 2. 템플릿별 디자인 프리셋

```typescript
// /lib/template-presets.ts

export interface TemplatePreset {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    card: string;
    text: string;
    accent: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  layout: {
    type: 'horizontal-nav' | 'sidebar-nav' | 'centered-nav';
    cardStyle: 'rounded' | 'sharp' | 'bordered';
    spacing: 'compact' | 'normal' | 'spacious';
  };
  previewImage: string;
}

export const TEMPLATE_PRESETS: Record<string, TemplatePreset> = {
  modern: {
    id: 'modern',
    name: '모던',
    description: '심플하고 깔끔한 카드 레이아웃',
    colors: {
      primary: '#3B82F6',
      secondary: '#8B5CF6',
      background: '#0F172A',
      card: '#1E293B',
      text: '#F1F5F9',
      accent: '#06B6D4'
    },
    fonts: {
      heading: 'Pretendard',
      body: 'Pretendard'
    },
    layout: {
      type: 'horizontal-nav',
      cardStyle: 'rounded',
      spacing: 'normal'
    },
    previewImage: '/templates/modern-preview.png'
  },
  
  classic: {
    id: 'classic',
    name: '클래식',
    description: '전통적인 사이드바 레이아웃',
    colors: {
      primary: '#2563EB',
      secondary: '#7C3AED',
      background: '#111827',
      card: '#1F2937',
      text: '#F9FAFB',
      accent: '#10B981'
    },
    fonts: {
      heading: 'Pretendard',
      body: 'Pretendard'
    },
    layout: {
      type: 'sidebar-nav',
      cardStyle: 'sharp',
      spacing: 'compact'
    },
    previewImage: '/templates/classic-preview.png'
  },
  
  minimal: {
    id: 'minimal',
    name: '미니멀',
    description: '여백 많고 깔끔한 중앙 정렬',
    colors: {
      primary: '#0EA5E9',
      secondary: '#6366F1',
      background: '#FFFFFF',
      card: '#F8FAFC',
      text: '#0F172A',
      accent: '#EC4899'
    },
    fonts: {
      heading: 'Pretendard',
      body: 'Pretendard'
    },
    layout: {
      type: 'centered-nav',
      cardStyle: 'rounded',
      spacing: 'spacious'
    },
    previewImage: '/templates/minimal-preview.png'
  },
  
  gaming: {
    id: 'gaming',
    name: '게이밍',
    description: '다이나믹하고 강렬한 디자인',
    colors: {
      primary: '#F59E0B',
      secondary: '#EF4444',
      background: '#000000',
      card: '#1C1C1E',
      text: '#FFFFFF',
      accent: '#10B981'
    },
    fonts: {
      heading: 'Pretendard',
      body: 'Pretendard'
    },
    layout: {
      type: 'horizontal-nav',
      cardStyle: 'sharp',
      spacing: 'compact'
    },
    previewImage: '/templates/gaming-preview.png'
  },
  
  luxury: {
    id: 'luxury',
    name: '럭셔리',
    description: '고급스러운 골드/다크 컬러',
    colors: {
      primary: '#D97706',
      secondary: '#B45309',
      background: '#18181B',
      card: '#27272A',
      text: '#FAFAF9',
      accent: '#FCD34D'
    },
    fonts: {
      heading: 'Pretendard',
      body: 'Pretendard'
    },
    layout: {
      type: 'centered-nav',
      cardStyle: 'bordered',
      spacing: 'spacious'
    },
    previewImage: '/templates/luxury-preview.png'
  }
};

// 센터 생성 시 템플릿 선택
export function getTemplatePreset(templateId: string): TemplatePreset {
  return TEMPLATE_PRESETS[templateId] || TEMPLATE_PRESETS.modern;
}
```

### 3. 센터 로고 업로드 시스템

```typescript
// /api/center/upload-logo.ts

import { supabase } from '@/lib/supabase';

interface UploadLogoRequest {
  centerId: string;
  logoFile: File;
}

export async function uploadCenterLogo(req: UploadLogoRequest) {
  const { centerId, logoFile } = req;
  
  // 1. 파일 검증
  const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
  if (!allowedTypes.includes(logoFile.type)) {
    throw new Error('PNG, JPG, SVG, WEBP 파일만 업로드 가능합니다.');
  }
  
  const maxSize = 2 * 1024 * 1024; // 2MB
  if (logoFile.size > maxSize) {
    throw new Error('파일 크기는 2MB 이하여야 합니다.');
  }
  
  // 2. Supabase Storage에 업로드
  const fileExt = logoFile.name.split('.').pop();
  const fileName = `${centerId}/logo.${fileExt}`;
  const filePath = `center-logos/${fileName}`;
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('public-assets')
    .upload(filePath, logoFile, {
      upsert: true, // 기존 파일 덮어쓰기
      contentType: logoFile.type
    });
  
  if (uploadError) {
    throw new Error(`업로드 실패: ${uploadError.message}`);
  }
  
  // 3. Public URL 생성
  const { data: { publicUrl } } = supabase.storage
    .from('public-assets')
    .getPublicUrl(filePath);
  
  // 4. DB에 logo_url 업데이트
  await db.users.update(centerId, {
    logo_url: publicUrl
  });
  
  return {
    success: true,
    logoUrl: publicUrl
  };
}

// 로고 삭제
export async function deleteCenterLogo(centerId: string) {
  const center = await db.users.findOne({ id: centerId, role: 'center' });
  
  if (!center.logo_url) {
    throw new Error('등록된 로고가 없습니다.');
  }
  
  // 1. Storage에서 삭제
  const filePath = center.logo_url.split('/public-assets/')[1];
  await supabase.storage.from('public-assets').remove([filePath]);
  
  // 2. DB에서 제거
  await db.users.update(centerId, {
    logo_url: null
  });
  
  return { success: true };
}
```

### 4. 템플릿 미리보기 컴포넌트

```typescript
// /components/TemplateSelector.tsx

import { useState } from 'react';
import { TEMPLATE_PRESETS, TemplatePreset } from '@/lib/template-presets';

interface TemplateSelectorProps {
  selectedTemplateId?: string;
  onSelect: (templateId: string) => void;
}

export function TemplateSelector({ selectedTemplateId, onSelect }: TemplateSelectorProps) {
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);
  
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">레이아웃 템플릿 선택</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.values(TEMPLATE_PRESETS).map((template) => (
          <div
            key={template.id}
            className={`
              relative border-2 rounded-lg p-4 cursor-pointer transition-all
              ${selectedTemplateId === template.id 
                ? 'border-blue-500 bg-blue-50/10' 
                : 'border-gray-700 hover:border-gray-500'
              }
            `}
            onClick={() => onSelect(template.id)}
          >
            {/* 템플릿 미리보기 이미지 */}
            <div className="aspect-video bg-gray-800 rounded mb-3 overflow-hidden">
              <img 
                src={template.previewImage} 
                alt={template.name}
                className="w-full h-full object-cover"
              />
            </div>
            
            {/* 템플릿 정보 */}
            <div className="space-y-2">
              <h4 className="font-semibold">{template.name}</h4>
              <p className="text-sm text-gray-400">{template.description}</p>
              
              {/* 컬러 팔레트 */}
              <div className="flex gap-1">
                <div 
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: template.colors.primary }}
                  title="Primary"
                />
                <div 
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: template.colors.secondary }}
                  title="Secondary"
                />
                <div 
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: template.colors.accent }}
                  title="Accent"
                />
              </div>
            </div>
            
            {/* 선택 표시 */}
            {selectedTemplateId === template.id && (
              <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 5. 로고 업로드 컴포넌트

```typescript
// /components/LogoUploader.tsx

import { useState } from 'react';
import { uploadCenterLogo } from '@/api/center/upload-logo';

interface LogoUploaderProps {
  centerId: string;
  currentLogoUrl?: string;
  onUploadSuccess: (logoUrl: string) => void;
}

export function LogoUploader({ centerId, currentLogoUrl, onUploadSuccess }: LogoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentLogoUrl || null);
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // 미리보기
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    
    // 업로드
    try {
      setUploading(true);
      const { logoUrl } = await uploadCenterLogo({ centerId, logoFile: file });
      onUploadSuccess(logoUrl);
      toast.success('로고가 업로드되었습니다!');
    } catch (error: any) {
      toast.error(error.message);
      setPreview(currentLogoUrl || null);
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">센터 로고</h3>
      
      {/* 로고 미리보기 */}
      <div className="flex items-center gap-4">
        <div className="w-32 h-32 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center overflow-hidden bg-gray-800">
          {preview ? (
            <img src={preview} alt="Logo" className="w-full h-full object-contain" />
          ) : (
            <svg className="w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </div>
        
        {/* 업로드 버튼 */}
        <div className="flex-1">
          <label className={`
            inline-block px-4 py-2 bg-blue-600 text-white rounded cursor-pointer
            hover:bg-blue-700 transition-colors
            ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
          `}>
            {uploading ? '업로드 중...' : '로고 업로드'}
            <input 
              type="file" 
              className="hidden" 
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>
          <p className="mt-2 text-sm text-gray-400">
            PNG, JPG, SVG, WEBP (최대 2MB)
          </p>
        </div>
      </div>
    </div>
  );
}
```

---

## 🔒 보안 및 데이터 격리

### 1. Row Level Security (RLS) 비활성화 + 코드 레벨 검증

**Supabase RLS 문제로 인해 RLS는 비활성화하고, 모든 검증을 코드 레벨에서 처리합니다.**

```typescript
// /lib/security.ts

// ✅ 모든 쿼리에 tenant_id 필터링 자동 추가
export function withTenantFilter(query: any, tenantId: string) {
  return query.where('tenant_id', '=', tenantId);
}

// 예시
const users = await withTenantFilter(
  db.users.query(),
  currentTenant.tenantId
).where('role', '=', 'user').execute();

// ✅ 권한 검증 미들웨어
export async function verifyTenantAccess(
  userId: string,
  resourceTenantId: string
) {
  const user = await db.users.findOne({ id: userId });
  
  // 마스터/에이전시는 모든 센터 접근 가능
  if (user.role === 'master' || user.role === 'agency') {
    return true;
  }
  
  // 센터/가맹점/회원은 자신의 tenant_id만 접근 가능
  if (user.tenant_id !== resourceTenantId) {
    throw new Error('접근 권한이 없습니다.');
  }
  
  return true;
}
```

### 2. API 레벨 검증

```typescript
// /api/user/transactions.ts

export async function GET(req: Request) {
  const session = await getSession(req);
  const user = await db.users.findOne({ id: session.userId });
  
  // tenant_id 필터링 ⭐
  const transactions = await db.transactions.find({
    tenant_id: user.tenant_id, // 자동 필터링
    from_user_id: user.id
  });
  
  return Response.json(transactions);
}

// /api/center/users.ts

export async function GET(req: Request) {
  const session = await getSession(req);
  const center = await db.users.findOne({ 
    id: session.userId,
    role: 'center'
  });
  
  // tenant_id 필터링 ⭐
  const users = await db.users.find({
    tenant_id: center.tenant_id, // 자동 필터링
    role: 'user'
  });
  
  return Response.json(users);
}
```

---

## 📈 확장 가능성

### 1. 센터 추가 시나리오

```
현재 상황:
- 센터A (domain: centerA.com, tenant_id: uuid-A)
  └─ 가맹점 10개, 회원 1,000명

새로운 센터 추가:
- 센터B (domain: centerB.com, tenant_id: uuid-B)
  └─ 가맹점 0개, 회원 0명

결과:
- 센터A 데이터: tenant_id = uuid-A
- 센터B 데이터: tenant_id = uuid-B
- 완전히 분리됨, 서로 조회 불가능
```

### 2. 성능 최적화

```sql
-- tenant_id 인덱스로 빠른 조회
EXPLAIN ANALYZE
SELECT * FROM users WHERE tenant_id = 'uuid-A' AND role = 'user';

-- 결과: Index Scan using idx_users_tenant_id (빠름!)

-- 복합 인덱스 추가 (자주 사용하는 쿼리)
CREATE INDEX idx_users_tenant_role ON users(tenant_id, role);
CREATE INDEX idx_transactions_tenant_date ON transactions(tenant_id, created_at DESC);
```

### 3. 데이터 마이그레이션

```typescript
// 기존 데이터를 새로운 센터로 마이그레이션

async function migrateUserToNewCenter(
  userId: string,
  newCenterId: string
) {
  const newCenter = await db.users.findOne({ 
    id: newCenterId,
    role: 'center'
  });
  
  // 1. 사용자 tenant_id 업데이트
  await db.users.update(userId, {
    tenant_id: newCenter.tenant_id
  });
  
  // 2. 지갑 tenant_id 업데이트
  await db.wallets.update(
    { user_id: userId },
    { tenant_id: newCenter.tenant_id }
  );
  
  // 3. 과거 트랜잭션은 유지 (tenant_id 변경 안 함)
  // 새로운 트랜잭션부터 새로운 tenant_id 사용
  
  console.log(`User ${userId} migrated to center ${newCenterId}`);
}
```

---

## 🎯 체크리스트

### 센터 생성 시
- [ ] users 테이블에 센터 생성 (tenant_id = 자기 자신)
- [ ] domain_mappings 테이블에 도메인 등록
- [ ] wallets 테이블에 센터 지갑 생성
- [ ] 템플릿 선택 (template_id: modern, classic, minimal, gaming, luxury) ⭐
- [ ] 로고 업로드 (선택사항, logo_url 설정) ⭐
- [ ] 센터 디자인 테마 설정 (design_theme JSONB - 템플릿 기반)
- [ ] 커스텀 컬러 적용 (선택사항)
- [ ] 에이전시에 알림 발송 (소속인 경우)

### 가맹점 생성 시
- [ ] users 테이블에 가맹점 생성 (tenant_id = 부모 센터의 tenant_id)
- [ ] parent_id를 센터 id로 설정
- [ ] merchant_code 고유값 생성
- [ ] wallets 테이블에 가맹점 지갑 생성
- [ ] 마스터에게 승인 요청 알림

### 회원 가입 시
- [ ] referral_code(가맹점 코드)로 가맹점 조회
- [ ] 가맹점의 parent_id로 센터 조회
- [ ] users 테이블에 회원 생성 (tenant_id = 센터의 tenant_id)
- [ ] parent_id를 가맹점 id로 설정
- [ ] wallets 테이블에 회원 지갑 생성

### 모든 쿼리 시
- [ ] tenant_id 필터링 추가 (master/agency 제외)
- [ ] 권한 검증 (verifyTenantAccess)
- [ ] 인덱스 사용 확인 (성능)

---

## 🚀 다음 단계

1. **데이터베이스 마이그레이션 스크립트 작성**
   - 기존 users 테이블에 tenant_id, logo_url, template_id 컬럼 추가
   - domain_mappings 테이블 생성
   - 인덱스 생성

2. **센터 생성 API 구현**
   - `/api/master/create-center` 엔드포인트
   - 도메인 중복 검증
   - 지갑 자동 생성
   - 로고 업로드 처리
   - 템플릿 프리셋 적용

3. **도메인 라우팅 미들웨어 구현**
   - `tenantResolver` 미들웨어
   - 동적 디자인 테마 적용

4. **프론트엔드 멀티 테넌시 지원**
   - CSS 변수 동적 적용
   - 센터별 로고/파비콘
   - 도메인별 메타 태그
   - 5가지 레이아웃 템플릿 구현
   - 템플릿 선택 UI 구현
   - 로고 업로더 컴포넌트 구현

5. **Supabase Storage 설정**
   - `public-assets` 버킷 생성
   - `center-logos` 폴더 구조 설정
   - Public Access 권한 설정
   - 파일 용량 제한 (2MB)

6. **템플릿 미리보기 이미지 생성**
   - `/public/templates/modern-preview.png`
   - `/public/templates/classic-preview.png`
   - `/public/templates/minimal-preview.png`
   - `/public/templates/gaming-preview.png`
   - `/public/templates/luxury-preview.png`

7. **테스트 시나리오 작성**
   - 센터A와 센터B 데이터 격리 테스트
   - 권한 검증 테스트
   - 성능 테스트 (1000+ 센터)
   - 템플릿 전환 테스트
   - 로고 업로드/삭제 테스트

---

## 📸 템플릿 실제 사용 예시

### 센터 A (Gaming 템플릿)
```
도메인: game-center.example.com
템플릿: Gaming
로고: 게임 컨트롤러 아이콘
컬러: 오렌지(#F59E0B), 레드(#EF4444)
타겟: 게임 관련 가맹점, 젊은 사용자층
```

### 센터 B (Luxury 템플릿)
```
도메인: vip-center.example.com
템플릿: Luxury
로고: 골드 크라운
컬러: 골드(#D97706), 다크 그레이(#18181B)
타겟: VIP 고객, 하이엔드 서비스
```

### 센터 C (Minimal 템플릿)
```
도메인: simple-center.example.com
템플릿: Minimal
로고: 심플한 원형 로고
컬러: 블루(#0EA5E9), 화이트(#FFFFFF)
타겟: 미니멀리즘 선호 고객, 깔끔한 UI
```

---

## 🎨 센터 관리자 대시보드 (템플릿 설정 화면)

```typescript
// /pages/admin/center-settings.tsx

export function CenterSettingsPage() {
  const [center, setCenter] = useState<Center | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('modern');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-8">센터 설정</h1>
      
      {/* 템플릿 선택 */}
      <section className="mb-12">
        <TemplateSelector 
          selectedTemplateId={selectedTemplate}
          onSelect={setSelectedTemplate}
        />
      </section>
      
      {/* 로고 업로드 */}
      <section className="mb-12">
        <LogoUploader
          centerId={center?.id || ''}
          currentLogoUrl={center?.logoUrl}
          onUploadSuccess={(url) => {
            setCenter({ ...center, logoUrl: url });
            toast.success('로고가 업데이트되었습니다!');
          }}
        />
      </section>
      
      {/* 커스텀 컬러 (선택사항) */}
      <section className="mb-12">
        <h3 className="text-lg font-semibold mb-4">커스텀 컬러 (선택사항)</h3>
        <div className="grid grid-cols-3 gap-4">
          <ColorPicker label="Primary" />
          <ColorPicker label="Secondary" />
          <ColorPicker label="Accent" />
        </div>
      </section>
      
      {/* 미리보기 */}
      <section className="mb-12">
        <h3 className="text-lg font-semibold mb-4">미리보기</h3>
        <div className="border-2 border-gray-700 rounded-lg p-4 bg-gray-800">
          <LivePreview templateId={selectedTemplate} logoUrl={center?.logoUrl} />
        </div>
      </section>
      
      {/* 저장 버튼 */}
      <button 
        onClick={handleSave}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        변경사항 저장
      </button>
    </div>
  );
}
```

---

## 🗄️ Supabase Storage 구조

```
supabase-project
└── storage
    └── buckets
        └── public-assets (Public 버킷)
            └── center-logos/
                ├── {center-id-1}/
                │   └── logo.png
                ├── {center-id-2}/
                │   └── logo.svg
                ├── {center-id-3}/
                │   └── logo.jpg
                └── ...
```

### Storage Policy 설정

```sql
-- public-assets 버킷 생성
INSERT INTO storage.buckets (id, name, public)
VALUES ('public-assets', 'public-assets', true);

-- 누구나 읽기 가능
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'public-assets');

-- 인증된 사용자만 업로드 가능
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'public-assets' 
  AND auth.role() = 'authenticated'
);

-- 자기 센터 로고만 삭제 가능
CREATE POLICY "Users can delete own center logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'public-assets'
  AND (storage.foldername(name))[1] = 'center-logos'
  AND auth.uid()::text = (storage.foldername(name))[2]
);
```

---

## 📚 참고 문서

- **hierachy_version1.md**: 5단계 계층 구조 설계
- **logic_for_multiTenancy.md**: 멀티 테넌시 기본 개념
- **Supabase RLS 우회 전략**: 코드 레벨 검증 방식
- **Supabase Storage 문서**: https://supabase.com/docs/guides/storage

---

## ✅ 최종 체크리스트

### 백엔드
- [ ] Users 테이블에 logo_url, template_id 컬럼 추가
- [ ] Supabase Storage `public-assets` 버킷 생성
- [ ] 로고 업로드 API 구현 (`/api/center/upload-logo`)
- [ ] 센터 생성 API 템플릿 지원 추가
- [ ] 템플릿 프리셋 파일 생성 (`/lib/template-presets.ts`)

### 프론트엔드
- [ ] 5가지 레이아웃 컴포넌트 구현
  - [ ] ModernLayout
  - [ ] ClassicLayout
  - [ ] MinimalLayout
  - [ ] GamingLayout
  - [ ] LuxuryLayout
- [ ] TemplateSelector 컴포넌트 구현
- [ ] LogoUploader 컴포넌트 구현
- [ ] 센터 설정 페이지 구현
- [ ] 템플릿 미리보기 이미지 생성
- [ ] CSS 변수 동적 적용 로직 구현

### 테스트
- [ ] 템플릿 전환 테스트 (Modern → Luxury)
- [ ] 로고 업로드/삭제 테스트
- [ ] 다중 센터 동시 접속 테스트
- [ ] 각 템플릿별 반응형 테스트
- [ ] 성능 테스트 (로고 로딩 속도)

---

**작성 완료**: 2025-11-28  
**버전**: 1.0 (레이아웃 템플릿 & 로고 시스템 추가)  
**검토 필요**: tenant_id 인덱스 성능, 도메인 라우팅 안정성, Storage 권한 설정
