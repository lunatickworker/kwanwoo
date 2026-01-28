# Supabase 이메일 확인 비활성화 설정

## ⚠️ 문제 상황

회원가입 시 다음 오류가 발생합니다:
```
{
  "message": "email rate limit exceeded",
  "status": 429,
  "code": "over_email_send_rate_limit"
}
```

이는 Supabase가 회원가입 시 확인 이메일을 자동으로 보내려고 하기 때문입니다.

---

## ✅ 해결 방법

### 1. Supabase Dashboard 설정 변경

1. **Supabase Dashboard** 접속: https://supabase.com/dashboard
2. 프로젝트 선택
3. 좌측 메뉴에서 **Authentication** > **Settings** 클릭
4. **Email Auth** 섹션 찾기
5. **Enable email confirmations** 옵션을 **OFF**로 변경
6. **Save** 클릭

### 2. 설정 확인 사항

```
Authentication > Settings > Email Auth

✅ Enable email confirmations: OFF (비활성화)
✅ Secure email change: OFF (선택사항)
✅ Double confirm email changes: OFF (선택사항)
```

---

## 🔧 추가 설정 (옵션)

### SQL을 통한 사용자 자동 확인

만약 이미 이메일 확인을 활성화한 상태에서 등록된 사용자가 있다면, 
다음 SQL을 실행하여 모든 사용자를 자동 확인 상태로 변경할 수 있습니다:

```sql
-- 모든 사용자를 확인된 상태로 변경
UPDATE auth.users 
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;
```

---

## 🚀 프론트엔드 코드는 이미 준비됨

`/user/components/MobileLogin.tsx` 파일에서 이미 다음과 같이 설정되어 있습니다:

```typescript
const { data: authData, error: authError } = await supabase.auth.signUp({
  email: signUpData.email,
  password: signUpData.password,
  options: {
    emailRedirectTo: undefined, // 이메일 확인 비활성화
    data: {
      role: 'user',
      username: signUpData.username,
    }
  }
});
```

그리고 Rate Limit 오류를 감지하여 적절한 메시지를 표시합니다:

```typescript
if ((authError as any).code === 'over_email_send_rate_limit' || 
    authError.message.includes('email rate limit')) {
  errorMessage = '이메일 전송 한도가 초과되었습니다. 잠시 후 다시 시도해주세요';
  toast.error(errorMessage, {
    duration: 5000,
    position: 'top-center',
    icon: '⏳'
  });
  return;
}
```

---

## 📝 테스트

설정 변경 후:

1. 회원가입 시도
2. 이메일 확인 없이 즉시 계정 생성됨
3. 바로 로그인 가능

---

## ⚠️ 주의사항

- 이메일 확인을 비활성화하면 누구나 아무 이메일로 가입할 수 있습니다
- 프로덕션 환경에서는 보안을 위해 다른 검증 방법을 고려하세요
- 필요하다면 KYC 프로세스나 SMS 인증 등을 추가하세요

---

## 🔐 프로덕션 권장 설정

만약 이메일 확인이 필요하다면:

1. **SMTP 설정**: 자체 이메일 서버 사용
2. **Rate Limit 증가**: Supabase Pro 플랜으로 업그레이드
3. **대체 인증**: SMS, OAuth 등 추가

---

완료! 이제 회원가입 시 이메일 확인 없이 즉시 계정이 생성됩니다. 🎉
