# 실시간 알림 시스템

## 개요

Supabase Realtime을 활용한 실시간 알림 시스템으로, 관리자와 사용자에게 즉각적인 피드백을 제공합니다.

## 주요 기능

### 관리자 알림 (Admin Notifications)

관리자는 다음 이벤트에 대해 실시간 알림을 받습니다:

1. **회원 가입** (`signup`)
   - 새로운 사용자가 가입할 때
   - `auth_users` 테이블 INSERT 감지

2. **1원 인증 요청** (`verification_request`)
   - 사용자가 계좌 인증을 요청할 때
   - `account_verifications` 테이블에 `status='pending'` INSERT 감지

3. **구매 요청** (`purchase_request`)
   - 사용자가 코인 구매를 요청할 때
   - `transfer_requests` 테이블에 `status='pending'` INSERT 감지

### 사용자 알림 (User Notifications)

사용자는 다음 이벤트에 대해 실시간 알림을 받습니다:

1. **계좌 인증 승인** (`verification_approved`)
   - 관리자가 1원 인증을 승인할 때
   - `account_verifications` 테이블 `status='approved'` UPDATE 감지

2. **계좌 인증 거절** (`verification_rejected`)
   - 관리자가 1원 인증을 거절할 때
   - `account_verifications` 테이블 `status='rejected'` UPDATE 감지

3. **구매 승인** (`purchase_approved`)
   - 관리자가 구매 요청을 승인할 때
   - `transfer_requests` 테이블 `status='approved'` UPDATE 감지

4. **구매 완료** (`purchase_completed`)
   - 구매가 완료되었을 때
   - `transfer_requests` 테이블 `status='completed'` UPDATE 감지

5. **구매 거절** (`purchase_rejected`)
   - 관리자가 구매 요청을 거절할 때
   - `transfer_requests` 테이블 `status='rejected'` UPDATE 감지

## 사용 방법

### 1. Supabase Realtime 활성화

```sql
-- /database/enable_realtime_notifications.sql 실행
ALTER PUBLICATION supabase_realtime ADD TABLE auth_users;
ALTER PUBLICATION supabase_realtime ADD TABLE account_verifications;
ALTER PUBLICATION supabase_realtime ADD TABLE transfer_requests;
```

### 2. 컴포넌트에서 사용

```typescript
import { NotificationCenter } from './components/NotificationCenter';
import { useAuth } from './contexts/AuthContext';

function Header() {
  const { user } = useAuth();
  
  return (
    <header>
      {user?.id && (
        <NotificationCenter 
          userId={user.id} 
          isAdmin={user.role === 'admin'} 
        />
      )}
    </header>
  );
}
```

### 3. 커스텀 훅 사용

```typescript
import { useNotifications } from './hooks/useNotifications';

function MyComponent() {
  const { user } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications(
    user?.id,
    user?.role === 'admin'
  );
  
  return (
    <div>
      <p>읽지 않은 알림: {unreadCount}</p>
      {notifications.map(notif => (
        <div key={notif.id} onClick={() => markAsRead(notif.id)}>
          {notif.title}: {notif.message}
        </div>
      ))}
    </div>
  );
}
```

## 알림 저장소

알림은 **로컬 스토리지**에 저장되며, 다음과 같은 키를 사용합니다:

- `notifications_{userId}`: 각 사용자별 알림 목록 (최대 100개)

### 장점
- ✅ 서버 부하 없음
- ✅ 빠른 응답 속도
- ✅ 오프라인에서도 이전 알림 확인 가능

### 제한사항
- ❌ 다른 기기 간 동기화 안됨 (각 기기마다 독립적)
- ❌ 브라우저 데이터 삭제 시 알림 손실

## 알림 UI

### NotificationCenter 컴포넌트

- **위치**: Header 우측 상단
- **아이콘**: 🔔 (Bell)
- **배지**: 읽지 않은 알림 개수 (빨간색 배지)
- **드롭다운**: 클릭 시 알림 목록 표시

### 기능

1. **읽지 않은 알림 표시**
   - 읽지 않은 알림은 파란색 배경
   - 우측에 파란색 점 표시

2. **알림 읽음 처리**
   - 알림 클릭 시 자동으로 읽음 처리
   - "모두 읽음으로 표시" 버튼으로 일괄 처리

3. **알림 삭제**
   - 개별 알림 우측 X 버튼으로 삭제
   - "모든 알림 지우기" 버튼으로 일괄 삭제

4. **토스트 알림**
   - 새 알림 수신 시 화면 우측 하단에 토스트 표시
   - 5초 후 자동 사라짐

## 알림 타입별 스타일

- **초록색**: 승인, 완료 (approved, completed)
- **빨간색**: 거절 (rejected)
- **노란색**: 요청, 대기 (request, pending)
- **파란색**: 일반 정보

## 실시간 구독 관리

### 자동 정리

`useNotifications` 훅은 컴포넌트 언마운트 시 자동으로 Supabase 채널 구독을 해제합니다:

```typescript
useEffect(() => {
  // 구독 시작
  const channel = supabase.channel('...').subscribe();
  
  // 정리 함수
  return () => {
    supabase.removeChannel(channel);
  };
}, [userId]);
```

### 메모리 관리

- 최대 100개 알림만 로컬 스토리지에 보관
- 오래된 알림은 자동 삭제

## 디버깅

### Supabase Realtime 연결 확인

```typescript
const channel = supabase.channel('test');
channel.on('system', {}, (payload) => {
  console.log('Channel status:', payload);
});
channel.subscribe();
```

### 알림 수신 테스트

1. 브라우저 개발자 도구 열기
2. Console에서 다음 확인:
   - `Supabase channel subscribed` 메시지
   - Realtime 이벤트 로그

### 로컬 스토리지 확인

```javascript
// 브라우저 Console에서
const notifs = JSON.parse(localStorage.getItem('notifications_[userId]'));
console.log(notifs);
```

## 성능 최적화

1. **필터링**: Realtime 구독 시 필터 사용하여 필요한 데이터만 수신
   ```typescript
   filter: `user_id=eq.${userId}`
   ```

2. **배치 처리**: 여러 알림이 동시에 올 경우 자동으로 배치 처리

3. **Debounce**: 토스트 알림은 중복 방지 로직 적용

## 보안

- ✅ RLS(Row Level Security) 정책 적용 필수
- ✅ 사용자는 자신의 데이터만 구독 가능
- ✅ 관리자는 모든 pending 상태 데이터 구독 가능

## 트러블슈팅

### 알림이 오지 않아요

1. Supabase Realtime이 활성화되었는지 확인
2. RLS 정책이 올바르게 설정되었는지 확인
3. 브라우저 Console에서 에러 메시지 확인

### 알림이 중복으로 와요

- 여러 탭을 열었을 경우 각 탭마다 알림이 수신됩니다
- 이는 정상 동작입니다 (각 탭이 독립적으로 구독)

### 알림이 사라졌어요

- 로컬 스토리지 기반이므로 브라우저 데이터 삭제 시 알림도 삭제됩니다
- 중요한 알림은 데이터베이스에 별도 저장을 고려하세요

## 향후 개선 사항

- [ ] 데이터베이스 기반 알림 영구 저장
- [ ] 푸시 알림 (PWA)
- [ ] 이메일 알림 통합
- [ ] 알림 설정 (알림 끄기/켜기)
- [ ] 알림 카테고리별 필터링
- [ ] 알림 검색 기능
