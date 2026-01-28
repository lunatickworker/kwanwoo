# 🔧 템플릿 ID 미적용 문제 해결 가이드

## 📋 문제 상황

DB에는 `template_id`가 `classic`으로 저장되어 있지만, UI에는 여전히 Modern 템플릿 (다크 블루/사이언)이 표시되는 문제

**원인:**
- localStorage에 저장된 `user` 객체에 `templateId`가 없음
- 로그인 API가 `template_id`를 반환하지 않거나 매핑이 안됨

---

## ✅ 해결 방법

### 방법 1: 로그아웃 후 재로그인 (권장)

가장 간단하고 안전한 방법입니다.

```bash
1. 우측 상단 프로필 클릭
2. "로그아웃" 클릭
3. admin@example.com으로 다시 로그인
4. ✅ Classic 템플릿 적용 확인!
```

**로그인 시 자동으로:**
- DB에서 최신 `template_id` 로드
- localStorage에 저장
- UI에 즉시 반영

---

### 방법 2: 브라우저 콘솔에서 즉시 수정

로그아웃 없이 즉시 적용하고 싶다면:

```javascript
// 1. 브라우저 콘솔 열기 (F12)
// 2. 다음 명령어 실행:

await fixTemplateId();

// 3. 페이지 새로고침 (F5)
```

**결과:**
```
📦 Current user in localStorage: { id: '...', email: 'admin@example.com', ... }
📊 User data from DB: { template_id: 'classic', ... }
✅ User updated in localStorage: { ..., templateId: 'classic' }
🔄 Please refresh the page to apply changes
```

**새로고침 후 Classic 템플릿 적용!** 🎉

---

### 방법 3: localStorage 수동 수정 (고급)

개발자만 사용하세요:

```javascript
// 1. 현재 user 가져오기
const user = JSON.parse(localStorage.getItem('user'));

// 2. templateId 추가
user.templateId = 'classic';
user.centerName = 'Centre1';
user.logoUrl = null;

// 3. 저장
localStorage.setItem('user', JSON.stringify(user));

// 4. 페이지 새로고침
location.reload();
```

---

## 🔍 확인 방법

### 1. localStorage 확인

```javascript
// 브라우저 콘솔에서:
const user = JSON.parse(localStorage.getItem('user'));
console.log('templateId:', user.templateId);
console.log('centerName:', user.centerName);
```

**예상 결과:**
```javascript
{
  id: "8e-1f2a-3b4c-5d6e-7f8g9h0i1j2k",
  email: "admin@example.com",
  username: "centre1admin",
  role: "center",
  templateId: "classic",      // ✅ 있어야 함
  centerName: "Centre1",      // ✅ 있어야 함
  logoUrl: null               // ✅ 있어야 함
}
```

**문제가 있는 경우:**
```javascript
{
  id: "...",
  email: "admin@example.com",
  role: "center"
  // ❌ templateId 없음!
}
```

---

### 2. DB 확인

Supabase Dashboard에서:
```
1. Table Editor → users
2. admin@example.com 찾기
3. template_id 컬럼 확인
```

**예상 값:** `classic`

---

### 3. UI 확인

로그인 후:
- **Modern**: 다크 블루/사이언 배경
- **Classic**: 화이트/베이지 배경 ← 이게 보여야 함!

---

## 🔄 자동 수정 시스템 (새로 추가됨)

### AuthContext 개선

**로그인 시 자동 template_id 로드:**
```typescript
// 1. 백엔드 API 로그인
const userData = await login(email, password);

// 2. center/agency 계정인 경우 DB에서 최신 정보 재로드
if (role === 'center' || role === 'agency') {
  setTimeout(async () => {
    const freshData = await supabase
      .from('users')
      .select('template_id, center_name, logo_url, ...')
      .eq('user_id', userId)
      .single();
    
    // 3. localStorage 업데이트
    localStorage.setItem('user', JSON.stringify(freshData));
  }, 100);
}
```

**Realtime 업데이트:**
```typescript
// 템플릿 변경 시 자동 반영
supabase.channel('user_changes')
  .on('UPDATE', (payload) => {
    const updatedUser = {
      ...user,
      templateId: payload.new.template_id,
      centerName: payload.new.center_name,
      logoUrl: payload.new.logo_url
    };
    
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  });
```

---

## 🧪 테스트 시나리오

### 시나리오 1: 새로 로그인

```bash
1. 로그아웃
2. admin@example.com 로그인
3. ✅ Classic 템플릿 즉시 적용
```

### 시나리오 2: 템플릿 변경

```bash
1. admin@example.com 로그인 상태
2. 다른 탭에서 master@gmail.com 로그인
3. #master → 센터 관리 → Centre1 편집
4. 템플릿을 Gaming으로 변경
5. 저장
6. admin@example.com 탭으로 돌아가기
7. ✅ 5초 내 자동으로 Gaming 템플릿 적용!
```

### 시나리오 3: fixTemplateId 사용

```bash
1. admin@example.com 로그인 (Classic인데 Modern 표시)
2. F12 → 콘솔
3. await fixTemplateId()
4. F5 새로고침
5. ✅ Classic 템플릿 적용
```

---

## 📊 문제 발생 원인 분석

### 1. **백엔드 API 문제**
```
Edge Function이 template_id를 반환하지 않음
→ 해결: login 후 DB에서 재로드
```

### 2. **localStorage 캐시 문제**
```
이전 로그인 시 templateId 없이 저장됨
→ 해결: fixTemplateId() 유틸리티
```

### 3. **realtime 누락 문제**
```
realtime 구독에 template_id 포함 안됨
→ 해결: realtime payload에 추가
```

---

## 💡 개발자 팁

### 콘솔에서 현재 템플릿 확인

```javascript
// 현재 적용된 템플릿
const user = JSON.parse(localStorage.getItem('user'));
console.log('템플릿:', user?.templateId || 'modern (default)');

// DB의 템플릿 확인
const { data } = await supabase
  .from('users')
  .select('template_id')
  .eq('email', 'admin@example.com')
  .single();
console.log('DB 템플릿:', data?.template_id);
```

### 모든 센터의 템플릿 확인

```javascript
const { data } = await supabase
  .from('users')
  .select('email, username, template_id')
  .eq('role', 'center');

console.table(data);
```

---

## 🐛 트러블슈팅

### Q1: fixTemplateId()가 없다고 나와요
**A:** 페이지를 새로고침하세요. `/utils/fix-template-id.ts`가 자동 로드됩니다.

### Q2: 새로고침해도 안 바뀌어요
**A:** 
```javascript
// 1. localStorage 확인
console.log(JSON.parse(localStorage.getItem('user')));

// 2. templateId가 있는지 확인
// 3. 없으면 로그아웃 후 재로그인
```

### Q3: DB에 classic인데 Modern이 나와요
**A:** 
```javascript
// 캐시 완전히 클리어
localStorage.clear();
sessionStorage.clear();
// 로그인
```

### Q4: Realtime 업데이트가 안돼요
**A:** 
```javascript
// Supabase Realtime 활성화 확인
// Dashboard → Settings → API → Realtime enabled
```

---

## ✅ 체크리스트

- [ ] localStorage에 templateId 있는지 확인
- [ ] DB에 template_id 저장되어 있는지 확인
- [ ] 로그아웃 후 재로그인 시도
- [ ] fixTemplateId() 실행 시도
- [ ] 페이지 새로고침
- [ ] 브라우저 캐시 클리어
- [ ] 다른 브라우저에서 테스트

---

## 📞 도움이 필요하면

1. **콘솔 로그 확인**
   ```javascript
   // 로그인 시 다음 로그가 나와야 함:
   🔄 Refreshing user data to get template_id...
   ✅ Fresh user data loaded: { templateId: 'classic', ... }
   ```

2. **네트워크 탭 확인**
   - F12 → Network → login API 호출
   - Response에 template_id 포함 확인

3. **Supabase 로그 확인**
   - Dashboard → Logs
   - users 테이블 SELECT 쿼리 확인

---

**작성일**: 2025-01-01  
**상태**: ✅ 수정 완료  
**다음 로그인 시 자동 적용됨**
