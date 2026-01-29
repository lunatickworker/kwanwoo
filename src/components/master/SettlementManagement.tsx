import { useState, useEffect, useMemo } from "react";
import { TrendingUp, TrendingDown, DollarSign, Calendar, Download, Search, Filter, ArrowUpDown, History, Clock } from "lucide-react";
import { NeonCard } from "../NeonCard";
import { supabase } from "../../utils/supabase/client";
import { toast } from "sonner@2.0.3";
import { FeeRateHistoryViewer } from "./FeeRateHistoryViewer";
import { getAllCentersWithHierarchy, getBatchSettlementStats, CenterWithHierarchy } from "../../utils/settlementHelpers";
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
  last_settlement_date: string;
}

interface DailySummary {
  date: string;
  total_deposit: number;
  total_fee: number;
  net_profit: number;
  center_count: number;
}

export function SettlementManagement() {
  const [settlements, setSettlements] = useState<CenterSettlement[]>([]);
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "deposit" | "profit" | "fee">("deposit");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    fetchSettlementData();
  }, [selectedDate]);

  const fetchSettlementData = async () => {
    try {
      setLoading(true);
      
      // 1. 모든 센터와 계층 구조를 한 번에 조회 (최적화)
      const centersWithHierarchy = await getAllCentersWithHierarchy();

      if (centersWithHierarchy.length === 0) {
        setSettlements([]);
        setLoading(false);
        setChartLoading(false);
        return;
      }

      const dateObj = new Date(selectedDate);
      const { start, end } = getDateRange(dateObj);

      // 2. 선택된 날짜의 모든 데이터를 배치로 조회 (최적화)
      const centerStats = await getBatchSettlementStats(centersWithHierarchy, start, end);

      // 3. 센터별 정산 데이터 생성
      const settlementData: CenterSettlement[] = centersWithHierarchy.map(center => {
        const stats = centerStats.get(center.center_id) || {
          total_deposit: 0,
          total_withdrawal: 0,
          transaction_count: 0
        };
        
        const feeRate = center.fee_rate / 100;
        const totalFee = stats.total_deposit * feeRate;
        const netProfit = stats.total_deposit - totalFee;

        return {
          center_id: center.center_id,
          center_name: center.center_name,
          total_deposit: stats.total_deposit,
          total_withdrawal: stats.total_withdrawal,
          fee_rate: feeRate,
          total_fee: totalFee,
          net_profit: netProfit,
          transaction_count: stats.transaction_count,
          last_settlement_date: selectedDate
        };
      });

      setSettlements(settlementData);
      setLoading(false);

      // 4. 7일 차트 데이터는 비동기로 로드 (사용자 경험 개선)
      fetchDailySummaries(centersWithHierarchy);
    } catch (error) {
      console.error('정산 데이터 조회 실패:', error);
      toast.error('정산 데이터를 불러오는데 실패했습니다');
      setLoading(false);
      setChartLoading(false);
    }
  };

  const fetchDailySummaries = async (centersWithHierarchy: CenterWithHierarchy[]) => {
    try {
      setChartLoading(true);
      
      // 7일 데이터를 병렬로 조회 (최적화)
      const dailyPromises = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const { start: dStart, end: dEnd } = getDateRange(d);
        
        dailyPromises.push(
          getBatchSettlementStats(centersWithHierarchy, dStart, dEnd).then(stats => ({
            date: d.toISOString().split('T')[0],
            stats
          }))
        );
      }

      const dailyResults = await Promise.all(dailyPromises);

      // 집계
      const dailyData: DailySummary[] = dailyResults.map(({ date, stats }) => {
        let dayTotalDeposit = 0;
        let dayTotalFee = 0;
        let centersWithActivity = 0;

        centersWithHierarchy.forEach(center => {
          const centerStat = stats.get(center.center_id);
          if (centerStat && centerStat.transaction_count > 0) {
            dayTotalDeposit += centerStat.total_deposit;
            dayTotalFee += centerStat.total_deposit * (center.fee_rate / 100);
            centersWithActivity++;
          }
        });

        return {
          date,
          total_deposit: dayTotalDeposit,
          total_fee: dayTotalFee,
          net_profit: dayTotalDeposit - dayTotalFee,
          center_count: centersWithActivity
        };
      });
      
      setDailySummaries(dailyData);
    } catch (error) {
      console.error('7일 차트 데이터 조회 실패:', error);
    } finally {
      setChartLoading(false);
    }
  };

  const filteredAndSortedSettlements = useMemo(() => {
    let result = [...settlements];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(s =>
        s.center_name.toLowerCase().includes(term)
      );
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
    return settlements.reduce(
      (acc, curr) => ({
        total_deposit: acc.total_deposit + curr.total_deposit,
        total_fee: acc.total_fee + curr.total_fee,
        net_profit: acc.net_profit + curr.net_profit,
        transaction_count: acc.transaction_count + curr.transaction_count
      }),
      { total_deposit: 0, total_fee: 0, net_profit: 0, transaction_count: 0 }
    );
  }, [settlements]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-cyan-400 mb-2">정산 관리</h2>
          <p className="text-slate-400 text-sm">센터별 수수료 및 순수익 관리</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 text-sm focus:outline-none focus:border-cyan-500/50"
          />
          <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors">
            <Download className="w-4 h-4" /> 내보내기
          </button>
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
          <p className="text-slate-400 text-sm mb-1">활성 센터</p>
          <p className="text-white text-2xl mb-2">{settlements.length}개</p>
          <p className="text-slate-500 text-xs">정산 대상</p>
        </div>
      </div>

      <NeonCard>
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <h3 className="text-slate-300">최근 7일 정산 추이</h3>
            {chartLoading && (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                로딩 중...
              </div>
            )}
          </div>
        </div>
        <div className="p-4">
          {chartLoading ? (
            <div className="grid grid-cols-7 gap-2">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="p-3 bg-slate-800/30 rounded-lg animate-pulse">
                  <div className="h-4 bg-slate-700 rounded mb-2"></div>
                  <div className="h-6 bg-slate-700 rounded mb-1"></div>
                  <div className="h-4 bg-slate-700 rounded"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {dailySummaries.map((day) => (
                <div key={day.date} className="p-3 bg-slate-800/50 rounded-lg">
                  <div className="text-xs text-slate-400 mb-2">{day.date}</div>
                  <div className="text-sm text-white mb-1">{formatCurrency(day.total_deposit)}</div>
                  <div className="text-xs text-cyan-400">순수익: {formatCurrency(day.net_profit)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </NeonCard>

      <NeonCard>
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-slate-300">센터별 정산 내역</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text" placeholder="센터명 검색..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 text-sm"
            />
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
      <FeeRateHistoryViewer />
    </div>
  );
}