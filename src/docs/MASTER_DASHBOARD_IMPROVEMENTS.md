# 🚀 마스터 대시보드 개선사항

## ✅ 완료된 작업 (2025-01-03)

### 1. 📊 통계 카드 개선

**변경 전:**
- 시스템 상태 카드 (정상/오류)

**변경 후:**
- ✅ **일 총 입금액 (원화)** 카드
- ✅ 모든 센터의 합계 표시
- ✅ 카드 하단에 **전일 총 입금액** 표시
- ✅ 증감율 표시 (%, 화살표 아이콘)
- ✅ 오렌지/앰버 그라디언트 디자인

**예시:**
```
┌─────────────────────────────┐
│ 💰 일 총 입금액             │
│                       +7.5% │
│ ₩45,800,000                 │
│ 전일: ₩42,300,000           │
└─────────────────────────────┘
```

---

### 2. 🏢 센터별 일 총 입금액 테이블

**새로 추가된 기능:**
- ✅ 센터별 원화/코인 입금액 표시
- ✅ 오늘 vs 어제 비교
- ✅ 증감율 표시 (색상 구분)
- ✅ 검색 기능 (센터명)
- ✅ 정렬 기능 (센터명, 원화, 코인)
- ✅ 합계 표시 (하단)

**테이블 구조:**
```
센터명   | 템플릿  | 원화(오늘)      | 원화(어제)    | 코인(오늘)      | 코인(어제)    | 증감율
────────┼─────────┼────────────────┼──────────────┼────────────────┼──────────────┼────────
#1 Centre1 | Classic | ₩25,800,000    | ₩22,500,000  | 18,500 USDT    | 16,200 USDT  | +14.7% ↑
#2 Centre2 | Modern  | ₩18,200,000    | ₩19,800,000  | 12,300 USDT    | 13,100 USDT  | -8.1% ↓
...
────────────────────────────────────────────────────────────────────────────────────────────
합계: ₩45,800,000 | 코인 합계: 32,500 USDT
```

**인터랙티브 기능:**
- 🔍 실시간 검색
- ⬆️⬇️ 정렬 토글
- 📊 자동 집계

---

### 3. 🗂️ 센터 관리 개선 (50개+ 대응)

**파일:** `CenterManagementCompact.tsx`

**새로운 기능:**
- ✅ **검색:** 센터명, 이메일, 도메인
- ✅ **필터:** 전체/활성/비활성
- ✅ **정렬:** 이름, 생성일, 상태
- ✅ **컴팩트 테이블:** 한 화면에 더 많은 센터 표시
- ✅ **실시간 카운트:** 총 센터, 활성, 비활성
- ✅ **빠른 작업:** 활성화/비활성화 토글 (클릭)
- ✅ **색상 구분:** 템플릿별 색상

**검색 예시:**
```
🔍 [센터명, 이메일, 도메인 검색...]  [전체] [활성] [비활성]

총 52개 센터 • 활성: 48개 • 비활성: 4개
```

**50개 이상 관리 팁:**
1. 검색으로 빠르게 필터링
2. 상태별로 그룹화하여 관리
3. 정렬로 우선순위 파악
4. 컴팩트 뷰로 한눈에 스캔

---

### 4. 👥 에이전시 관리 개선 (50개+ 대응)

**파일:** `AgencyManagementCompact.tsx`

**새로운 기능:**
- ✅ **검색:** 에이전시명, 이메일
- ✅ **필터:** 전체/활성/비활성
- ✅ **정렬:** 이름, 센터 수, 생성일
- ✅ **통계 표시:** 센터 수, 가맹점 수
- ✅ **컴팩트 테이블:** 한 화면에 더 많은 에이전시 표시
- ✅ **자동 집계:** 총 센터/가맹점 수

**테이블 구조:**
```
에이전시명 | 이메일              | 센터 수 | 가맹점 수 | 상태  | 생성일
──────────┼────────────────────┼────────┼──────────┼──────┼────────────
Agency1    | agency1@example.com | 🏢 12   | 🏢 35     | ✓활성 | 2024-12-01
Agency2    | agency2@example.com | 🏢 8    | 🏢 22     | ✓활성 | 2024-12-15
...
──────────────────────────────────────────────────────────────────────────
총 센터: 20개 • 총 가맹점: 57개
```

---

## 🎨 UI/UX 개선

### 색상 체계
- **원화 입금액:** 오렌지/앰버 (`text-orange-400`)
- **코인 입금액:** 블루 (`text-blue-400`)
- **증가:** 초록 (`text-green-400`, ↑)
- **감소:** 빨강 (`text-red-400`, ↓)
- **활성:** 초록 배경 (`bg-green-500/20`)
- **비활성:** 빨강 배경 (`bg-red-500/20`)

### 아이콘
- 💰 `Wallet`: 입금액 카드
- 📈 `ArrowUpRight`: 증가
- 📉 `ArrowDownRight`: 감소
- 🔍 `Search`: 검색
- ⬆️⬇️ `ArrowUpDown`: 정렬
- 🏢 `Building2`: 센터
- 👥 `Users`: 에이전시

---

## 📊 데이터 구조

### 센터별 입금액 (CenterDeposit)
```typescript
interface CenterDeposit {
  center_id: string;
  center_name: string;
  krw_today: number;          // 원화 오늘
  krw_yesterday: number;       // 원화 어제
  coin_today: number;          // 코인 오늘 (USDT)
  coin_yesterday: number;      // 코인 어제
  template_id: string;
}
```

### 통계 (Stats)
```typescript
{
  totalCenters: number;        // 총 센터 수
  totalDomains: number;        // 도메인 수
  totalUsers: number;          // 회원 수
  todayDeposits: number;       // 일 총 입금액
  yesterdayDeposits: number;   // 전일 총 입금액
}
```

---

## 🔄 데이터 흐름

### 1. 대시보드 로드
```typescript
useEffect(() => {
  fetchStats();              // 통계 조회
  fetchCenterDeposits();     // 센터별 입금액 조회
}, []);
```

### 2. 실시간 검색/필터
```typescript
const filteredCenters = useMemo(() => {
  let result = [...centerDeposits];
  
  // 검색 필터링
  if (searchTerm) {
    result = result.filter(center =>
      center.center_name.toLowerCase().includes(searchTerm)
    );
  }
  
  // 정렬
  result.sort((a, b) => {
    if (sortBy === "krw") {
      return sortOrder === "asc" 
        ? a.krw_today - b.krw_today
        : b.krw_today - a.krw_today;
    }
    // ...
  });
  
  return result;
}, [centerDeposits, searchTerm, sortBy, sortOrder]);
```

### 3. 센터 관리 (50개+ 대응)
```typescript
// 검색
const filtered = centers.filter(c =>
  c.center_name.includes(searchTerm) ||
  c.email.includes(searchTerm) ||
  c.domain.includes(searchTerm)
);

// 상태 필터
const statusFiltered = filtered.filter(c =>
  statusFilter === "all" ? true :
  statusFilter === "active" ? c.is_active :
  !c.is_active
);

// 정렬
const sorted = statusFiltered.sort((a, b) => {
  // name, date, status
});
```

---

## 🎯 사용 시나리오

### 시나리오 1: 마스터가 일일 입금액 확인
```bash
1. #master 접속
2. 대시보드 자동 로드
3. 상단 통계 카드에서 일 총 입금액 확인
   → ₩45,800,000 (전일 대비 +7.5%)
4. 하단 테이블에서 센터별 상세 확인
   → Centre1: ₩25,800,000 (+14.7%)
   → Centre2: ₩18,200,000 (-8.1%)
```

### 시나리오 2: 특정 센터 검색
```bash
1. 센터 관리 탭 이동
2. 검색창에 "Centre1" 입력
3. 즉시 필터링되어 1개 결과 표시
4. 수정/삭제/활성화 버튼 클릭
```

### 시나리오 3: 50개 센터 관리
```bash
1. 센터 관리 탭
2. 상태 필터: "활성" 선택 → 48개 표시
3. 정렬: "이름" 오름차순 → 알파벳순 정렬
4. 특정 센터 검색: "api" → 도메인에 api 포함된 센터만 표시
5. 비활성화 필요한 센터 찾기 → 상태 토글 클릭
```

### 시나리오 4: 에이전시별 통계
```bash
1. 에이전시 관리 탭
2. 정렬: "센터 수" 내림차순
3. 가장 많은 센터를 보유한 에이전시 확인
4. 하단에서 총 센터/가맹점 수 확인
```

---

## 🚧 향후 개선 (Phase 5+)

### 1. 실시간 입금액 데이터
```typescript
// TODO: deposits 테이블에서 실제 데이터 집계
const { data: todayDeposits } = await supabase
  .from('deposits')
  .select('amount, currency')
  .gte('created_at', startOfToday())
  .lt('created_at', endOfToday());

// 센터별 그룹화
const centerDeposits = groupByCenterId(todayDeposits);
```

### 2. 가상 스크롤 (100개+ 센터)
```typescript
// react-window 사용
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={centers.length}
  itemSize={60}
>
  {CenterRow}
</FixedSizeList>
```

### 3. 엑셀 내보내기
```typescript
// 센터별 입금액 엑셀 다운로드
import * as XLSX from 'xlsx';

const exportToExcel = () => {
  const ws = XLSX.utils.json_to_sheet(centerDeposits);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "센터별 입금액");
  XLSX.writeFile(wb, `입금액_${today}.xlsx`);
};
```

### 4. 차트 시각화
```typescript
// recharts 사용
import { BarChart, Bar, XAxis, YAxis } from 'recharts';

<BarChart data={centerDeposits}>
  <Bar dataKey="krw_today" fill="#fb923c" />
  <Bar dataKey="coin_today" fill="#60a5fa" />
</BarChart>
```

### 5. 실시간 업데이트 (Supabase Realtime)
```typescript
// deposits 테이블 변경 감지
supabase
  .channel('deposits')
  .on('INSERT', (payload) => {
    // 새 입금 발생 시 자동 업데이트
    fetchCenterDeposits();
  })
  .subscribe();
```

---

## 📝 성능 최적화

### 1. useMemo로 필터링/정렬 캐싱
```typescript
const filteredAndSortedCenters = useMemo(() => {
  // 검색/필터/정렬 로직
}, [centerDeposits, searchTerm, sortBy, sortOrder]);
```

### 2. 디바운싱 검색
```typescript
const [debouncedSearch] = useDebounce(searchTerm, 300);
// 300ms 후 검색 실행
```

### 3. 페이지네이션 (100개+ 센터)
```typescript
const [page, setPage] = useState(1);
const itemsPerPage = 50;
const paginatedCenters = filteredCenters.slice(
  (page - 1) * itemsPerPage,
  page * itemsPerPage
);
```

---

## ✅ 체크리스트

- [x] 일 총 입금액 통계 카드 추가
- [x] 센터별 입금액 테이블 추가
- [x] 원화/코인 구분 표시
- [x] 증감율 계산 및 표시
- [x] 센터 관리 검색/필터/정렬
- [x] 에이전시 관리 검색/필터/정렬
- [x] 컴팩트 테이블 디자인
- [x] 50개 이상 관리 가능
- [ ] 실제 deposits 데이터 연동 (Phase 5)
- [ ] 가상 스크롤 (100개+)
- [ ] 엑셀 내보내기
- [ ] 차트 시각화
- [ ] 실시간 업데이트

---

## 🎉 완료!

마스터 대시보드가 실무에 적합한 대시보드로 개선되었습니다:
- ✅ 일 총 입금액 한눈에 확인
- ✅ 센터별 상세 입금액 비교
- ✅ 50개 이상 센터/에이전시 효율적 관리
- ✅ 검색/필터/정렬로 빠른 탐색

**다음 단계:** 실제 입금 데이터 연동 및 차트 시각화 (Phase 5)
