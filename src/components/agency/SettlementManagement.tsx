import { useState, useEffect, useMemo } from "react";
import { TrendingUp, DollarSign, Calendar, Search, ArrowUpDown, Eye, History } from "lucide-react";
import { NeonCard } from "../NeonCard";
import { supabase } from "../../utils/supabase/client";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner@2.0.3";
import { getChildUserIds, getSettlementStats } from "../../utils/settlementHelpers";
import { getDateRange } from "../../utils/depositHelpers";

interface CenterSettlement {
  center_id: string;
  center_name: string;
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
  const [settlements, setSettlements] = useState<CenterSettlement[]>([]);
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
        
        console.log('[Agency] 날짜 변경 시작:', selectedDate, { start, end });
        
        const centerIds = await getChildUserIds(user.id);
        console.log('[Agency] 센터 ID 조회 완료:', centerIds);
        
        if (!centerIds || centerIds.length === 0) {
          console.log('[Agency] 센터 없음 - 빈 배열로 설정');
          setSettlements([]);
          setLastUpdated(new Date());
          return;
        }
        
        // 각 센터별로 정산 데이터 조회
        const settlementPromises = centerIds.map(async (centerId) => {
          const stats = await getSettlementStats([centerId], start, end);
          return { centerId, stats };
        });
        
        const settlementResults = await Promise.all(settlementPromises);
        console.log('[Agency] 정산 데이터 조회 완료:', settlementResults.length);
        
        const settlementData: CenterSettlement[] = settlementResults.map(({ centerId, stats }) => {
          const feeRate = (stats.fee_rate || 0.02);
          const totalFee = stats.total_deposit * feeRate;
          const netProfit = stats.total_deposit - totalFee;
          return {
            center_id: centerId,
            center_name: stats.center_name || centerId,
            total_deposit: stats.total_deposit,
            total_withdrawal: stats.total_withdrawal,
            fee_rate: feeRate,
            total_fee: totalFee,
            net_profit: netProfit,
            transaction_count: stats.transaction_count
          };
        });
        
        console.log('[Agency] 최종 데이터 설정 완료:', settlementData.length, 'rows');
        setSettlements(settlementData);
        setLastUpdated(new Date());
      } catch (error) {
        console.error('[Agency] 날짜 변경 실패:', error);
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
    
    if (selectedDate !== today) {
      return;
    }

    const depositsChannel = supabase
      .channel('agency-settlement-deposits-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deposits'
        },
        (payload) => {
          setIsRealTimeUpdate(true);
          setTimeout(() => {
            fetchSettlementData(true);
            setIsRealTimeUpdate(false);
          }, 500);
        }
      )
      .subscribe();

    const withdrawalsChannel = supabase
      .channel('agency-settlement-withdrawals-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'withdrawals'
        },
        (payload) => {
          setIsRealTimeUpdate(true);
          setTimeout(() => {
            fetchSettlementData(true);
            setIsRealTimeUpdate(false);
          }, 500);
        }
      )
      .subscribe();

    const autoRefreshInterval = setInterval(() => {
      fetchSettlementData(true);
    }, 30000);

    return () => {
      supabase.removeChannel(depositsChannel);
      supabase.removeChannel(withdrawalsChannel);
      clearInterval(autoRefreshInterval);
    };
  }, [selectedDate, user]);

  const fetchSettlementData = async (isAutoRefresh = false) => {
    try {
      if (!isAutoRefresh) {
        setLoading(true);
      }
      if (!user) return;

      // 센터 목록 조회
      const { data: centers, error: centersError } = await supabase
        .from('centers')
        .select('id, name, user_id, commission_rate')
        .eq('agency_id', (await supabase.from('agencies').select('id').eq('user_id', user.id).single()).data?.id)
        .order('created_at', { ascending: false });

      if (centersError) throw centersError;

      const dateObj = new Date(selectedDate);
      const { start, end } = getDateRange(dateObj);

      const settlementData = await Promise.all((centers || []).map(async (center) => {
        const userIds = await getChildUserIds(center.user_id);
        const stats = await getSettlementStats(userIds, start, end);
        const feeRate = (center.commission_rate || 0.2) / 100;
        const totalFee = stats.total_deposit * feeRate;
        const netProfit = stats.total_deposit - totalFee;

        return {
          center_id: center.user_id,
          center_name: center.name,
          total_deposit: stats.total_deposit,
          total_withdrawal: stats.total_withdrawal,
          fee_rate: feeRate,
          total_fee: totalFee,
          net_profit: netProfit,
          transaction_count: stats.transaction_count
        };
      }));

      setSettlements(settlementData);

      const dailyData: DailySummary[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const { start: dStart, end: dEnd } = getDateRange(d);
        
        let dayTotalDeposit = 0;
        let dayTotalFee = 0;

        for (const center of centers || []) {
          const centerIds = await getChildUserIds(center.user_id);
          const stats = await getSettlementStats(centerIds, dStart, dEnd);
          dayTotalDeposit += stats.total_deposit;
          dayTotalFee += stats.total_deposit * ((center.commission_rate || 0.2) / 100);
        }

        dailyData.push({
          date: dateStr,
          total_deposit: dayTotalDeposit,
          total_fee: dayTotalFee,
          net_profit: dayTotalDeposit - dayTotalFee
        });
      }
      
      if (!isAutoRefresh) {
        setDailySummaries(dailyData);
      }
      setLastUpdated(new Date());
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
      result = result.filter(s => s.center_name.toLowerCase().includes(term));
    }
    result.sort((a, b) => {
      let compareValue = 0;
      if (sortBy === "name") compareValue = a.center_name.localeCompare(b.center_name);
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
    return settlements.reduce((acc, curr) => ({
      total_deposit: acc.total_deposit + curr.total_deposit,
      total_fee: acc.total_fee + curr.total_fee,
      net_profit: acc.net_profit + curr.net_profit,
      transaction_count: acc.transaction_count + curr.transaction_count
    }), { total_deposit: 0, total_fee: 0, net_profit: 0, transaction_count: 0 });
  }, [settlements]);

  const formatCurrency = (amount: number) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-cyan-400 mb-2">정산 관리</h2>
          <div className="flex items-center gap-3">
            <p className="text-slate-400 text-sm">센터별 수수료 및 순수익 조회 (읽기 전용)</p>
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
        <div className="relative p-6 bg-slate-900/80 border border-cyan-500/20 rounded-xl">
          <p className="text-slate-400 text-sm mb-1">총 입금액</p>
          <p className="text-white text-2xl mb-2">{formatCurrency(totalStats.total_deposit)}</p>
          <p className="text-slate-500 text-xs">거래 {totalStats.transaction_count}건</p>
        </div>
        <div className="relative p-6 bg-slate-900/80 border border-amber-500/20 rounded-xl">
          <p className="text-slate-400 text-sm mb-1">총 수수료</p>
          <p className="text-amber-400 text-2xl mb-2">{formatCurrency(totalStats.total_fee)}</p>
          <p className="text-slate-500 text-xs">센터별 요율 적용</p>
        </div>
        <div className="relative p-6 bg-slate-900/80 border-2 border-cyan-500/50 rounded-xl">
          <p className="text-slate-400 text-sm mb-1">순수익</p>
          <p className="text-cyan-400 text-2xl mb-2">{formatCurrency(totalStats.net_profit)}</p>
          <p className="text-cyan-500 text-xs">수수료 제외</p>
        </div>
        <div className="relative p-6 bg-slate-900/80 border border-purple-500/20 rounded-xl">
          <p className="text-slate-400 text-sm mb-1">관리 센터</p>
          <p className="text-white text-2xl mb-2">{settlements.length}개</p>
          <p className="text-slate-500 text-xs">정산 대상</p>
        </div>
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
          <h3 className="text-slate-300">센터별 정산 내역</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" placeholder="센터명 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 text-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-sm">
                <th className="text-left py-3 px-4"><button onClick={() => handleSort("name")} className="hover:text-cyan-400">센터명</button></th>
                <th className="text-right py-3 px-4"><button onClick={() => handleSort("deposit")} className="hover:text-cyan-400">총 입금액</button></th>
                <th className="text-right py-3 px-4">수수료율</th>
                <th className="text-right py-3 px-4"><button onClick={() => handleSort("fee")} className="hover:text-cyan-400">수수료</button></th>
                <th className="text-right py-3 px-4"><button onClick={() => handleSort("profit")} className="hover:text-cyan-400">순수익</button></th>
                <th className="text-right py-3 px-4">거래건수</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedSettlements.map((s) => (
                <tr key={s.center_id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-3 px-4 text-slate-300">{s.center_name}</td>
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
      <div className="text-sm text-slate-500 text-center p-4 bg-slate-800/30 rounded-lg"><Eye className="w-4 h-4 inline-block mr-2" />읽기 전용 모드 - 정산 데이터는 마스터가 관리합니다</div>
    </div>
  );
}