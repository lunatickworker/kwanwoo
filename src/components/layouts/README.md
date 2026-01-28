# Frontend Layout System

## 📋 개요

Phase 3에서 구현된 멀티테넌시 시스템을 위한 5가지 템플릿 레이아웃 시스템입니다.

## 🎨 템플릿 종류

### 1. Modern (현대적)
- **레이아웃**: Sidebar Navigation
- **특징**: 깔끔하고 현대적인 디자인, 사이드바 네비게이션, 둥근 카드
- **컬러**: Blue primary, Purple secondary, Dark background
- **용도**: 기본 추천 템플릿

### 2. Classic (전통적)
- **레이아웃**: Horizontal Navigation
- **특징**: 전통적이고 안정적인 디자인, 상단 네비게이션, 테두리 강조
- **컬러**: Gray primary, White background
- **용도**: 보수적인 비즈니스 환경

### 3. Minimal (미니멀)
- **레이아웃**: Centered Navigation
- **특징**: 미니멀하고 심플한 디자인, 중앙 정렬
- **컬러**: Black & White, Red accent
- **용도**: 간결함을 중시하는 환경

### 4. Gaming (게이밍)
- **레이아웃**: Sidebar Navigation
- **특징**: 역동적인 게이밍 스타일, 각진 디자인, 강렬한 컬러
- **컬러**: Green primary, Yellow secondary, Black background
- **용도**: 게임 관련 플랫폼

### 5. Luxury (고급)
- **레이아웃**: Centered Navigation
- **특징**: 고급스럽고 우아한 디자인, 둥근 요소, 넉넉한 여백
- **컬러**: Gold primary, Brown secondary, Dark background
- **용도**: 프리미엄 서비스

## 📦 구성 요소

### 파일 구조
```
/components/layouts/
├── types.ts                 # 타입 정의
├── ModernLayout.tsx         # Modern 템플릿
├── ClassicLayout.tsx        # Classic 템플릿
├── MinimalLayout.tsx        # Minimal 템플릿
├── GamingLayout.tsx         # Gaming 템플릿
├── LuxuryLayout.tsx         # Luxury 템플릿
├── LayoutProvider.tsx       # 레이아웃 프로바이더 & 선택기
├── LayoutDemo.tsx           # 데모 컴포넌트
├── index.ts                 # Export 파일
└── README.md                # 이 파일
```

## 🚀 사용 방법

### 기본 사용

```typescript
import { LayoutProvider } from '@/components/layouts';

function App() {
  const tenant = {
    id: 'center-id',
    centerName: 'My Center',
    logoUrl: 'https://example.com/logo.png',
    templateId: 'modern', // or 'classic', 'minimal', 'gaming', 'luxury'
  };

  return (
    <LayoutProvider tenant={tenant}>
      <YourContent />
    </LayoutProvider>
  );
}
```

### 커스텀 테마 적용

```typescript
import { LayoutProvider } from '@/components/layouts';

function App() {
  const tenant = {
    id: 'center-id',
    centerName: 'My Center',
    logoUrl: null,
    templateId: 'modern',
  };

  const customTheme = {
    colors: {
      primary: '#FF6B6B',
      accent: '#4ECDC4',
    },
    fonts: {
      heading: 'Montserrat',
    },
  };

  return (
    <LayoutProvider tenant={tenant} customTheme={customTheme}>
      <YourContent />
    </LayoutProvider>
  );
}
```

### 템플릿 선택기 사용

```typescript
import { LayoutSelector } from '@/components/layouts';

function SettingsPage() {
  const [selectedTemplate, setSelectedTemplate] = useState('modern');
  
  const tenant = {
    id: 'center-id',
    centerName: 'My Center',
    logoUrl: null,
  };

  return (
    <LayoutSelector
      selectedTemplateId={selectedTemplate}
      onSelectTemplate={setSelectedTemplate}
      tenant={tenant}
    />
  );
}
```

### 특정 레이아웃 직접 사용

```typescript
import { ModernLayout } from '@/components/layouts';
import { TEMPLATE_PRESETS } from '@/utils/template-presets';

function App() {
  const tenant = {
    id: 'center-id',
    centerName: 'My Center',
    logoUrl: null,
  };

  return (
    <ModernLayout 
      tenant={tenant} 
      template={TEMPLATE_PRESETS.modern}
    >
      <YourContent />
    </ModernLayout>
  );
}
```

## 🔧 API

### LayoutProps

```typescript
interface LayoutProps {
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
```

### NavItem

```typescript
interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
}
```

## 🎯 테스트

### 레이아웃 데모 실행

```typescript
import { LayoutDemo } from '@/components/layouts/LayoutDemo';

function TestPage() {
  return <LayoutDemo />;
}
```

이 컴포넌트는:
- 5가지 템플릿을 모두 시각적으로 테스트
- 템플릿 간 전환 데모
- 실시간 레이아웃 변경 확인

## 📝 템플릿 프리셋과의 연동

레이아웃 시스템은 `/utils/template-presets.ts`에 정의된 템플릿 프리셋과 연동됩니다:

```typescript
import { TEMPLATE_PRESETS } from '@/utils/template-presets';

// 템플릿 ID로 프리셋 가져오기
const template = TEMPLATE_PRESETS.modern;

// 모든 템플릿 목록
const allTemplates = Object.values(TEMPLATE_PRESETS);
```

## 🔄 도메인 인프라와의 통합

실제 프로덕션 환경에서는 다음과 같이 사용:

```typescript
import { getTenantInfo } from '@/utils/api/get-tenant-info';
import { LayoutProvider } from '@/components/layouts';

function App() {
  const [tenant, setTenant] = useState(null);

  useEffect(() => {
    const loadTenant = async () => {
      const domain = window.location.hostname;
      const tenantInfo = await getTenantInfo(domain);
      setTenant(tenantInfo);
    };
    loadTenant();
  }, []);

  if (!tenant) return <Loading />;

  return (
    <LayoutProvider tenant={tenant}>
      <YourContent />
    </LayoutProvider>
  );
}
```

## ✅ 완료 체크리스트

- [x] 3.1: 레이아웃 공통 Props 타입 정의 (`types.ts`)
- [x] 3.2: Modern 레이아웃 컴포넌트 (`ModernLayout.tsx`)
- [x] 3.3: Classic 레이아웃 컴포넌트 (`ClassicLayout.tsx`)
- [x] 3.4: Minimal 레이아웃 컴포넌트 (`MinimalLayout.tsx`)
- [x] 3.5: Gaming 레이아웃 컴포넌트 (`GamingLayout.tsx`)
- [x] 3.6: Luxury 레이아웃 컴포넌트 (`LuxuryLayout.tsx`)
- [x] 3.7: Layout Provider & Selector (`LayoutProvider.tsx`)

## 🎉 Phase 3 완료!

모든 레이아웃 컴포넌트가 구현되었으며, 다음 단계인 Phase 4 (관리자 UI 컴포넌트)로 진행할 준비가 완료되었습니다.
