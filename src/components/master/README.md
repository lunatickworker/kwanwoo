# Master 관리 시스템

마스터 전용 관리 페이지 컴포넌트입니다.

## 접근 방법

```
/#master
```

마스터 권한을 가진 사용자만 접근 가능합니다.

## 주요 기능

### 1. 대시보드 (MasterDashboard)
- **전체 통계 요약**
  - 총 센터/에이전시/가맹점/사용자 수
  - 총 거래량 및 거래 건수
  - 실시간 통계
- **빠른 액세스**
  - 각 관리 페이지로 이동
  - 최근 활동 내역

### 2. 센터 관리 (CenterManagement)
- **센터 생성**
  - 5가지 템플릿 선택 (Modern/Classic/Minimal/Gaming/Luxury)
  - 로고 업로드
  - 도메인 설정
  - 자동 Vercel 도메인 연동
- **센터 관리**
  - 센터 목록 조회
  - 센터 활성화/비활성화
  - 센터 수정/삭제
- **미리보기 및 바로가기**
  - 회원 페이지 미리보기
  - 관리자 페이지 바로가기

### 3. 도메인 관리 (DomainManagement)
- **Vercel 도메인 연동**
  - 도메인 추가/삭제
  - 도메인 활성화/비활성화
  - DNS 설정 확인
- **도메인 목록**
  - 전체 도메인 조회
  - 도메인별 상태 확인
  - SSL 인증서 상태

### 4. 에이전시 관리 (AgencyManagement) ✨ NEW
- **에이전시 생성**
  - 에이전시 정보 입력
  - 담당자 정보 설정
  - 사업자 번호 등록
- **에이전시 관리**
  - 에이전시 목록 조회
  - 활성화/비활성화
  - 통계 정보 확인
    - 하위 센터 수
    - 하위 가맹점 수
    - 총 사용자 수
- **관리 페이지 바로가기**
  - 에이전시 관리 페이지 접근

### 5. 시스템 설정 (SystemSettings) ✨ NEW
전역 시스템 설정을 관리합니다.

#### 5.1 Biconomy 설정
- API Key 설정
- Bundler URL 설정
- Paymaster URL 설정
- Supertransaction API 연동

#### 5.2 가스 정책
- 가스 스폰서십 활성화/비활성화
- 최대 가스 한도 설정
- 가스 버퍼 비율 설정

#### 5.3 보안 설정
- 2단계 인증 필수 여부
- KYC 인증 필수 여부
- 최대 로그인 시도 횟수
- 세션 타임아웃 시간

#### 5.4 거래 설정
- 최소/최대 출금 금액
- 일일 출금 한도
- 출금 수수료 비율

#### 5.5 알림 설정
- 이메일 알림 활성화
- SMS 알림 활성화
- 웹훅 URL 설정

#### 5.6 시스템 설정
- 유지보수 모드
- 신규 회원가입 허용
- API 요청 제한 (Rate Limit)
- 기본 네트워크 설정

## 파일 구조

```
/components/master/
├── MasterApp.tsx              # 메인 앱 (라우팅)
├── MasterDashboard.tsx        # 대시보드
├── CenterManagement.tsx       # 센터 관리
├── CreateCenterModal.tsx      # 센터 생성 모달
├── AgencyManagement.tsx       # 에이전시 관리 ✨ NEW
├── CreateAgencyModal.tsx      # 에이전시 생성 모달 ✨ NEW
├── SystemSettings.tsx         # 시스템 설정 ✨ NEW
└── README.md                  # 이 파일
```

## 데이터베이스

### system_settings 테이블
```sql
CREATE TABLE system_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    
    -- Biconomy 설정
    biconomy_api_key TEXT,
    biconomy_bundler_url TEXT,
    biconomy_paymaster_url TEXT,
    
    -- 가스 정책
    gas_sponsorship_enabled BOOLEAN DEFAULT true,
    max_gas_limit TEXT DEFAULT '500000',
    gas_buffer_percentage INTEGER DEFAULT 10,
    
    -- 보안 설정
    two_factor_required BOOLEAN DEFAULT false,
    kyc_required BOOLEAN DEFAULT true,
    max_login_attempts INTEGER DEFAULT 5,
    session_timeout_minutes INTEGER DEFAULT 30,
    
    -- 거래 설정
    min_withdrawal_amount TEXT DEFAULT '10',
    max_withdrawal_amount TEXT DEFAULT '100000',
    daily_withdrawal_limit TEXT DEFAULT '500000',
    withdrawal_fee_percentage DECIMAL(5,2) DEFAULT 0.1,
    
    -- 알림 설정
    email_notifications_enabled BOOLEAN DEFAULT true,
    sms_notifications_enabled BOOLEAN DEFAULT false,
    webhook_url TEXT,
    
    -- 시스템 설정
    maintenance_mode BOOLEAN DEFAULT false,
    allow_new_registrations BOOLEAN DEFAULT true,
    api_rate_limit INTEGER DEFAULT 100,
    
    -- 네트워크 설정
    default_network TEXT DEFAULT 'base',
    supported_networks TEXT[] DEFAULT ARRAY['ethereum', 'polygon', 'base', 'arbitrum'],
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### users 테이블 추가 필드
```sql
ALTER TABLE users ADD COLUMN parent_user_id UUID REFERENCES users(user_id);
ALTER TABLE users ADD COLUMN metadata JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN center_name TEXT;
```

## 계층 구조

```
master (최상위)
  ├── agency (에이전시)
  │   ├── center (센터)
  │   │   └── store (가맹점)
  │   │       └── user (일반 사용자)
  │   └── store (가맹점)
  │       └── user (일반 사용자)
  └── center (센터)
      └── store (가맹점)
          └── user (일반 사용자)
```

## 권한

- **master**: 모든 기능 접근 가능
- **agency**: 하위 센터 및 가맹점 관리
- **center**: 하위 가맹점 관리
- **store**: 일반 사용자 관리
- **user**: 일반 사용자 기능

## 사용 방법

### 1. 에이전시 생성

```typescript
// CreateAgencyModal에서
const { data, error } = await supabase.auth.signUp({
  email: formData.email,
  password: formData.password,
  options: {
    data: {
      role: 'agency',
      center_name: formData.agencyName,
    }
  }
});

// users 테이블에 저장
await supabase.from('users').insert({
  user_id: data.user.id,
  username: formData.agencyName,
  email: formData.email,
  role: 'agency',
  center_name: formData.agencyName,
  metadata: {
    contactPerson: formData.contactPerson,
    address: formData.address,
    businessNumber: formData.businessNumber,
  }
});
```

### 2. 시스템 설정 저장

```typescript
// SystemSettings에서
const { error } = await supabase
  .from('system_settings')
  .upsert({
    id: 1, // 단일 레코드
    ...settings,
    updated_at: new Date().toISOString(),
  });
```

### 3. 통계 조회

```typescript
// 에이전시별 통계
const { count: centerCount } = await supabase
  .from('users')
  .select('*', { count: 'exact', head: true })
  .eq('role', 'center')
  .eq('parent_user_id', agencyId);
```

## 마이그레이션

필요한 마이그레이션 파일:

1. `/database/system_settings_v2.sql` - 시스템 설정 테이블
2. `/database/add_hierarchy_fields.sql` - 계층 구조 필드 추가

실행 순서:
```bash
# 1. Supabase SQL Editor에서 실행
1. system_settings_v2.sql
2. add_hierarchy_fields.sql
```

## 보안 고려사항

### RLS (Row Level Security)
- system_settings: 마스터만 접근 가능
- users: 본인 및 하위 계층만 조회 가능

### API Key 보안
- Biconomy API Key는 환경 변수 사용 권장
- 민감한 정보는 암호화하여 저장
- 프론트엔드에서 직접 노출하지 않기

### 권한 체크
```typescript
// 마스터 권한 확인
const { data: user } = await supabase
  .from('users')
  .select('role')
  .eq('user_id', userId)
  .single();

if (user.role !== 'master') {
  throw new Error('접근 권한이 없습니다');
}
```

## 주의사항

1. **단일 레코드**: system_settings는 항상 id=1인 단일 레코드
2. **계층 구조**: parent_user_id를 통한 계층 관계 유지
3. **도메인 연동**: Vercel API 사용 시 환경 변수 필요
4. **가스 스폰서십**: Biconomy 설정 완료 후 사용 가능

## 다음 단계

- [ ] 에이전시 수정 기능 구현
- [ ] 통계 대시보드 고도화
- [ ] 실시간 알림 시스템
- [ ] 감사 로그 (Audit Log)
- [ ] 백업/복구 기능
- [ ] 다국어 지원

## 관련 문서

- [Biconomy Supertransaction API 가이드](/guidelines/Guidelines.md)
- [데이터베이스 스키마](/database/unified_schema.sql)
- [계층 구조 설계](/docs/hierachy_version1.md)
- [도메인 매핑 시스템](/docs/center_domain_mapping_system.md)
