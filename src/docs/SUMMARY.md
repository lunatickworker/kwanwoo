# 도메인 구조 및 용어 통일 완료 요약

## 📅 작업 일자
2025-11-29

## ✅ 완료된 작업

### 1. 새 문서 생성
- **`/docs/domain_and_access_structure.md`** ✨
  - 도메인 구조 완벽 정리
  - 계층별 접근 방식 명확화
  - 권한 기반 라우팅 로직
  - 센터 생성 시 도메인 매핑 가이드

### 2. 용어 통일 (merchant → store)
- **`/docs/hierachy_version1.md`**
  - ✅ `merchant_applications` → `store_applications`
  
- **`/docs/logic_for_multiTenancy1.md`**
  - ✅ `role: 'merchant'` → `role: 'store'`
  - ✅ `merchant_code` → `store_code`
  - ✅ 인덱스명 변경

### 3. 체크리스트 대폭 업데이트
- **`/docs/implementation_checklist.md`**
  - ✅ **Phase 0 추가** (도메인 인프라 설정 6개 항목)
  - ✅ Phase 2에 도메인 매핑 로직 추가
  - ✅ **Phase 4.6 추가** (가맹점 대시보드 - PC 형태)
  - ✅ **Phase 4.7 추가** (역할 기반 라우팅)
  - ✅ **Phase 4.8 추가** (회원 앱 반응형 수정)
  - ✅ **Phase 5.5 추가** (역할 기반 라우팅 테스트)
  - ✅ **Phase 5.6 추가** (도메인 매핑 테스트)
  - ✅ Phase 5.8 반응형 테스트 상세화
  - ✅ 총 진행률: 0/51 항목

---

## 🌐 핵심 도메인 구조

```
┌──────────────────────────────────────────────────┐
│ Master Platform                                  │
│ master-platform.com                              │
│  ├─ role='master' → MasterDashboard              │
│  └─ role='agency' → AgencyDashboard              │
└──────────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌────────────────┐        ┌────────────────┐
│  Center A      │        │  Center B      │
├────────────────┤        ├────────────────┤
│ example.com    │        │ crypto.com     │
│ (회원 접속)     │        │ (회원 접속)     │
│   ↓            │        │   ↓            │
│ role='user'    │        │ role='user'    │
│ → UserApp      │        │ → UserApp      │
│ (반응형) ✨     │        │ (반응형) ✨     │
├────────────────┤        ├────────────────┤
│admin.example   │        │admin.crypto    │
│ (관리자 접속)   │        │ (관리자 접속)   │
│   ↓            │        │   ↓            │
│ role='center'  │        │ role='center'  │
│ → CenterDash   │        │ → CenterDash   │
│ (PC형태)        │        │ (PC형태)        │
│   ↓            │        │   ↓            │
│ role='store'   │        │ role='store'   │
│ → StoreDash    │        │ → StoreDash    │
│ (PC형태) ✨     │        │ (PC형태) ✨     │
│ 같은 도메인!    │        │ 같은 도메인!    │
└────────────────┘        └────────────────┘
```

---

## 🔑 핵심 변경사항

### 1. 도메인 할당 방식

#### 센터 생성 시:
```typescript
const center = await createCenter({
  domain: 'example.com', // 주도메인
  // ...
});

// 자동 생성:
// 1. example.com (main) - 회원용
// 2. admin.example.com (admin) - 센터/가맹점 관리자용
```

#### domain_mappings 테이블:
```sql
CREATE TABLE domain_mappings (
  domain TEXT UNIQUE NOT NULL,
  center_id UUID REFERENCES users(id),
  domain_type TEXT CHECK (domain_type IN ('main', 'admin')),
  is_active BOOLEAN DEFAULT true
);
```

### 2. 권한 기반 접근

#### 같은 도메인, 다른 페이지:
```
admin.example.com에 접속했을 때:

- role='center' → CenterDashboard 표시
- role='store' → StoreDashboard 표시 ⭐

→ 도메인은 같지만, 로그인한 사용자의 role에 따라 다른 페이지!
```

### 3. UI 형태 명확화

| 역할 | 도메인 | UI 형태 | 설명 |
|------|--------|---------|------|
| Master | master-platform.com | PC | 데스크톱 최적화 |
| Agency | master-platform.com | PC | 데스크톱 최적화 |
| Center | admin.example.com | PC | 데스크톱 최적화, 사이드바 |
| **Store** | **admin.example.com** | **PC** | **데스크톱 최적화, 센터와 같은 도메인** ⭐ |
| **User** | **example.com** | **반응형** | **모바일/태블릿/데스크톱 모두 지원** ✨ |

---

## 📝 용어 통일

### 데이터베이스:
```sql
-- Before
role CHECK (role IN ('master', 'agency', 'center', 'merchant', 'user'))
merchant_code TEXT UNIQUE
merchant_applications

-- After ✅
role CHECK (role IN ('master', 'agency', 'center', 'store', 'user'))
store_code TEXT UNIQUE
store_applications
```

### 코드:
```typescript
// Before
createMerchant()
merchant.merchant_code
merchantApplications

// After ✅
createStore()
store.store_code
storeApplications
```

---

## 🔄 회원 앱 반응형 수정

### 기존 (모바일만):
```tsx
// 고정 레이아웃, 모바일 전용
<div className="max-w-md mx-auto">
  {/* 모바일 최적화 */}
</div>
```

### 수정 (반응형) ✨:
```tsx
// 모바일: 1열, 하단 네비게이션
// 태블릿: 2열, 테이블 형태
// 데스크톱: 3열, 넓은 레이아웃
<div className="max-w-7xl mx-auto">
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {/* 반응형 그리드 */}
  </div>
  
  {/* 모바일만 하단 네비 */}
  <nav className="md:hidden fixed bottom-0">
    {/* ... */}
  </nav>
</div>
```

---

## 🧪 새로 추가된 테스트

### 5.5 역할 기반 라우팅 테스트
```typescript
// 각 role로 각 domain 접속 시 올바른 페이지 표시되는지
{ role: 'store', domain: 'admin.example.com', expected: 'StoreDashboard' } ✨
{ role: 'user', domain: 'example.com', expected: 'UserApp (반응형)' } ✨
```

### 5.6 도메인 매핑 테스트
```typescript
// 센터 생성 시 2개 도메인 자동 생성되는지
// - example.com (main)
// - admin.example.com (admin)
```

---

## 📚 문서 구조

```
/docs/
├── hierachy_version1.md              (계층 구조 설계)
├── logic_for_multiTenancy1.md        (Multi-Tenancy 구현)
├── domain_and_access_structure.md    (도메인 구조 가이드) ✨ 신규
├── implementation_checklist.md       (구현 체크리스트 - 51개 항목)
└── SUMMARY.md                         (이 문서) ✨ 신규
```

---

## 🎯 다음 단계

### Phase 0부터 시작:
1. ✅ `/etc/hosts` 설정 (로컬 개발)
2. ✅ `domain_mappings` 테이블 생성
3. ✅ 역할 기반 라우팅 로직 구현
4. ✅ 센터 생성 API에 도메인 매핑 추가

### 핵심 구현:
- **가맹점 대시보드** (PC 형태) - Phase 4.6
- **역할 기반 라우팅** - Phase 4.7
- **회원 앱 반응형** - Phase 4.8

---

## 💡 주요 질문 답변

### Q1: 회원은 어디로 접속하나요?
**A**: `example.com` (주도메인)에 접속하면 **반응형** UserApp이 표시됩니다.

### Q2: 센터는 어디로 접속하나요?
**A**: `admin.example.com` (서브도메인)에 접속하면 CenterDashboard가 표시됩니다.

### Q3: 가맹점은 어디로 접속하나요?
**A**: `admin.example.com` (센터와 같은 도메인!)에 접속하지만, `role='store'`로 구분되어 **StoreDashboard**가 표시됩니다. ⭐

### Q4: 가맹점 계정을 여러 개 만들 수 있나요?
**A**: 네! 센터가 `createStore()`를 여러 번 호출하면 각각 독립적인 가맹점 계정이 생성됩니다. 모두 `admin.example.com`으로 접속하지만, 로그인한 계정에 따라 자기 데이터만 보입니다.

### Q5: 에이전시는 어디로 접속하나요?
**A**: `master-platform.com` (마스터와 같은 도메인)에 접속하지만, `role='agency'`로 구분되어 AgencyDashboard가 표시됩니다.

---

## 🚀 완료!

모든 문서 업데이트가 완료되었습니다!

**변경된 파일**:
- ✅ `/docs/domain_and_access_structure.md` (신규)
- ✅ `/docs/hierachy_version1.md` (용어 수정)
- ✅ `/docs/logic_for_multiTenancy1.md` (용어 수정)
- ✅ `/docs/implementation_checklist.md` (대폭 업데이트 - 56개 항목)
- ✅ `/docs/VERCEL_DEPLOYMENT.md` (신규 - Vercel 배포 가이드) ⭐
- ✅ `/docs/migration_001_multi_tenancy.sql` (신규 - Phase 1 SQL 통합) ⭐⭐⭐
- ✅ `/docs/SQL_EXECUTION_GUIDE.md` (신규 - SQL 실행 가이드) ⭐⭐⭐
- ✅ `/docs/SUMMARY.md` (신규 - 이 파일)

---

## 🎉 추가된 핵심 기능 (주도메인 관리)

### Backend API (Phase 2)
- ✅ **2.11**: 주도메인 변경 API
- ✅ **2.12**: 주도메인 차단/활성화 API
- ✅ **2.13**: 주도메인 삭제 API
- ✅ **2.14**: 도메인 목록 조회 API

### Frontend UI (Phase 4)
- ✅ **4.9**: 도메인 관리 페이지 (마스터)
  - 센터별 도메인 목록 테이블
  - 도메인 변경 모달
  - 차단/활성화 버튼
  - 삭제 확인 다이얼로그

### Vercel 배포
- ✅ **VERCEL_DEPLOYMENT.md**: 완벽한 가이드
  - 수동 배포 방법
  - Vercel API 자동화
  - DNS 설정 (Cloudflare/GoDaddy/Namecheap)
  - 트러블슈팅

---

## 💬 FAQ

### Q1: 센터 생성 시 도메인만 입력하면 되나요?
**A**: 네! 마스터 대시보드에서 domain 필드에 `example.com`을 입력하면:
1. DB에 저장됩니다 ✅
2. `domain_mappings`에 2개 레코드 자동 생성 ✅
   - `example.com` (main)
   - `admin.example.com` (admin)

하지만 **Vercel에는 수동으로 추가**해야 합니다:
```bash
vercel domains add example.com your-project
vercel domains add *.example.com your-project
```

또는 **Vercel API로 자동화** 가능합니다! (가이드 참조)

### Q2: Vercel 배포는 어떻게 하나요?
**A**: `/docs/VERCEL_DEPLOYMENT.md` 가이드를 따라하세요!
- Vercel Dashboard (수동)
- Vercel CLI
- Vercel API (자동화) ⭐ 권장

### Q3: 주도메인을 변경할 수 있나요?
**A**: 네! 마스터 대시보드의 **도메인 관리 페이지**에서:
1. "변경" 버튼 클릭
2. 새 도메인 입력 (예: `new-domain.com`)
3. DB 자동 업데이트 ✅
4. **Vercel에 새 도메인 수동 추가 필요**
5. DNS 설정 업데이트

### Q4: 주도메인을 차단할 수 있나요?
**A**: 네! "차단" 버튼 클릭하면:
- `domain_mappings.is_active = false` 업데이트
- 회원이 접속 시 "서비스 차단됨" 메시지 표시
- Vercel에서는 제거하지 않음 (언제든지 다시 활성화 가능)

### Q5: 주도메인을 삭제할 수 있나요?
**A**: 네! 하지만 **안전장치**가 있습니다:
1. 연결된 가맹점/회원이 있으면 삭제 불가 ❌
2. 도메인 확인 입력 필요 (예: `example.com` 직접 입력)
3. 삭제 후 **Vercel에서도 수동 제거 필요**

---

**이제 개발 시작 가능합니다!** 🎉

**다음 단계**: 
1. `/docs/VERCEL_DEPLOYMENT.md` 읽기
2. Phase 0 (도메인 인프라 설정) 시작
3. Phase 2.11~2.14 (도메인 관리 API) 구현
4. Phase 4.9 (도메인 관리 UI) 구현