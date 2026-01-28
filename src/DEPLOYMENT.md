# 🚀 배포 가이드

## Backend 서버 배포 (필수)

비밀번호 변경 등의 기능이 정상적으로 작동하려면 Supabase Edge Function을 배포해야 합니다.

### 1. Supabase CLI 설치

```bash
npm install -g supabase
```

### 2. Supabase 로그인

```bash
supabase login
```

### 3. Edge Function 배포

```bash
# 프로젝트 루트 디렉토리에서 실행
supabase functions deploy server --project-ref mzoeeqmtvlnyonicycvg
```

### 4. 환경 변수 설정

배포 후 Supabase Dashboard에서 환경 변수를 설정해야 합니다:

1. https://supabase.com/dashboard/project/mzoeeqmtvlnyonicycvg/settings/functions 접속
2. 다음 환경 변수 추가:
   - `WALLET_ENCRYPTION_KEY`: 지갑 암호화 키
   - `BICONOMY_API_KEY`: Biconomy API 키
   - 기타 필요한 환경 변수들

### 5. 배포 확인

```bash
# Health check 엔드포인트로 확인
curl https://mzoeeqmtvlnyonicycvg.supabase.co/functions/v1/make-server-b6d5667f/health
```

응답이 다음과 같이 나오면 성공:
```json
{
  "status": "ok",
  "timestamp": "2025-11-27T...",
  "service": "make-server-b6d5667f",
  "version": "1.0.0"
}
```

## 문제 해결

### 404 Not Found 에러

Backend 서버가 배포되지 않았거나 엔드포인트 경로가 잘못되었습니다.

**해결 방법:**
1. 위의 배포 과정을 따라 서버를 배포하세요
2. 배포 완료 후 앱을 새로고침하세요

### JSON Parse 에러

서버가 HTML 응답을 반환하고 있습니다. 주로 404 에러 페이지일 가능성이 높습니다.

**해결 방법:**
1. 서버가 정상적으로 배포되었는지 확인
2. Health check 엔드포인트로 서버 상태 확인

### CORS 에러

CORS 설정이 제대로 되지 않았습니다.

**해결 방법:**
1. 서버 코드의 CORS 설정 확인
2. 서버 재배포

## 로컬 개발 환경

로컬에서 Edge Function을 테스트하려면:

```bash
# Supabase 로컬 서버 시작
supabase start

# Edge Function 실행
supabase functions serve server --env-file ./supabase/.env.local
```

로컬 서버는 `http://localhost:54321/functions/v1/make-server-b6d5667f` 에서 실행됩니다.

## 추가 정보

- Supabase Edge Functions 문서: https://supabase.com/docs/guides/functions
- Supabase CLI 문서: https://supabase.com/docs/reference/cli/introduction
