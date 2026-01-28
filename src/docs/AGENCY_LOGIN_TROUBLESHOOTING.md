# Agency 로그인 문제 해결 가이드

## 🔍 문제 상황
- agency@gms.com 계정이 생성되었지만 로그인이 안됨
- 에이전시 수정 기능이 작동하지 않음

## ✅ 해결 완료 사항

### 1. 에이전시 수정 기능 구현
- [✅] `EditAgencyModal.tsx` 컴포넌트 생성
- [✅] `AgencyManagement.tsx`에 수정 기능 추가
- [✅] Edit 버튼 클릭 시 모달 열림

### 2. 이메일 확인 비활성화
- [✅] `CreateAgencyModal.tsx`에 `emailRedirectTo: undefined` 추가
- 새로 생성되는 계정은 이메일 확인 없이 바로 로그인 가능

## 🔧 기존 계정 로그인 문제 해결

### 방법 1: Supabase Dashboard에서 이메일 확인 ✅ **추천**

1. **Supabase Dashboard 접속**
   ```
   https://supabase.com/dashboard
   → 프로젝트 선택
   → Authentication
   → Users
   ```

2. **agency@gms.com 계정 찾기**
   - 사용자 목록에서 `agency@gms.com` 검색

3. **이메일 확인 처리**
   - 사용자 클릭
   - `Email Confirmed At` 필드 확인
   - 비어있으면 "Confirm Email" 버튼 클릭
   - 또는 직접 현재 날짜/시간 입력

### 방법 2: SQL로 이메일 확인

Supabase SQL Editor에서 실행:

```sql
-- agency@gms.com 계정의 이메일 확인 처리
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'agency@gms.com';
```

### 방법 3: 계정 재생성

1. **기존 계정 삭제**
   - Supabase Dashboard → Authentication → Users
   - agency@gms.com 계정 삭제
   - users 테이블에서도 삭제 확인

2. **새로 생성**
   - 마스터 계정에서 에이전시 다시 생성
   - 이번엔 이메일 확인 없이 바로 생성됨

## 🔑 로그인 테스트

### 1. 계정 확인
```
이메일: agency@gms.com
비밀번호: (생성 시 입력한 비밀번호)
```

### 2. 로그인 경로
```
1. 로그인 페이지 접속
2. 이메일/비밀번호 입력
3. 로그인 버튼 클릭
4. role='agency'로 자동 인식되어 에이전시 대시보드로 이동
```

### 3. 로그인 실패 시 확인 사항
- [ ] 비밀번호가 정확한지 확인
- [ ] 이메일이 정확한지 확인 (오타 체크)
- [ ] Supabase Dashboard에서 계정이 실제로 생성되었는지 확인
- [ ] `email_confirmed_at` 필드가 null이 아닌지 확인
- [ ] 브라우저 콘솔에서 오류 메시지 확인

## 🔐 Supabase Auth 설정 (선택)

### 프로덕션 환경에서는 이메일 확인 필수!
하지만 개발/테스트 환경에서는 비활성화 가능:

1. **Supabase Dashboard 접속**
   ```
   프로젝트 → Settings → Authentication
   ```

2. **Email Confirmation 비활성화**
   - "Enable email confirmations" 토글 OFF
   - 주의: 이 설정은 모든 신규 가입자에게 적용됨

3. **개발 전용 설정**
   ```
   이 설정은 개발/테스트 환경에서만 사용하세요!
   프로덕션에서는 이메일 확인을 활성화해야 보안이 유지됩니다.
   ```

## 📝 비밀번호 재설정

만약 비밀번호를 잊어버렸다면:

### 방법 1: Supabase Dashboard에서 직접 재설정
```sql
-- SQL Editor에서 실행
-- 주의: 이 방법은 개발 환경에서만 사용하세요!
UPDATE auth.users
SET encrypted_password = crypt('새비밀번호', gen_salt('bf'))
WHERE email = 'agency@gms.com';
```

### 방법 2: 계정 재생성
- 기존 계정 삭제 후 다시 생성

## ✅ 수정 기능 사용법

### 1. 에이전시 수정
```
1. 마스터 계정 로그인
2. #master → 에이전시 관리
3. 수정할 에이전시의 Edit 버튼 클릭 (연필 아이콘)
4. 정보 수정
5. "수정 완료" 버튼 클릭
```

### 2. 수정 가능한 항목
- ✅ 에이전시명
- ✅ 이메일 (주의: 로그인 ID로 사용됨)
- ✅ 연락처
- ✅ 담당자
- ✅ 사업자 번호
- ✅ 주소
- ❌ 비밀번호 (별도 비밀번호 변경 기능 필요)

## 🚨 주의사항

1. **이메일 변경 시**
   - 이메일은 로그인 ID로 사용됨
   - 변경 후에는 새 이메일로 로그인해야 함

2. **비밀번호 변경**
   - 현재 EditAgencyModal에서는 비밀번호 변경 불가
   - 비밀번호 재설정 기능은 별도 구현 필요

3. **계정 삭제**
   - 에이전시 삭제 시 하위 센터/가맹점도 함께 삭제됨
   - 복구 불가능하므로 신중하게 사용

## 🔍 디버깅 팁

### 콘솔 로그 확인
```javascript
// 브라우저 개발자 도구 → Console
// 로그인 시도 시 표시되는 오류 메시지 확인
```

### Supabase Auth 로그 확인
```
Supabase Dashboard
→ Authentication
→ Logs
→ 최근 로그인 시도 확인
```

### 네트워크 요청 확인
```
브라우저 개발자 도구
→ Network 탭
→ auth/v1/token 요청 확인
→ 응답 상태 코드 및 메시지 확인
```

## 📞 추가 지원

문제가 계속되면:
1. Supabase Dashboard에서 계정 상태 확인
2. 브라우저 콘솔에서 정확한 오류 메시지 확인
3. agency@gms.com 계정 삭제 후 재생성
4. Supabase Auth 로그 확인

---

**작성일**: 2025-01-01  
**상태**: ✅ 해결 완료 (EditAgencyModal 추가, 이메일 확인 비활성화)
