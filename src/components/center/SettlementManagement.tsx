import { useState, useEffect, useMemo } from "react";
import { TrendingUp, DollarSign, Calendar, Search, ArrowUpDown, Store, History } from "lucide-react";
import { NeonCard } from "../NeonCard";
import { StatCard } from "../StatCard";
import { supabase } from "../../utils/supabase/client";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner@2.0.3";
import { getStoresWithHierarchy, getBatchSettlementStats, getBatchDailyStats } from "../../utils/settlementHelpers";
import { getDateRange } from "../../utils/depositHelpers";
import { FeeRateHistoryViewer } from "./FeeRateHistoryViewer";

interface StoreSettlement {
  store_id: string;
  store_name: string;
  total_deposit: number;
  total_withdrawal: number;
  fee_rate: number;
  total_fee: number;
  net_profit: number;
  transaction_count: number;
}

interface DailySummary {
  date: string;
  total_deposit: number;
  total_fee: number;
  net_profit: number;
}

export function SettlementManagement() {
  const { user } = useAuth();
  const [settlements, setSettlements] = useState<StoreSettlement[]>([]);
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "deposit" | "profit" | "fee">("deposit");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRealTimeUpdate, setIsRealTimeUpdate] = useState(false);
  const [centerFeeRate, setCenterFeeRate] = useState<number>(0);

  // 초기 로드 (화면 로딩 시에만)
  useEffect(() => {
    if (user) fetchSettlementData();
  }, [user]);

  // 날짜 변경 시 (로딩 없이 부드럽게 업데이트)
  useEffect(() => {
    const loadData = async () => {
      try {
        if (!user) return;
        const dateObj = new Date(selectedDate);
        const { start, end } = getDateRange(dateObj);
        
        console.log('[Center] 날짜 변경 시작:', selectedDate, { start, end });
        
        const storesWithHierarchy = await getStoresWithHierarchy(user.id);
        console.log('[Center] 가맹점 계층 조회 완료:', storesWithHierarchy.length);
        
        if (storesWithHierarchy.length === 0) {
          console.log('[Center] 가맹점 없음 - 빈 배열로 설정');
          setSettlements([]);
          setLastUpdated(new Date());
          return;
        }
        
        // 배치로 정산 데이터 조회
        const storeStats = await getBatchSettlementStats(storesWithHierarchy, start, end);
        console.log('[Center] 배치 정산 데이터 조회 완료:', storeStats.size);
        
        const settlementData: StoreSettlement[] = storesWithHierarchy.map(store => {
          const stats = storeStats.get(store.center_id) || {
            total_deposit: 0,
            total_withdrawal: 0,
            transaction_count: 0
          };
          const feeRate = store.fee_rate / 100;
          const totalFee = stats.total_deposit * feeRate;
          const netProfit = stats.total_deposit - totalFee;
          return {
            store_id: store.center_id,
            store_name: store.center_name,
            total_deposit: stats.total_deposit,
            total_withdrawal: stats.total_withdrawal,
            fee_rate: feeRate,
            total_fee: totalFee,
            net_profit: netProfit,
            transaction_count: stats.transaction_count
          };
        });
        
        console.log('[Center] 최종 데이터 설정 완료:', settlementData.length, 'rows');
        setSettlements(settlementData);
        setLastUpdated(new Date());
      } catch (error) {
        console.error('[Center] 날짜 변경 실패:', error);
        setSettlements([]);
        setLastUpdated(new Date());
      }
    };
    
    loadData();
  }, [selectedDate]);

  // 실시간 업데이트 구독
  useEffect(() => {
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];
    
    // 오늘 날짜가 선택된 경우에만 실시간 구독 활성화
    if (selectedDate !== today) {
      return;
    }

    // 기존 채널 제거
    supabase.removeChannel('center-settlement-deposits-realtime');
    supabase.removeChannel('center-settlement-withdrawals-realtime');

    // deposits 테이블의 변경사항 구독
    const depositsChannel = supabase
      .channel('center-settlement-deposits-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deposits'
        },
        (payload) => {
          console.log('입금 변경 감지:', payload);
          setIsRealTimeUpdate(true);
          
          setTimeout(() => {
            fetchSettlementData(true);
            setIsRealTimeUpdate(false);
          }, 500);
        }
      )
      .subscribe();

    // withdrawals 테이블의 변경사항 구독
    const withdrawalsChannel = supabase
      .channel('center-settlement-withdrawals-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'withdrawals'
        },
        (payload) => {
          console.log('출금 변경 감지:', payload);
          setIsRealTimeUpdate(true);
          
          setTimeout(() => {
            fetchSettlementData(true);
            setIsRealTimeUpdate(false);
          }, 500);
        }
      )
      .subscribe();

    // 30초마다 자동 새로고침
    const autoRefreshInterval = setInterval(() => {
      fetchSettlementData(true);
    }, 30000);

    return () => {
      depositsChannel.unsubscribe();
      withdrawalsChannel.unsubscribe();
      clearInterval(autoRefreshInterval);
    };
  }, [selectedDate, user]);

  const fetchSettlementData = async (isAutoRefresh = false) => {
    try {
      if (!isAutoRefresh) {
        setLoading(true);
      }
      if (!user) return;

      console.time('⏱️ 센터 정산 데이터 조회');

      // Step 0: 센터 정보 조회 (수수료율)
      const { data: centerData } = await supabase
        .from('centers')
        .select('commission_rate')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (centerData) {
        setCenterFeeRate(centerData.commission_rate || 0);
      }

      // Step 1: 가맹점 및 계층 구조를 한 번에 조회 (최적화)
      console.time('1. 가맹점 계층 구조 조회');
      const storesWithHierarchy = await getStoresWithHierarchy(user.id);
      console.timeEnd('1. 가맹점 계층 구조 조회');

      if (storesWithHierarchy.length === 0) {
        setSettlements([]);
        setDailySummaries([]);
        setLoading(false);
        return;
      }

      // Step 2: 선택한 날짜의 정산 데이터 조회 (배치 처리)
      console.time('2. 현재 날짜 정산 데이터 조회');
      const dateObj = new Date(selectedDate);
      const { start, end } = getDateRange(dateObj);
      const batchStats = await getBatchSettlementStats(storesWithHierarchy, start, end);
      console.timeEnd('2. 현재 날짜 정산 데이터 조회');

      // Step 3: 정산 데이터 가공
      const settlementData: StoreSettlement[] = storesWithHierarchy.map(store => {
        const stats = batchStats.get(store.center_id) || {
          total_deposit: 0,
          total_withdrawal: 0,
          transaction_count: 0
        };

        const feeRate = store.fee_rate / 100;
        const totalFee = stats.total_deposit * feeRate;
        const netProfit = stats.total_deposit - totalFee;

        return {
          store_id: store.center_id,
          store_name: store.center_name,
          total_deposit: stats.total_deposit,
          total_withdrawal: stats.total_withdrawal,
          fee_rate: feeRate,
          total_fee: totalFee,
          net_profit: netProfit,
          transaction_count: stats.transaction_count
        };
      });

      setSettlements(settlementData);
      setLastUpdated(new Date());

      // Step 4: 7일치 일일 데이터 조회 (배치 처리)
      if (!isAutoRefresh) {
        console.time('3. 7일치 일일 데이터 조회');
      const dateRanges = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const { start: dStart, end: dEnd } = getDateRange(d);
        dateRanges.push({ date: dateStr, start: dStart, end: dEnd });
      }

      const dailyStatsMap = await getBatchDailyStats(storesWithHierarchy, dateRanges);
      console.timeEnd('3. 7일치 일일 데이터 조회');

      // Step 5: 일일 데이터 가공
      const dailyData: DailySummary[] = dateRanges.map(({ date }) => {
        const stats = dailyStatsMap.get(date) || {
          total_deposit: 0,
          total_withdrawal: 0,
          transaction_count: 0
        };

        // 모든 가맹점의 수수료율을 적용하여 총 수수료 계산
        const totalFee = storesWithHierarchy.reduce((sum, store) => {
          return sum + (stats.total_deposit * (store.fee_rate / 100));
        }, 0) / storesWithHierarchy.length;

        return {
          date,
          total_deposit: stats.total_deposit,
          total_fee: totalFee,
          net_profit: stats.total_deposit - totalFee
        };
      });

        setDailySummaries(dailyData);

        console.timeEnd('⏱️ 센터 정산 데이터 조회');
      }

    } catch (error) {
      console.error('정산 데이터 조회 실패:', error);
      if (!isAutoRefresh) {
        toast.error('정산 데이터를 불러오는데 실패했습니다');
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredAndSortedSettlements = useMemo(() => {
    let result = [...settlements];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(s => s.store_name.toLowerCase().includes(term));
    }
    result.sort((a, b) => {
      let compareValue = 0;
      if (sortBy === "name") compareValue = a.store_name.localeCompare(b.store_name);
      else if (sortBy === "deposit") compareValue = a.total_deposit - b.total_deposit;
      else if (sortBy === "profit") compareValue = a.net_profit - b.net_profit;
      else if (sortBy === "fee") compareValue = a.total_fee - b.total_fee;
      return sortOrder === "asc" ? compareValue : -compareValue;
    });
    return result;
  }, [settlements, searchTerm, sortBy, sortOrder]);

  const handleSort = (column: "name" | "deposit" | "profit" | "fee") => {
    if (sortBy === column) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortBy(column); setSortOrder("desc"); }
  };

  const totalStats = useMemo(() => {
    const reduced = settlements.reduce((acc, curr) => ({
      total_deposit: acc.total_deposit + curr.total_deposit,
      total_fee: acc.total_fee + curr.total_fee,
      net_profit: acc.net_profit + curr.net_profit,
      transaction_count: acc.transaction_count + curr.transaction_count
    }), { total_deposit: 0, total_fee: 0, net_profit: 0, transaction_count: 0 });
    
    // 마스터에게 지불할 수수료 = 총 입금액 * 센터 수수료율
    const masterFee = reduced.total_deposit * (centerFeeRate / 100);
    
    return {
      ...reduced,
      master_fee: masterFee
    };
  }, [settlements, centerFeeRate]);

  const formatCurrency = (amount: number) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-cyan-400 mb-2">정산 관리</h2>
          <div className="flex items-center gap-3">
            <p className="text-slate-400 text-sm">가맹점별 수수료 및 순수익 관리</p>
            {selectedDate === new Date().toISOString().split('T')[0] && (
              <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/30 rounded-full">
                <div className={`w-2 h-2 rounded-full bg-green-400 ${isRealTimeUpdate ? 'animate-ping' : 'animate-pulse'}`}></div>
                <span className="text-green-400 text-xs">실시간 업데이트</span>
              </div>
            )}
          </div>
          <p className="text-slate-500 text-xs mt-1">
            마지막 업데이트: {lastUpdated.toLocaleTimeString('ko-KR')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchSettlementData()}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-400 rounded-lg transition-colors"
            title="새로고침"
          >
            <History className="w-4 h-4" /> 새로고침
          </button>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 text-sm focus:outline-none focus:border-cyan-500/50" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="총 입금액" value={formatCurrency(totalStats.total_deposit)} change={`${totalStats.transaction_count}건`} trend="up" icon={DollarSign} color="cyan" />
        <StatCard title="가맹점 수수료" value={formatCurrency(totalStats.total_fee)} change="센터 수수료" trend="up" icon={DollarSign} color="amber" />
        <StatCard title="마스터 수수료" value={formatCurrency(totalStats.master_fee)} change={`${centerFeeRate}% 요율`} trend="warning" icon={DollarSign} color="purple" />
        <StatCard title="순수익" value={formatCurrency(totalStats.total_fee - totalStats.master_fee)} change="당일순수익" trend="up" icon={TrendingUp} color="green" />
      </div>

      <NeonCard>
        <div className="p-4 border-b border-slate-700"><h3 className="text-slate-300">최근 7일 정산 추이</h3></div>
        <div className="p-4">
          <div className="grid grid-cols-7 gap-2">
            {dailySummaries.map((day) => (
              <div key={day.date} className="p-3 bg-slate-800/50 rounded-lg">
                <div className="text-xs text-slate-400 mb-2">{day.date}</div>
                <div className="text-sm text-white mb-1">{formatCurrency(day.total_deposit)}</div>
                <div className="text-xs text-cyan-400">순수익: {formatCurrency(day.net_profit)}</div>
              </div>
            ))}
          </div>
        </div>
      </NeonCard>

      <NeonCard>
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-slate-300">가맹점별 정산 내역</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" placeholder="가맹점명 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 text-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-sm">
                <th className="text-left py-3 px-4"><button onClick={() => handleSort("name")} className="hover:text-cyan-400">가맹점명</button></th>
                <th className="text-right py-3 px-4"><button onClick={() => handleSort("deposit")} className="hover:text-cyan-400">총 입금액</button></th>
                <th className="text-right py-3 px-4">수수료율</th>
                <th className="text-right py-3 px-4"><button onClick={() => handleSort("fee")} className="hover:text-cyan-400">수수료</button></th>
                <th className="text-right py-3 px-4"><button onClick={() => handleSort("profit")} className="hover:text-cyan-400">순수익</button></th>
                <th className="text-right py-3 px-4">거래건수</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedSettlements.map((s) => (
                <tr key={s.store_id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-3 px-4 text-slate-300"><div className="flex items-center gap-2"><Store className="w-4 h-4 text-cyan-400" />{s.store_name}</div></td>
                  <td className="py-3 px-4 text-right text-white">{formatCurrency(s.total_deposit)}</td>
                  <td className="py-3 px-4 text-right text-amber-400">{(s.fee_rate * 100).toFixed(1)}%</td>
                  <td className="py-3 px-4 text-right text-amber-400">{formatCurrency(s.total_fee)}</td>
                  <td className="py-3 px-4 text-right text-cyan-400">{formatCurrency(s.net_profit)}</td>
                  <td className="py-3 px-4 text-right text-slate-400">{s.transaction_count}건</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </NeonCard>
      <FeeRateHistoryViewer />
    </div>
  );
}