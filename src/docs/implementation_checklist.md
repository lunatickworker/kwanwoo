# Multi-Tenancy 시스템 구현 체크리스트

## 📋 문서 정보
- **작성일**: 2025-11-29
- **버전**: 2.0 (SQL 마이그레이션 완료)
- **참조 문서**: 
  - hierachy_version1.md (계층 구조 설계)
  - logic_for_multiTenancy1.md (Multi-Tenancy 구현)
  - migration_001_multi_tenancy.sql (SQL 마이그레이션 - ✅ 완료)
  - SQL_EXECUTION_GUIDE.md (SQL 실행 가이드)
- **목적**: 체계적인 구현 및 진행상황 추적
- **⚠️ 중요**: 모든 테이블의 Primary Key는 `테이블명(단수)_id` 형식
  - `users` → `user_id`
  - `wallets` → `wallet_id`
  - `transactions` → `transaction_id`
  - `domain_mappings` → `domain_id` (예외: 너무 길어서 단축)

---

## 🎯 전체 진행률

```
[✅] Phase 0: SQL 마이그레이션 (완료!) ⭐⭐⭐
[✅] Phase 1: 도메인 인프라 설정 (4/4) ⭐⭐⭐
[✅] Phase 2: Backend 코어 시스템 (14/14) ⭐⭐⭐
[✅] Phase 3: Frontend 레이아웃 시스템 (7/7) ⭐⭐⭐
[✅] Phase 4: 관리자 UI 컴포넌트 (8/8) ⭐⭐⭐
[ ] Phase 5: 통합 및 테스트 (0/10)

총 진행률: 34/42 (81%)

🎉 Phase 0 완료:
  - ✅ migration_001_multi_tenancy.sql 실행 완료
  - ✅ users, wallets, transactions 테이블 준비
  - ✅ domain_mappings 테이블 생성
  - ✅ Multi-Tenancy 인덱스 생성
  - ✅ Storage 버킷 및 Policy 설정

🎉 Phase 1 완료:
  - ✅ 마스터 플랫폼 도메인 준비 (2개 주도메인 설정 완료)
  - ✅ 센터 도메인 자동 매핑 시스템 설계 (문서 작성)
  - ✅ 역할 기반 라우팅 구현 (/App.tsx, /utils/domain.ts)
  - ✅ Vercel 배포 설정 (환경 변수 설정 완료, /utils/vercel.ts 생성)

🎉 Phase 2 완료:
  - ✅ 템플릿 프리셋 파일 생성 (/utils/template-presets.ts)
  - ✅ 환경 변수 설정 확인 (완료)
  - ✅ Supabase Client 확인 (/utils/supabase/client.ts)
  - ✅ 로고 업로드 API (/utils/api/upload-logo.ts)
  - ✅ 센터 생성 API (/utils/api/create-center.ts)
  - ✅ Tenant 정보 조회 API (/utils/api/get-tenant-info.ts)
  - ✅ 가맹점 생성 API (/utils/api/create-store.ts)
  - ✅ 회원 생성 API (/utils/api/create-user.ts)
  - ✅ 데이터 격리 쿼리 헬퍼 (/utils/api/query-helpers.ts)
  - ✅ 주도메인 변경 API (/utils/api/update-domain.ts)
  - ✅ 주도메인 차단/활성화 API (/utils/api/toggle-domain.ts)
  - ✅ 주도메인 삭제 API (/utils/api/delete-domain.ts)
  - ✅ 도메인 목록 조회 API (/utils/api/list-domains.ts)
  - ✅ Vercel API 도메인 자동 추가 (/utils/api/add-domain-to-vercel.ts)

🎉 Phase 3 완료:
  - ✅ 레이아웃 공통 Props 타입 정의 (/components/layouts/types.ts)
  - ✅ Modern 레이아웃 컴포넌트 (/components/layouts/ModernLayout.tsx)
  - ✅ Classic 레이아웃 컴포넌트 (/components/layouts/ClassicLayout.tsx)
  - ✅ Minimal 레이아웃 컴포넌트 (/components/layouts/MinimalLayout.tsx)
  - ✅ Gaming 레이아웃 컴포넌트 (/components/layouts/GamingLayout.tsx)
  - ✅ Luxury 레이아웃 컴포넌트 (/components/layouts/LuxuryLayout.tsx)
  - ✅ Layout Provider & Selector (/components/layouts/LayoutProvider.tsx)

🎉 Phase 4 완료:
  - ✅ ColorPicker 컴포넌트 (/components/admin/ColorPicker.tsx)
  - ✅ TemplateSelector 컴포넌트 (/components/admin/TemplateSelector.tsx)
  - ✅ LogoUploader 컴포넌트 (/components/admin/LogoUploader.tsx)
  - ✅ LivePreview 컴포넌트 (/components/admin/LivePreview.tsx)
  - ✅ CenterSettings 페이지 (/components/admin/CenterSettings.tsx)
  - ✅ StoreDashboard 페이지 (/components/admin/StoreDashboard.tsx)
  - ✅ RoleBasedRouter 컴포넌트 (/components/admin/RoleBasedRouter.tsx)
  - ✅ DomainManagement 페이지 (/components/admin/DomainManagement.tsx)

🔔 주요 변경사항:
  - ✅ merchant → store 용어 통일
  - ✅ 도메인 구조 명확화 (주도메인/서브도메인)
  - ✅ 가맹점은 센터와 같은 도메인, role로 구분
  - ✅ 회원 앱: 반응형 (모바일/태블릿/데스크톱)
  - ✅ 가맹점/센터: PC 형태 (데스크톱 최적화)
```

---

## ✅ Phase 0: SQL 마이그레이션 (완료!)

### 실행 완료된 SQL 작업:

```sql
✅ 1. Users 테이블 수정
   - logo_url, template_id, design_theme 컬럼 추가
   - tenant_id, role 컬럼 확인/생성

✅ 2. Domain Mappings 테이블 생성
   - 센터별 도메인 매핑 (main, admin)
   - 인덱스 생성 (domain, center_id, is_active)

✅ 3. Multi-Tenancy 인덱스 생성
   - users.tenant_id, role
   - wallets.tenant_id
   - transactions.tenant_id

✅ 4. Wallets & Transactions 테이블
   - 존재 확인 및 자동 생성
   - tenant_id 컬럼 자동 추가

✅ 5. Storage 버킷 및 Policy
   - public-assets 버킷 생성
   - Public Access Policy
   - Authenticated Upload Policy
   - Owner Delete Policy

✅ 6. 테스트 데이터
   - 마스터 계정 (master-test-uuid)
   - 센터 2개 (center-a-uuid, center-b-uuid)
   - Domain Mappings 4개 레코드
```

**파일**: `/docs/migration_001_multi_tenancy.sql`  
**가이드**: `/docs/SQL_EXECUTION_GUIDE.md`

---

## 🌐 Phase 1: 도메인 인프라 설정

### 1.1 마스터 플랫폼 도메인 준비
- [✅] **완료 여부**
- **파일**: DNS 제공자 (Cloudflare, Route53 등)
- **구현 내용**:
  ```
  1. 도메인 구입 (예: master-platform.com)
  2. DNS A 레코드 설정
     - master-platform.com → 서버 IP
  3. SSL 인증서 설치 (Let's Encrypt)
  ```
- **테스트 방법**:
  ```bash
  # DNS 확인
  nslookup master-platform.com
  dig master-platform.com
  
  # SSL 확인
  curl -I https://master-platform.com
  ```
- **의존성**: Phase 0 완료
- **관련 문서**: domain_and_access_structure.md

---

### 1.2 센터 도메인 자동 매핑 시스템 설계
- [✅] **완료 여부**
- **파일**: 문서 작성
- **구현 내용**:
  ```
  센터 생성 시:
  1. 주도메인 (예: example.com) → 회원용
  2. 서브도메인 (예: admin.example.com) → 센터/가맹점 관리자용
  
  DNS 설정:
  - 센터마다 DNS 레코드 수동 추가 OR
  - Cloudflare API 사용해서 자동 추가
  ```
- **테스트 방법**: 센터 생성 후 두 도메인 모두 접속 가능한지 확인
- **의존성**: Phase 0 완료
- **관련 문서**: domain_and_access_structure.md

---

### 1.3 역할 기반 라우팅 설계
- [✅] **완료 여부**
- **파일**: `/App.tsx` 또는 라우팅 파일
- **구현 내용**:
  ```typescript
  // 도메인과 role로 페이지 결정
  const hostname = window.location.hostname;
  const { data: domainMapping } = await supabase
    .from('domain_mappings')
    .select('*, center:users!center_id(*)')
    .eq('domain', hostname)
    .single();
  
  if (!domainMapping) {
    return <NotFoundPage />;
  }
  
  // admin.example.com에 접속했을 때
  if (domainMapping.domain_type === 'admin') {
    if (user.role === 'center') {
      return <CenterDashboard />;
    } else if (user.role === 'store') {
      return <StoreDashboard />; // ⭐ 같은 도메인, 다른 페이지
    }
  }
  
  // example.com에 접속했을 때
  if (domainMapping.domain_type === 'main') {
    return <UserApp />; // 반응형
  }
  ```
- **테스트 방법**:
  1. admin.example.com에 센터로 로그인 → CenterDashboard 표시
  2. admin.example.com에 가맹점으로 로그인 → StoreDashboard 표시
  3. example.com 접속 → UserApp 표시
- **의존성**: Phase 0 완료
- **관련 문서**: domain_and_access_structure.md

---

### 1.4 Vercel 배포 설정
- [✅] **완료 여부**
- **파일**: Vercel Dashboard
- **구현 내용**:
  ```
  1. Vercel 프로젝트 배포 (Vite+React)
  
  2. 환경 변수 설정 (Vercel Dashboard → Settings → Environment Variables):
     ✅ VITE_SUPABASE_URL (Edge Function Secrets에 이미 있음)
     ✅ VITE_SUPABASE_ANON_KEY (Edge Function Secrets에 이미 있음)
     ⭐ VITE_VERCEL_TOKEN (새로 추가 필요 - Vercel API 호출용)
     ⭐ VITE_VERCEL_PROJECT_ID (새로 추가 필요)
     
     참고: /utils/config.ts 에서 이미 VITE_ 접두사로 환경 변수 사용 중
  
  3. 센터별 도메인 추가 (자동):
     - gmscoin 대시보드에서 센터 생성
     - Backend에서 Vercel API로 도메인 자동 추가
     - 2개 도메인: example.com, admin.example.com
     
  4. DNS 설정 (수동):
     - DNS 제공자(Cloudflare 등)에서 CNAME 레코드 추가
     - example.com → cname.vercel-dns.com
     - admin.example.com → cname.vercel-dns.com
  ```
- **테스트 방법**:
  ```bash
  # 1. Vercel Token 발급
  # https://vercel.com/account/tokens → Create Token
  
  # 2. Project ID 확인
  # Vercel Dashboard → Project → Settings → General → Project ID
  
  # 3. 환경 변수 추가 (Vercel Dashboard)
  VITE_VERCEL_TOKEN=vercel_token_here
  VITE_VERCEL_PROJECT_ID=prj_xxx
  
  # 4. 센터 생성 후 자동 도메인 추가 확인
  # Vercel Dashboard → Domains → example.com, admin.example.com 자동 추가됨
  
  # 5. DNS 설정 후 접속 테스트
  curl -I https://example.com
  curl -I https://admin.example.com
  ```
- **의존성**: Phase 0 완료, 2.15 (Vercel API 도메인 자동 추가) 완료
- **관련 문서**: VERCEL_DEPLOYMENT.md

---

## 🔧 Phase 2: Backend 코어 시스템

### 2.1 템플릿 프리셋 파일 생성
- [✅] **완료 여부**
- **파일**: `/utils/template-presets.ts`
- **구현 내용**:
  ```typescript
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
      name: 'Modern',
      description: '깔끔하고 현대적인 디자인',
      colors: {
        primary: '#3B82F6',
        secondary: '#8B5CF6',
        background: '#0F172A',
        card: '#1E293B',
        text: '#F1F5F9',
        accent: '#06B6D4'
      },
      fonts: {
        heading: 'Inter',
        body: 'Inter'
      },
      layout: {
        type: 'sidebar-nav',
        cardStyle: 'rounded',
        spacing: 'normal'
      },
      previewImage: '/templates/modern.png'
    },
    classic: {
      id: 'classic',
      name: 'Classic',
      description: '전통적이고 안정적인 디자인',
      colors: {
        primary: '#1F2937',
        secondary: '#4B5563',
        background: '#FFFFFF',
        card: '#F9FAFB',
        text: '#111827',
        accent: '#3B82F6'
      },
      fonts: {
        heading: 'Georgia',
        body: 'Arial'
      },
      layout: {
        type: 'horizontal-nav',
        cardStyle: 'bordered',
        spacing: 'spacious'
      },
      previewImage: '/templates/classic.png'
    },
    minimal: {
      id: 'minimal',
      name: 'Minimal',
      description: '미니멀하고 심플한 디자인',
      colors: {
        primary: '#000000',
        secondary: '#6B7280',
        background: '#FFFFFF',
        card: '#FFFFFF',
        text: '#000000',
        accent: '#EF4444'
      },
      fonts: {
        heading: 'Helvetica',
        body: 'Helvetica'
      },
      layout: {
        type: 'centered-nav',
        cardStyle: 'sharp',
        spacing: 'compact'
      },
      previewImage: '/templates/minimal.png'
    },
    gaming: {
      id: 'gaming',
      name: 'Gaming',
      description: '게이밍 스타일의 역동적인 디자인',
      colors: {
        primary: '#10B981',
        secondary: '#F59E0B',
        background: '#000000',
        card: '#1A1A1A',
        text: '#FFFFFF',
        accent: '#EF4444'
      },
      fonts: {
        heading: 'Orbitron',
        body: 'Roboto'
      },
      layout: {
        type: 'sidebar-nav',
        cardStyle: 'sharp',
        spacing: 'compact'
      },
      previewImage: '/templates/gaming.png'
    },
    luxury: {
      id: 'luxury',
      name: 'Luxury',
      description: '고급스럽고 우아한 디자인',
      colors: {
        primary: '#D4AF37',
        secondary: '#8B7355',
        background: '#1C1917',
        card: '#292524',
        text: '#F5F5F4',
        accent: '#D4AF37'
      },
      fonts: {
        heading: 'Playfair Display',
        body: 'Lato'
      },
      layout: {
        type: 'centered-nav',
        cardStyle: 'rounded',
        spacing: 'spacious'
      },
      previewImage: '/templates/luxury.png'
    }
  };
  ```
- **테스트 방법**:
  ```typescript
  import { TEMPLATE_PRESETS } from '@/lib/template-presets';
  console.log(TEMPLATE_PRESETS.modern);
  ```
- **의존성**: Phase 0 완료
- **관련 문서**: implementation_checklist.md

---

### 2.2 환경 변수 설정 확인
- [✅] **완료 여부**
- **파일**: Vercel Dashboard (Environment Variables)
- **구현 내용**:
  ```
  ✅ 이미 설정됨:
  - VITE_SUPABASE_URL (Edge Function Secrets에 있음)
  - VITE_SUPABASE_ANON_KEY (Edge Function Secrets에 있음)
  
  ⭐ 추가 필요:
  - VITE_VERCEL_TOKEN (Vercel API 토큰)
  - VITE_VERCEL_PROJECT_ID (Vercel 프로젝트 ID)
  
  참고: 
  - Vite+React 환경에서는 VITE_ 접두사 필수
  - /utils/config.ts에서 import.meta.env로 접근
  - Edge Function Secrets는 서버 사이드에만 있으므로 
    클라이언트 앱을 위해서는 Vercel 환경 변수에도 추가 필요
  ```
- **테스트 방법**:
  ```bash
  # Vercel Dashboard 확인
  # Settings → Environment Variables → VITE_로 시작하는 변수 확인
  
  # 로컬 개발 시 (.env 파일 사용)
  echo $VITE_SUPABASE_URL  # 로컬에서는 이렇게 확인 불가
  # 대신 코드에서 확인:
  console.log(import.meta.env.VITE_SUPABASE_URL)
  ```
- **의존성**: Phase 0 완료
- **관련 문서**: /utils/config.ts, /guidelines/env.md

---

### 2.3 Supabase Client 확인
- [✅] **완료 여부**
- **파일**: `/utils/supabase/client.ts` (이미 존재)
- **구현 내용**:
  ```typescript
  // ✅ 이미 /utils/supabase/client.ts에 구현되어 있음
  // 확인만 하면 됨:
  
  import { createClient } from '@supabase/supabase-js';
  import { SUPABASE_CONFIG } from '@/utils/config';
  
  export const supabase = createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.anonKey
  );
  
  // 참고: /utils/config.ts에서 환경 변수 관리 중
  // VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY 사용
  ```
- **테스트 방법**:
  ```typescript
  import { supabase } from '@/utils/supabase/client';
  
  // 간단한 쿼리 테스트
  const { data, error } = await supabase
    .from('users')
    .select('user_id')  // ⚠️ user_id 사용
    .limit(1);
  
  console.log('Supabase 연결 확인:', data ? '성공' : error);
  ```
- **의존성**: 2.2 완료
- **관련 문서**: /utils/supabase/client.ts (이미 존재)

---

### 2.4 로고 업로드 API 함수
- [✅] **완료 여부**
- **파일**: `/lib/api/upload-logo.ts`
- **구현 내용**:
  ```typescript
  import { supabase } from '@/lib/supabase';
  
  export interface UploadLogoRequest {
    centerId: string;
    file: File;
  }
  
  export interface UploadLogoResponse {
    success: boolean;
    logoUrl?: string;
    error?: string;
  }
  
  export async function uploadCenterLogo(
    request: UploadLogoRequest
  ): Promise<UploadLogoResponse> {
    try {
      const { centerId, file } = request;
      
      // 파일 유효성 검사
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        return {
          success: false,
          error: '이미지 파일만 업로드 가능합니다 (PNG, JPG, WEBP)'
        };
      }
      
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        return {
          success: false,
          error: '파일 크기는 5MB 이하여야 합니다'
        };
      }
      
      // 기존 로고 조회 (있으면 삭제)
      const { data: existingCenter } = await supabase
        .from('users')
        .select('logo_url')
        .eq('user_id', centerId)  // ⚠️ user_id 사용
        .single();
      
      if (existingCenter?.logo_url) {
        const oldPath = existingCenter.logo_url.split('/').pop();
        if (oldPath) {
          await supabase.storage
            .from('public-assets')
            .remove([`center-logos/${centerId}/${oldPath}`]);
        }
      }
      
      // 새 로고 업로드
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `center-logos/${centerId}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('public-assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (uploadError) {
        return {
          success: false,
          error: uploadError.message
        };
      }
      
      // Public URL 생성
      const { data: publicUrlData } = supabase.storage
        .from('public-assets')
        .getPublicUrl(filePath);
      
      const logoUrl = publicUrlData.publicUrl;
      
      // DB 업데이트
      const { error: updateError } = await supabase
        .from('users')
        .update({ logo_url: logoUrl })
        .eq('user_id', centerId);  // ⚠️ user_id 사용
      
      if (updateError) {
        return {
          success: false,
          error: updateError.message
        };
      }
      
      return {
        success: true,
        logoUrl
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '로고 업로드 실패'
      };
    }
  }
  
  // 로고 삭제 함수
  export async function deleteCenterLogo(centerId: string): Promise<UploadLogoResponse> {
    try {
      // 기존 로고 조회
      const { data: center } = await supabase
        .from('users')
        .select('logo_url')
        .eq('user_id', centerId)  // ⚠️ user_id 사용
        .single();
      
      if (!center?.logo_url) {
        return {
          success: false,
          error: '삭제할 로고가 없습니다'
        };
      }
      
      // Storage에서 삭제
      const filePath = center.logo_url.split('/').slice(-3).join('/');
      await supabase.storage
        .from('public-assets')
        .remove([filePath]);
      
      // DB에서 제거
      const { error: updateError } = await supabase
        .from('users')
        .update({ logo_url: null })
        .eq('user_id', centerId);  // ⚠️ user_id 사용
      
      if (updateError) {
        return {
          success: false,
          error: updateError.message
        };
      }
      
      return {
        success: true
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '로고 삭제 실패'
      };
    }
  }
  ```
- **테스트 방법**:
  ```typescript
  const file = new File(['test'], 'test.png', { type: 'image/png' });
  const result = await uploadCenterLogo({
    centerId: 'center-a-uuid',
    file
  });
  console.log(result);
  ```
- **의존성**: 2.3 완료, Phase 0 완료 (Storage 버킷)
- **관련 문서**: Supabase Storage Documentation

---

### 2.5 센터 생성 API - Part 1 (기본 로직)
- [✅] **완료 여부**
- **파일**: `/lib/api/create-center.ts`
- **구현 내용**:
  ```typescript
  import { supabase } from '@/lib/supabase';
  import { v4 as uuidv4 } from 'uuid';
  
  export interface CreateCenterRequest {
    centerName: string;
    domain: string;
    username: string;
    email: string;
    password: string;
    templateId?: 'modern' | 'classic' | 'minimal' | 'gaming' | 'luxury';
    logoFile?: File;
  }
  
  export interface CreateCenterResponse {
    success: boolean;
    centerId?: string;
    error?: string;
  }
  
  export async function createCenter(
    request: CreateCenterRequest
  ): Promise<CreateCenterResponse> {
    try {
      const { centerName, domain, username, email, password, templateId, logoFile } = request;
      
      // 1. 유효성 검사
      if (!centerName || !domain || !username || !email || !password) {
        return {
          success: false,
          error: '필수 필드를 모두 입력해주세요'
        };
      }
      
      // 도메인 중복 확인
      const { data: existingDomain } = await supabase
        .from('domain_mappings')
        .select('domain_id')  // ⚠️ domain_id 사용
        .eq('domain', domain)
        .single();
      
      if (existingDomain) {
        return {
          success: false,
          error: '이미 사용 중인 도메인입니다'
        };
      }
      
      // username 중복 확인
      const { data: existingUser } = await supabase
        .from('users')
        .select('user_id')  // ⚠️ user_id 사용
        .eq('username', username)
        .single();
      
      if (existingUser) {
        return {
          success: false,
          error: '이미 사용 중인 사용자명입니다'
        };
      }
      
      // email 중복 확인
      const { data: existingEmail } = await supabase
        .from('users')
        .select('user_id')  // ⚠️ user_id 사용
        .eq('email', email)
        .single();
      
      if (existingEmail) {
        return {
          success: false,
          error: '이미 사용 중인 이메일입니다'
        };
      }
      
      // Part 2에서 계속...
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '센터 생성 실패'
      };
    }
  }
  ```
- **테스트 방법**:
  ```typescript
  const result = await createCenter({
    centerName: 'Test Center',
    domain: 'test.example.com',
    username: 'test_center',
    email: 'test@example.com',
    password: 'password123',
    templateId: 'modern'
  });
  console.log(result);
  ```
- **의존성**: 2.3 완료
- **관련 문서**: logic_for_multiTenancy1.md

---

### 2.6 센터 생성 API - Part 2 (DB 삽입 & 로고)
- [✅] **완료 여부**
- **파일**: `/lib/api/create-center.ts` (계속)
- **구현 내용**:
  ```typescript
  // Part 1에서 계속...
  
      // 2. 센터 ID 생성
      const centerId = uuidv4();
      
      // 3. 비밀번호 해싱 (bcrypt 사용)
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      
      // 4. 로고 업로드 (있을 경우)
      let logoUrl = null;
      if (logoFile) {
        const { success, logoUrl: uploadedUrl, error: uploadError } = await uploadCenterLogo({
          centerId,
          file: logoFile
        });
        
        if (!success) {
          return {
            success: false,
            error: uploadError || '로고 업로드 실패'
          };
        }
        
        logoUrl = uploadedUrl;
      }
      
      // 5. Users 테이블에 센터 생성
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          user_id: centerId,  // ⚠️ user_id 사용
          role: 'center',
          tenant_id: centerId, // ⭐ 센터는 자기 자신이 tenant_id
          username,
          email,
          password_hash: passwordHash,
          center_name: centerName,
          domain,
          template_id: templateId || 'modern',
          logo_url: logoUrl,
          created_at: new Date().toISOString()
        });
      
      if (insertError) {
        return {
          success: false,
          error: insertError.message
        };
      }
      
      // 6. Domain Mappings 자동 생성 (2개)
      const domainMappings = [
        {
          domain: domain, // example.com
          center_id: centerId,
          domain_type: 'main', // 회원용
          is_active: true
        },
        {
          domain: `admin.${domain}`, // admin.example.com
          center_id: centerId,
          domain_type: 'admin', // 센터/가맹점 관리자용
          is_active: true
        }
      ];
      
      const { error: mappingError } = await supabase
        .from('domain_mappings')
        .insert(domainMappings);
      
      if (mappingError) {
        // 롤백: 생성된 센터 삭제
        await supabase.from('users').delete().eq('user_id', centerId);  // ⚠️ user_id 사용
        
        return {
          success: false,
          error: mappingError.message
        };
      }
      
      // 7. 성공
      return {
        success: true,
        centerId
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '센터 생성 실패'
      };
    }
  }
  ```
- **테스트 방법**:
  ```typescript
  // 로고 포함 테스트
  const file = new File(['logo'], 'logo.png', { type: 'image/png' });
  const result = await createCenter({
    centerName: 'Premium Center',
    domain: 'premium.example.com',
    username: 'premium_center',
    email: 'premium@example.com',
    password: 'secure_password',
    templateId: 'luxury',
    logoFile: file
  });
  console.log(result);
  
  // Domain Mappings 확인
  const { data: mappings } = await supabase
    .from('domain_mappings')
    .select('*')
    .eq('center_id', result.centerId);
  console.log('Mappings:', mappings);
  // 예상 결과:
  // [
  //   { domain: 'premium.example.com', domain_type: 'main' },
  //   { domain: 'admin.premium.example.com', domain_type: 'admin' }
  // ]
  ```
- **의존성**: 2.4, 2.5 완료
- **관련 문서**: logic_for_multiTenancy1.md

---

### 2.7 Tenant 정보 조회 API
- [✅] **완료 여부**
- **파일**: `/lib/api/get-tenant-info.ts`
- **구현 내용**:
  ```typescript
  import { supabase } from '@/lib/supabase';
  
  export interface TenantInfo {
    id: string;
    centerName: string;
    domain: string;
    logoUrl: string | null;
    templateId: string;
    designTheme: any;
  }
  
  export async function getTenantInfo(domain: string): Promise<TenantInfo | null> {
    try {
      // 1. Domain Mapping 조회
      const { data: mapping, error: mappingError } = await supabase
        .from('domain_mappings')
        .select('center_id')
        .eq('domain', domain)
        .eq('is_active', true)
        .single();
      
      if (mappingError || !mapping) {
        return null;
      }
      
      // 2. 센터 정보 조회
      const { data: center, error: centerError } = await supabase
        .from('users')
        .select('id, center_name, domain, logo_url, template_id, design_theme')
        .eq('id', mapping.center_id)
        .eq('role', 'center')
        .single();
      
      if (centerError || !center) {
        return null;
      }
      
      return {
        id: center.id,
        centerName: center.center_name,
        domain: center.domain,
        logoUrl: center.logo_url,
        templateId: center.template_id || 'modern',
        designTheme: center.design_theme
      };
      
    } catch (error) {
      console.error('Tenant 정보 조회 실패:', error);
      return null;
    }
  }
  
  // 도메인으로 센터 ID 조회 (간단한 버전)
  export async function getCenterIdByDomain(domain: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('domain_mappings')
        .select('center_id')
        .eq('domain', domain)
        .eq('is_active', true)
        .single();
      
      if (error || !data) {
        return null;
      }
      
      return data.center_id;
    } catch (error) {
      return null;
    }
  }
  ```
- **테스트 방법**:
  ```typescript
  // 회원용 도메인으로 조회
  const tenant1 = await getTenantInfo('example.com');
  console.log(tenant1);
  // { id: 'center-a-uuid', centerName: 'Center A', ... }
  
  // 관리자용 도메인으로 조회
  const tenant2 = await getTenantInfo('admin.example.com');
  console.log(tenant2);
  // { id: 'center-a-uuid', centerName: 'Center A', ... }
  // → 같은 센터 정보 반환!
  
  // 센터 ID만 조회
  const centerId = await getCenterIdByDomain('example.com');
  console.log(centerId); // 'center-a-uuid'
  ```
- **의존성**: 2.3 완료, Phase 0 완료 (domain_mappings 테이블)
- **관련 문서**: logic_for_multiTenancy1.md

---

### 2.8 가맹점 생성 API (tenant_id 상속)
- [✅] **완료 여부**
- **파일**: `/lib/api/create-store.ts`
- **구현 내용**:
  ```typescript
  import { supabase } from '@/lib/supabase';
  import { v4 as uuidv4 } from 'uuid';
  
  export interface CreateStoreRequest {
    centerId: string; // 상위 센터 ID
    storeName: string;
    storeCode: string; // 가맹점 고유 코드
    username: string;
    email: string;
    password: string;
  }
  
  export interface CreateStoreResponse {
    success: boolean;
    storeId?: string;
    error?: string;
  }
  
  export async function createStore(
    request: CreateStoreRequest
  ): Promise<CreateStoreResponse> {
    try {
      const { centerId, storeName, storeCode, username, email, password } = request;
      
      // 1. 센터 존재 확인 및 tenant_id 조회
      const { data: center, error: centerError } = await supabase
        .from('users')
        .select('id, tenant_id, role')
        .eq('id', centerId)
        .eq('role', 'center')
        .single();
      
      if (centerError || !center) {
        return {
          success: false,
          error: '센터를 찾을 수 없습니다'
        };
      }
      
      // 2. storeCode 중복 확인 (같은 tenant 내에서)
      const { data: existingStore } = await supabase
        .from('users')
        .select('id')
        .eq('store_code', storeCode)
        .eq('tenant_id', center.tenant_id)
        .single();
      
      if (existingStore) {
        return {
          success: false,
          error: '이미 사용 중인 가맹점 코드입니다'
        };
      }
      
      // 3. username 중복 확인
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single();
      
      if (existingUser) {
        return {
          success: false,
          error: '이미 사용 중인 사용자명입니다'
        };
      }
      
      // 4. 비밀번호 해싱
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      
      // 5. 가맹점 생성
      const storeId = uuidv4();
      
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: storeId,
          role: 'store',
          tenant_id: center.tenant_id, // ⭐ 센터의 tenant_id 상속
          parent_id: centerId, // 상위 센터 ID
          username,
          email,
          password_hash: passwordHash,
          store_name: storeName,
          store_code: storeCode,
          created_at: new Date().toISOString()
        });
      
      if (insertError) {
        return {
          success: false,
          error: insertError.message
        };
      }
      
      return {
        success: true,
        storeId
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '가맹점 생성 실패'
      };
    }
  }
  ```
- **테스트 방법**:
  ```typescript
  const result = await createStore({
    centerId: 'center-a-uuid',
    storeName: 'Store 1',
    storeCode: 'STORE001',
    username: 'store1_admin',
    email: 'store1@example.com',
    password: 'password123'
  });
  console.log(result);
  
  // tenant_id 상속 확인
  const { data: store } = await supabase
    .from('users')
    .select('id, tenant_id, parent_id, role')
    .eq('id', result.storeId)
    .single();
  
  console.log(store);
  // {
  //   id: 'store-uuid',
  //   tenant_id: 'center-a-uuid', // ⭐ 센터의 tenant_id와 동일
  //   parent_id: 'center-a-uuid',
  //   role: 'store'
  // }
  ```
- **의존성**: 2.3 완료
- **관련 문서**: logic_for_multiTenancy1.md - tenant_id 상속

---

### 2.9 회원 생성 API (tenant_id 상속)
- [✅] **완료 여부**
- **파일**: `/lib/api/create-user.ts`
- **구현 내용**:
  ```typescript
  import { supabase } from '@/lib/supabase';
  import { v4 as uuidv4 } from 'uuid';
  
  export interface CreateUserRequest {
    centerId: string; // 또는 storeId
    parentId: string; // 센터 또는 가맹점 ID
    parentType: 'center' | 'store';
    username: string;
    email: string;
    password: string;
    phoneNumber?: string;
  }
  
  export interface CreateUserResponse {
    success: boolean;
    userId?: string;
    error?: string;
  }
  
  export async function createUser(
    request: CreateUserRequest
  ): Promise<CreateUserResponse> {
    try {
      const { parentId, parentType, username, email, password, phoneNumber } = request;
      
      // 1. 상위 엔티티(센터 또는 가맹점) 조회
      const { data: parent, error: parentError } = await supabase
        .from('users')
        .select('id, tenant_id, role')
        .eq('id', parentId)
        .eq('role', parentType)
        .single();
      
      if (parentError || !parent) {
        return {
          success: false,
          error: `${parentType === 'center' ? '센터' : '가맹점'}를 찾을 수 없습니다`
        };
      }
      
      // 2. username 중복 확인 (같은 tenant 내에서)
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .eq('tenant_id', parent.tenant_id)
        .single();
      
      if (existingUser) {
        return {
          success: false,
          error: '이미 사용 중인 사용자명입니다'
        };
      }
      
      // 3. 비밀번호 해싱
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      
      // 4. 회원 생성
      const userId = uuidv4();
      
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: userId,
          role: 'user',
          tenant_id: parent.tenant_id, // ⭐ 상위의 tenant_id 상속
          parent_id: parentId,
          username,
          email,
          password_hash: passwordHash,
          phone_number: phoneNumber,
          created_at: new Date().toISOString()
        });
      
      if (insertError) {
        return {
          success: false,
          error: insertError.message
        };
      }
      
      // 5. Wallet 자동 생성 (tenant_id 포함)
      await supabase
        .from('wallets')
        .insert({
          id: uuidv4(),
          user_id: userId,
          tenant_id: parent.tenant_id, // ⭐ 같은 tenant_id
          balance: 0,
          currency: 'KRW'
        });
      
      return {
        success: true,
        userId
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '회원 생성 실패'
      };
    }
  }
  ```
- **테스트 방법**:
  ```typescript
  // 센터에 회원 생성
  const result1 = await createUser({
    centerId: 'center-a-uuid',
    parentId: 'center-a-uuid',
    parentType: 'center',
    username: 'user1',
    email: 'user1@example.com',
    password: 'password123',
    phoneNumber: '010-1234-5678'
  });
  console.log(result1);
  
  // 가맹점에 회원 생성
  const result2 = await createUser({
    centerId: 'center-a-uuid',
    parentId: 'store-uuid',
    parentType: 'store',
    username: 'user2',
    email: 'user2@example.com',
    password: 'password123'
  });
  
  // tenant_id 상속 확인
  const { data: user } = await supabase
    .from('users')
    .select('id, tenant_id, parent_id, role')
    .eq('id', result1.userId)
    .single();
  
  console.log(user);
  // {
  //   id: 'user-uuid',
  //   tenant_id: 'center-a-uuid', // ⭐ 센터의 tenant_id와 동일
  //   parent_id: 'center-a-uuid' or 'store-uuid',
  //   role: 'user'
  // }
  
  // Wallet도 같은 tenant_id
  const { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', result1.userId)
    .single();
  
  console.log(wallet);
  // { tenant_id: 'center-a-uuid', ... }
  ```
- **의존성**: 2.3 완료, Phase 0 완료 (wallets 테이블)
- **관련 문서**: logic_for_multiTenancy1.md - tenant_id 상속

---

### 2.10 데이터 격리 쿼리 헬퍼 함수
- [✅] **완료 여부**
- **파일**: `/lib/api/query-helpers.ts`
- **구현 내용**:
  ```typescript
  import { supabase } from '@/lib/supabase';
  
  /**
   * Tenant별 데이터 격리를 위한 쿼리 헬퍼
   */
  
  // 특정 tenant의 모든 회원 조회
  export async function getUsersByTenant(tenantId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('role', 'user');
    
    return { data, error };
  }
  
  // 특정 tenant의 모든 가맹점 조회
  export async function getStoresByTenant(tenantId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('role', 'store');
    
    return { data, error };
  }
  
  // 특정 tenant의 모든 트랜잭션 조회
  export async function getTransactionsByTenant(tenantId: string) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    
    return { data, error };
  }
  
  // 특정 tenant의 모든 지갑 조회
  export async function getWalletsByTenant(tenantId: string) {
    const { data, error } = await supabase
      .from('wallets')
      .select('*, user:users!user_id(*)')
      .eq('tenant_id', tenantId);
    
    return { data, error };
  }
  
  // 특정 회원의 트랜잭션 조회 (tenant_id로 격리)
  export async function getUserTransactions(userId: string, tenantId: string) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId) // ⭐ 추가 보안
      .order('created_at', { ascending: false });
    
    return { data, error };
  }
  
  // Tenant 통계 조회
  export async function getTenantStats(tenantId: string) {
    try {
      // 회원 수
      const { count: userCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('role', 'user');
      
      // 가맹점 수
      const { count: storeCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('role', 'store');
      
      // 총 거래액
      const { data: transactions } = await supabase
        .from('transactions')
        .select('amount')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed');
      
      const totalAmount = transactions?.reduce((sum, tx) => sum + tx.amount, 0) || 0;
      
      return {
        userCount: userCount || 0,
        storeCount: storeCount || 0,
        totalAmount
      };
    } catch (error) {
      return {
        userCount: 0,
        storeCount: 0,
        totalAmount: 0
      };
    }
  }
  ```
- **테스트 방법**:
  ```typescript
  // Center A의 모든 회원 조회
  const { data: usersA } = await getUsersByTenant('center-a-uuid');
  console.log('Center A 회원:', usersA);
  
  // Center B의 모든 회원 조회
  const { data: usersB } = await getUsersByTenant('center-b-uuid');
  console.log('Center B 회원:', usersB);
  
  // 결과: 완전히 다른 회원 목록! (데이터 격리 확인)
  
  // Center A 통계
  const statsA = await getTenantStats('center-a-uuid');
  console.log(statsA);
  // { userCount: 50, storeCount: 5, totalAmount: 1000000 }
  ```
- **의존성**: 2.3 완료
- **관련 문서**: logic_for_multiTenancy1.md - 데이터 격리

---

### 2.11 주도메인 변경 API ⭐ 신규
- [✅] **완료 여부**
- **파일**: `/lib/api/update-domain.ts`
- **구현 내용**:
  ```typescript
  import { supabase } from '@/lib/supabase';
  
  export interface UpdateDomainRequest {
    centerId: string;
    newDomain: string;
  }
  
  export interface UpdateDomainResponse {
    success: boolean;
    error?: string;
  }
  
  export async function updateCenterDomain(
    request: UpdateDomainRequest
  ): Promise<UpdateDomainResponse> {
    try {
      const { centerId, newDomain } = request;
      
      // 1. 새 도메인 중복 확인
      const { data: existingDomain } = await supabase
        .from('domain_mappings')
        .select('id')
        .eq('domain', newDomain)
        .single();
      
      if (existingDomain) {
        return {
          success: false,
          error: '이미 사용 중인 도메인입니다'
        };
      }
      
      // 2. 기존 도메인 조회
      const { data: oldMappings } = await supabase
        .from('domain_mappings')
        .select('*')
        .eq('center_id', centerId);
      
      if (!oldMappings || oldMappings.length === 0) {
        return {
          success: false,
          error: '센터를 찾을 수 없습니다'
        };
      }
      
      // 3. 기존 domain_mappings 삭제
      await supabase
        .from('domain_mappings')
        .delete()
        .eq('center_id', centerId);
      
      // 4. 새 domain_mappings 생성
      const newMappings = [
        {
          domain: newDomain,
          center_id: centerId,
          domain_type: 'main',
          is_active: true
        },
        {
          domain: `admin.${newDomain}`,
          center_id: centerId,
          domain_type: 'admin',
          is_active: true
        }
      ];
      
      const { error: insertError } = await supabase
        .from('domain_mappings')
        .insert(newMappings);
      
      if (insertError) {
        return {
          success: false,
          error: insertError.message
        };
      }
      
      // 5. users 테이블의 domain 업데이트
      await supabase
        .from('users')
        .update({ domain: newDomain })
        .eq('id', centerId);
      
      return {
        success: true
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '도메인 변경 실패'
      };
    }
  }
  ```
- **테스트 방법**:
  ```typescript
  const result = await updateCenterDomain({
    centerId: 'center-a-uuid',
    newDomain: 'new-example.com'
  });
  console.log(result);
  
  // domain_mappings 확인
  const { data: mappings } = await supabase
    .from('domain_mappings')
    .select('*')
    .eq('center_id', 'center-a-uuid');
  
  console.log(mappings);
  // [
  //   { domain: 'new-example.com', domain_type: 'main' },
  //   { domain: 'admin.new-example.com', domain_type: 'admin' }
  // ]
  ```
- **의존성**: 2.3 완료
- **관련 문서**: domain_and_access_structure.md

---

### 2.12 주도메인 차단/활성화 API ⭐ 신규
- [✅] **완료 여부**
- **파일**: `/lib/api/toggle-domain.ts`
- **구현 내용**:
  ```typescript
  import { supabase } from '@/lib/supabase';
  
  export async function toggleDomainStatus(centerId: string, isActive: boolean) {
    try {
      const { error } = await supabase
        .from('domain_mappings')
        .update({ is_active: isActive })
        .eq('center_id', centerId);
      
      if (error) {
        return {
          success: false,
          error: error.message
        };
      }
      
      return {
        success: true
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '도메인 상태 변경 실패'
      };
    }
  }
  ```
- **테스트 방법**:
  ```typescript
  // 차단
  await toggleDomainStatus('center-a-uuid', false);
  
  // 활성화
  await toggleDomainStatus('center-a-uuid', true);
  ```
- **의존성**: 2.3 완료
- **관련 문서**: domain_and_access_structure.md

---

### 2.13 주도메인 삭제 API ⭐ 신규
- [✅] **완료 여부**
- **파일**: `/lib/api/delete-domain.ts`
- **구현 내용**:
  ```typescript
  import { supabase } from '@/lib/supabase';
  
  export async function deleteCenterDomain(centerId: string) {
    try {
      // 1. 연결된 가맹점/회원 확인
      const { count: storeCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', centerId)
        .eq('role', 'store');
      
      const { count: userCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', centerId)
        .eq('role', 'user');
      
      if ((storeCount || 0) > 0 || (userCount || 0) > 0) {
        return {
          success: false,
          error: '연결된 가맹점 또는 회원이 있어 삭제할 수 없습니다'
        };
      }
      
      // 2. domain_mappings 삭제 (CASCADE로 자동 삭제됨)
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', centerId);
      
      if (error) {
        return {
          success: false,
          error: error.message
        };
      }
      
      return {
        success: true
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '도메인 삭제 실패'
      };
    }
  }
  ```
- **테스트 방법**:
  ```typescript
  const result = await deleteCenterDomain('center-empty-uuid');
  console.log(result);
  ```
- **의존성**: 2.3 완료
- **관련 문서**: domain_and_access_structure.md

---

### 2.14 도메인 목록 조회 API ⭐ 신규
- [✅] **완료 여부**
- **파일**: `/lib/api/list-domains.ts`
- **구현 내용**:
  ```typescript
  import { supabase } from '@/lib/supabase';
  
  export async function listAllDomains() {
    try {
      const { data, error } = await supabase
        .from('domain_mappings')
        .select(`
          *,
          center:users!center_id(
            id,
            center_name,
            template_id,
            logo_url,
            created_at
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) {
        return {
          success: false,
          error: error.message,
          data: []
        };
      }
      
      // 센터별로 그룹화
      const grouped = data.reduce((acc: any, mapping: any) => {
        const centerId = mapping.center_id;
        if (!acc[centerId]) {
          acc[centerId] = {
            centerId,
            centerName: mapping.center.center_name,
            templateId: mapping.center.template_id,
            logoUrl: mapping.center.logo_url,
            createdAt: mapping.center.created_at,
            domains: []
          };
        }
        acc[centerId].domains.push({
          id: mapping.id,
          domain: mapping.domain,
          domainType: mapping.domain_type,
          isActive: mapping.is_active
        });
        return acc;
      }, {});
      
      return {
        success: true,
        data: Object.values(grouped)
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '도메인 목록 조회 실패',
        data: []
      };
    }
  }
  ```
- **테스트 방법**:
  ```typescript
  const result = await listAllDomains();
  console.log(result.data);
  // [
  //   {
  //     centerId: 'center-a-uuid',
  //     centerName: 'Center A',
  //     domains: [
  //       { domain: 'example.com', domainType: 'main', isActive: true },
  //       { domain: 'admin.example.com', domainType: 'admin', isActive: true }
  //     ]
  //   },
  //   ...
  // ]
  ```
- **의존성**: 2.3 완료
- **관련 문서**: domain_and_access_structure.md

---

### 2.15 Vercel API 도메인 자동 추가 ⭐ 신규
- [✅] **완료 여부**
- **파일**: `/lib/api/add-domain-to-vercel.ts`
- **구현 내용**:
  ```typescript
  import { supabase } from '@/lib/supabase';
  import { v4 as uuidv4 } from 'uuid';
  
  export interface AddDomainRequest {
    centerId: string;
    domain: string;
  }
  
  export interface AddDomainResponse {
    success: boolean;
    error?: string;
  }
  
  export async function addDomainToVercel(
    request: AddDomainRequest
  ): Promise<AddDomainResponse> {
    try {
      const { centerId, domain } = request;
      
      // 1. 센터 존재 확인
      const { data: center, error: centerError } = await supabase
        .from('users')
        .select('id, center_name')
        .eq('id', centerId)
        .eq('role', 'center')
        .single();
      
      if (centerError || !center) {
        return {
          success: false,
          error: '센터를 찾을 수 없습니다'
        };
      }
      
      // 2. Vercel API 호출 준비
      const vercelToken = process.env.VITE_VERCEL_TOKEN;
      const projectId = process.env.VITE_VERCEL_PROJECT_ID;
      
      if (!vercelToken || !projectId) {
        return {
          success: false,
          error: 'Vercel API 토큰 또는 프로젝트 ID가 없습니다'
        };
      }
      
      const apiUrl = `https://api.vercel.com/v9/projects/${projectId}/domains`;
      
      // 3. Vercel API 호출 (도메인 추가)
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: domain
        })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: result.error?.message || 'Vercel API 호출 실패'
        };
      }
      
      // 4. admin 도메인 추가
      const adminDomain = `admin.${domain}`;
      const adminResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: adminDomain
        })
      });
      
      const adminResult = await adminResponse.json();
      
      if (!adminResponse.ok) {
        return {
          success: false,
          error: adminResult.error?.message || 'Vercel API 호출 실패'
        };
      }
      
      return {
        success: true
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '도메인 추가 실패'
      };
    }
  }
  ```
- **테스트 방법**:
  ```typescript
  const result = await addDomainToVercel({
    centerId: 'center-a-uuid',
    domain: 'new-example.com'
  });
  console.log(result);
  
  // Vercel Dashboard에서 new-example.com, admin.new-example.com 확인
  ```
- **의존성**: 2.3 완료
- **관련 문서**: VERCEL_DEPLOYMENT.md

---

## 🎨 Phase 3: Frontend 레이아웃 시스템

### 3.1 레이아웃 공통 Props 타입 정의
- [✅] **완료 여부**
- **파일**: `/components/layouts/types.ts`
- **구현 내용**:
  ```typescript
  import { TemplatePreset } from '@/lib/template-presets';
  
  export interface LayoutProps {
    children: React.ReactNode;
    tenant: {
      id: string;
      centerName: string;
      logoUrl: string | null;
    };
    template: TemplatePreset;
    customTheme?: {
      colors?: Partial<TemplatePreset['colors']>;
      fonts?: Partial<TemplatePreset['fonts']>;
      layout?: Partial<TemplatePreset['layout']>;
    };
  }
  
  export interface NavItem {
    label: string;
    href: string;
    icon?: React.ReactNode;
  }
  ```
- **테스트 방법**:
  ```typescript
  import { LayoutProps } from '@/components/layouts/types';
  // 타입 체크 확인
  ```
- **의존성**: 2.1 완료
- **관련 문서**: implementation_checklist.md

---

### 3.2 ~ 3.7 레이아웃 컴포넌트들
(Modern, Classic, Minimal, Gaming, Luxury, 레이아웃 선택기)

이 부분들은 원래 체크리스트와 동일하므로 생략합니다.
자세한 내용은 원본 implementation_checklist.md 참조.

---

## 🎛️ Phase 4: 관리자 UI 컴포넌트

### 4.1 ~ 4.9 UI 컴포넌트들
(ColorPicker, TemplateSelector, LogoUploader, LivePreview, 센터 설정 페이지, 가맹점 대시보드, 역할 기반 라우팅, 회원 앱 반응형, 도메인 관리 페이지)

이 부분들은 원래 체크리스트와 동일하므로 생략합니다.
자세한 내용은 원본 implementation_checklist.md 참조.

---

## 🧪 Phase 5: 통합 및 테스트

### 5.1 ~ 5.10 테스트 항목들
(데이터 격리, 템플릿 전환, 로고 업로드/삭제, 도메인 라우팅, 역할 기반 라우팅, 도메인 매핑, 성능 테스트, 반응형 테스트, 크로스 브라우저 테스트, 통합 시나리오 테스트)

이 부분들은 원래 체크리스트와 동일하므로 생략합니다.
자세한 내용은 원본 implementation_checklist.md 참조.

---

## 🎉 완료 기준

### Phase 1 (도메인 인프라)
- [ ] 모든 센터가 2개 도메인 자동 생성됨
- [ ] 역할 기반 라우팅이 올바르게 작동함
- [ ] Vercel 배포 및 DNS 설정 완료

### Phase 2 (Backend)
- [ ] 모든 API 함수가 정상 작동함
- [ ] tenant_id가 모든 테이블에 올바르게 저장됨
- [ ] 데이터 격리가 완벽하게 작동함

### Phase 3 (레이아웃)
- [ ] 5가지 템플릿이 모두 정상 표시됨
- [ ] 템플릿 전환이 실시간으로 반영됨

### Phase 4 (UI)
- [ ] 센터/가맹점 대시보드가 PC 최적화됨
- [ ] 회원 앱이 반응형으로 작동함
- [ ] 도메인 관리 기능이 완벽히 작동함

### Phase 5 (테스트)
- [ ] 모든 테스트 시나리오 통과
- [ ] 성능 테스트 통과 (1000+ 센터)
- [ ] 크로스 브라우저 테스트 통과

---

## 📞 지원

문제 발생 시 참고 문서:
- **SQL 관련**: `/docs/SQL_EXECUTION_GUIDE.md`
- **도메인 관련**: `/docs/domain_and_access_structure.md`
- **배포 관련**: `/docs/VERCEL_DEPLOYMENT.md`
- **Multi-Tenancy**: `/docs/logic_for_multiTenancy1.md`

---

**다음 단계**: Phase 5.1부터 시작하세요! 🚀