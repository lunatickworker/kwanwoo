import { useState, useEffect, useMemo } from "react";
import { TrendingUp, DollarSign, Calendar, History, Store, Percent, Coins } from "lucide-react";
import { NeonCard } from "../NeonCard";
import { StatCard } from "../StatCard";
import { supabase } from "../../utils/supabase/client";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner@2.0.3";
import { getDateRange } from "../../utils/depositHelpers";

interface DailySummary {
  date: string;
  total_deposit: number;
  total_withdrawal: number;
  total_fee: number;
  coin_sales: number;
  net_income: number;
}

interface CoinSale {
  sale_id: string;
  coin_type: string;
  amount: number;
  krw_value: number;
  status: string;
  created_at: string;
}

export function SettlementManagement() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
  const [coinSales, setCoinSales] = useState<CoinSale[]>([]);
  const [feeRate, setFeeRate] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRealTimeUpdate, setIsRealTimeUpdate] = useState(false);
  const [todayStats, setTodayStats] = useState({
    total_deposit: 0,
    total_withdrawal: 0,
    total_fee: 0,
    coin_sales: 0,
    net_income: 0,
    transaction_count: 0
  });

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
        
        console.log('[Store] 날짜 변경 시작:', selectedDate);
        
        // getDateRange가 이미 ISO 문자열을 반환
        const { start, end } = getDateRange(dateObj);
        
        console.log('[Store] 날짜 범위:', { start, end });
        
        // 가맹점 정보에서 수수료율 조회
        const { data: storeData } = await supabase
          .from('stores')
          .select('commission_rate')
          .eq('user_id', user.id)
          .maybeSingle();
        
        const currentFeeRate = storeData?.commission_rate || 2.0;
        console.log('[Store] 수수료율:', currentFeeRate);
        
        // 가맹점의 하위 사용자 ID 조회 (fetchSettlementData와 동일)
        const { data: childUsers } = await supabase
          .from('users')
          .select('user_id')
          .eq('parent_user_id', user.id)
          .eq('role', 'user');
        
        const childUserIds = childUsers?.map(u => u.user_id) || [];
        console.log('[Store] 하위 사용자 ID:', childUserIds);
        
        // 선택된 날짜 데이터 조회 (childUserIds 사용)
        const { data: deposits } = await supabase
          .from('deposits')
          .select('*')
          .in('user_id', childUserIds.length > 0 ? childUserIds : [user.id])
          .in('status', ['confirmed', 'completed'])
          .gte('created_at', start)
          .lt('created_at', end);

        console.log('[Store] 입금 데이터:', deposits?.length || 0);

        const { data: withdrawals } = await supabase
          .from('withdrawals')
          .select('*')
          .in('user_id', childUserIds.length > 0 ? childUserIds : [user.id])
          .eq('status', 'completed')
          .gte('created_at', start)
          .lt('created_at', end);

        console.log('[Store] 출금 데이터:', withdrawals?.length || 0);

        const { data: coinSalesData } = await supabase
          .from('store_coin_sales')
          .select('*')
          .eq('store_id', user.id)
          .gte('created_at', start)
          .lt('created_at', end)
          .eq('status', 'completed');

        console.log('[Store] 코인판매 데이터:', coinSalesData?.length || 0);

        const totalDeposit = deposits?.reduce((sum: number, d: any) => sum + Number(d.krw_value), 0) || 0;
        const totalWithdrawal = withdrawals?.reduce((sum: number, w: any) => sum + Number(w.krw_value), 0) || 0;
        const totalFee = totalDeposit * (currentFeeRate / 100);
        const coinSalesValue = coinSalesData?.reduce((sum: number, cs: any) => sum + Number(cs.krw_value), 0) || 0;

        console.log('[Store] 최종 데이터 설정:', { totalDeposit, totalWithdrawal, coinSalesValue, totalFee });
        
        // 상태 업데이트 (오늘 데이터만)
        setFeeRate(currentFeeRate);
        setCoinSales(coinSalesData || []);
        setTodayStats({
          total_deposit: totalDeposit,
          total_withdrawal: totalWithdrawal,
          total_fee: totalFee,
          coin_sales: coinSalesValue,
          net_income: totalDeposit + coinSalesValue - totalFee,
          transaction_count: (deposits?.length || 0) + (coinSalesData?.length || 0)
        });
        
        setLastUpdated(new Date());
      } catch (error) {
        console.error('[Store] 날짜 변경 실패:', error);
        setTodayStats({
          total_deposit: 0,
          total_withdrawal: 0,
          total_fee: 0,
          coin_sales: 0,
          net_income: 0,
          transaction_count: 0
        });
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

    // deposits 테이블의 변경사항 구독
    const depositsChannel = supabase
      .channel('store-settlement-deposits-realtime')
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
      .channel('store-settlement-withdrawals-realtime')
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

    // store_coin_sales 테이블의 변경사항 구독
    const salesChannel = supabase
      .channel('store-settlement-coin-sales-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'store_coin_sales'
        },
        (payload) => {
          console.log('코인 판매 변경 감지:', payload);
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
      salesChannel.unsubscribe();
      clearInterval(autoRefreshInterval);
    };
  }, [selectedDate, user]);

  const fetchSettlementData = async (isAutoRefresh = false) => {
    try {
      if (!isAutoRefresh) {
        setLoading(true);
      }
      if (!user) return;

      console.time('⏱️ 가맹점 정산 데이터 조회');

      // Step 1: 가맹점 정보 조회 - stores 테이블에서 commission_rate 가져오기
      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .select('commission_rate, center_id')
        .eq('user_id', user.id)
        .maybeSingle();

      // stores 테이블에 레코드가 없으면 기본값 사용 (기존 가맹점)
      const currentFeeRate = storeData?.commission_rate || 2.0; // 기본값 2%
      setFeeRate(currentFeeRate);

      console.log('✅ 가맹점 수수료율:', currentFeeRate + '%');

      // Step 2: 가맹점의 하위 사용자 ID 조회
      const { data: childUsers, error: usersError } = await supabase
        .from('users')
        .select('user_id')
        .eq('parent_user_id', user.id)
        .eq('role', 'user');

      if (usersError) throw usersError;

      const childUserIds = childUsers?.map(u => u.user_id) || [];
      console.log('✅ 가맹점 하위 사용자 수:', childUserIds.length);

      // Step 3: 선택한 날짜의 입출금 데이터 조회 (병렬화)
      const dateObj = new Date(selectedDate);
      const { start, end } = getDateRange(dateObj);

      // 3개 쿼리를 병렬로 실행
      const [depositsResult, withdrawalsResult, salesResult] = await Promise.all([
        supabase
          .from('deposits')
          .select('krw_value, amount, coin_type, created_at')
          .in('user_id', childUserIds.length > 0 ? childUserIds : [''])
          .in('status', ['confirmed', 'completed'])
          .gte('created_at', start)
          .lt('created_at', end),
        supabase
          .from('withdrawals')
          .select('amount, coin_type, created_at')
          .in('user_id', childUserIds.length > 0 ? childUserIds : [''])
          .eq('status', 'completed')
          .gte('created_at', start)
          .lt('created_at', end),
        supabase
          .from('store_coin_sales')
          .select('*')
          .eq('store_id', user.id)
          .in('status', ['approved', 'completed'])
          .gte('created_at', start)
          .lt('created_at', end)
      ]);

      const deposits = depositsResult.data || [];
      const withdrawals = withdrawalsResult.data || [];
      const sales = salesResult.data || [];

      // 통계 계산
      const totalDeposit = deposits.reduce((sum, d) => sum + (Number(d.krw_value) || 0), 0);
      const totalWithdrawal = withdrawals.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
      const totalFee = totalDeposit * (currentFeeRate / 100);
      const totalCoinSales = sales.reduce((sum, s) => sum + (Number(s.krw_value) || 0), 0);
      const netIncome = totalDeposit - totalFee;

      setTodayStats({
        total_deposit: totalDeposit,
        total_withdrawal: totalWithdrawal,
        total_fee: totalFee,
        coin_sales: totalCoinSales,
        net_income: netIncome,
        transaction_count: deposits.length + withdrawals.length
      });

      // 코인 판매 내역 저장
      setCoinSales(sales);

      console.log('✅ 선택된 날짜 데이터 로드 완료');

      // Step 4: 최근 7일치 일일 데이터를 백그라운드에서 조회 (비동기)
      if (!isAutoRefresh) {
        console.log('📊 최근 7일 데이터 백그라운드 로드 시작...');
        
        // 로딩 완료 후 7일 데이터는 백그라운드에서 로드
        setLoading(false);
        
        // 비동기로 7일 데이터 로드 (UI 블로킹 안 함)
        setTimeout(async () => {
          try {
            const dailyData: DailySummary[] = [];
            
            // 7일 데이터를 병렬로 조회 (루프 제거)
            const dailyPromises = [];
            for (let i = 6; i >= 0; i--) {
              const d = new Date();
              d.setDate(d.getDate() - i);
              const dateStr = d.toISOString().split('T')[0];
              const { start: dStart, end: dEnd } = getDateRange(d);

              dailyPromises.push(
                Promise.all([
                  supabase
                    .from('deposits')
                    .select('krw_value')
                    .in('user_id', childUserIds.length > 0 ? childUserIds : [''])
                    .in('status', ['confirmed', 'completed'])
                    .gte('created_at', dStart)
                    .lt('created_at', dEnd),
                  supabase
                    .from('withdrawals')
                    .select('amount')
                    .in('user_id', childUserIds.length > 0 ? childUserIds : [''])
                    .eq('status', 'completed')
                    .gte('created_at', dStart)
                    .lt('created_at', dEnd),
                  supabase
                    .from('store_coin_sales')
                    .select('krw_value')
                    .eq('store_id', user.id)
                    .in('status', ['approved', 'completed'])
                    .gte('created_at', dStart)
                    .lt('created_at', dEnd)
                ]).then(([depRes, withRes, saleRes]) => ({
                  date: dateStr,
                  deposits: depRes.data || [],
                  withdrawals: withRes.data || [],
                  sales: saleRes.data || []
                }))
              );
            }

            const dailyResults = await Promise.all(dailyPromises);
            
            dailyResults.forEach(({ date, deposits: dayDeposits, withdrawals: dayWithdrawals, sales: daySales }) => {
              const totalDayDeposit = dayDeposits.reduce((sum, d) => sum + (Number(d.krw_value) || 0), 0);
              const totalDayWithdrawal = dayWithdrawals.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
              const totalDayFee = totalDayDeposit * (currentFeeRate / 100);
              const totalDaySales = daySales.reduce((sum, s) => sum + (Number(s.krw_value) || 0), 0);

              dailyData.push({
                date,
                total_deposit: totalDayDeposit,
                total_withdrawal: totalDayWithdrawal,
                total_fee: totalDayFee,
                coin_sales: totalDaySales,
                net_income: totalDayDeposit + totalDaySales - totalDayFee
              });
            });

            setDailySummaries(dailyData);
            console.log('✅ 최근 7일 데이터 로드 완료:', dailyData.length);
          } catch (error) {
            console.error('최근 7일 데이터 로드 실패:', error);
          }
        }, 100);
        
        return;
      }

      setLoading(false);
      console.timeEnd('⏱️ 가맹점 정산 데이터 조회');

    } catch (error) {
      console.error('정산 데이터 조회 실패:', error);
      if (!isAutoRefresh) {
        toast.error('정산 데이터를 불러오는데 실패했습니다');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
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
          <div className="flex items-center gap-3">
            <p className="text-slate-400 text-sm">입출금 및 코인 판매 정산</p>
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
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 text-sm focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="총 입금액"
          value={formatCurrency(todayStats.total_deposit)}
          change={`${todayStats.transaction_count}건`}
          trend="up"
          icon={DollarSign}
          color="cyan"
        />
        <StatCard
          title="센터 수수료"
          value={formatCurrency(todayStats.total_fee)}
          change={`${feeRate}%`}
          trend="warning"
          icon={Percent}
          color="amber"
        />
        <StatCard
          title="순수입"
          value={formatCurrency(todayStats.net_income)}
          change="수수료 제외"
          trend="up"
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          title="코인 판매"
          value={formatCurrency(todayStats.coin_sales)}
          change={`${coinSales.length}건`}
          trend="up"
          icon={Coins}
          color="purple"
        />
      </div>

      {/* 최근 7일 정산 추이 */}
      <NeonCard>
        <div className="p-4 border-b border-slate-700">
          <h3 className="text-slate-300">최근 7일 정산 추이</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-7 gap-2">
            {dailySummaries.map((day) => (
              <div key={day.date} className="p-3 bg-slate-800/50 rounded-lg">
                <div className="text-xs text-slate-400 mb-2">
                  {new Date(day.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-white mb-1">
                    {formatCurrency(day.total_deposit)}
                  </div>
                  <div className="text-xs text-amber-400">
                    수수료: {formatCurrency(day.total_fee)}
                  </div>
                  <div className="text-xs text-cyan-400">
                    순수입: {formatCurrency(day.net_income)}
                  </div>
                  {day.coin_sales > 0 && (
                    <div className="text-xs text-purple-400">
                      판매: {formatCurrency(day.coin_sales)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </NeonCard>

      {/* 정산 상세 정보 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 수수료 정보 */}
        <NeonCard>
          <div className="p-4 border-b border-slate-700">
            <h3 className="text-slate-300">수수료 정보</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-slate-800/50 rounded-lg">
                <div>
                  <p className="text-slate-400 text-sm">센터 수수료율</p>
                  <p className="text-2xl font-bold text-amber-400 mt-1">{feeRate}%</p>
                </div>
                <Percent className="w-8 h-8 text-amber-400/50" />
              </div>
              
              <div className="border-t border-slate-700/50 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">총 입금액</span>
                  <span className="text-white">{formatCurrency(todayStats.total_deposit)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">센터 수수료 ({feeRate}%)</span>
                  <span className="text-amber-400">-{formatCurrency(todayStats.total_fee)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-700/50">
                  <span className="text-slate-300">순수입</span>
                  <span className="text-cyan-400">{formatCurrency(todayStats.net_income)}</span>
                </div>
              </div>
            </div>
          </div>
        </NeonCard>

        {/* 코인 판매 현황 */}
        <NeonCard>
          <div className="p-4 border-b border-slate-700">
            <h3 className="text-slate-300">코인 판매 현황</h3>
          </div>
          <div className="p-4">
            {coinSales.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                선택한 날짜에 판매 내역이 없습니다
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {coinSales.map((sale) => (
                  <div
                    key={sale.sale_id}
                    className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800/70 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Coins className="w-4 h-4 text-purple-400" />
                        <span className="text-slate-300 font-medium">
                          {sale.coin_type}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          sale.status === 'completed' 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {sale.status === 'completed' ? '완료' : '승인됨'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {formatDate(sale.created_at)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-medium">
                        {formatCurrency(sale.krw_value)}
                      </div>
                      <div className="text-xs text-slate-400">
                        {sale.amount} {sale.coin_type}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </NeonCard>
      </div>

      {/* 정산 요약 */}
      <NeonCard>
        <div className="p-4 border-b border-slate-700">
          <h3 className="text-slate-300">오늘의 정산 요약</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-cyan-500/20 rounded-lg">
                  <DollarSign className="w-5 h-5 text-cyan-400" />
                </div>
                <h4 className="text-slate-300 font-medium">입금</h4>
              </div>
              <p className="text-2xl font-bold text-white mb-1">
                {formatCurrency(todayStats.total_deposit)}
              </p>
              <p className="text-xs text-slate-400">
                수수료 차감 전 금액
              </p>
            </div>

            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <Percent className="w-5 h-5 text-amber-400" />
                </div>
                <h4 className="text-slate-300 font-medium">센터 수수료</h4>
              </div>
              <p className="text-2xl font-bold text-white mb-1">
                {formatCurrency(todayStats.total_fee)}
              </p>
              <p className="text-xs text-slate-400">
                센터에 지불하는 수수료 ({feeRate}%)
              </p>
            </div>

            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-green-400" />
                </div>
                <h4 className="text-slate-300 font-medium">최종 수익</h4>
              </div>
              <p className="text-2xl font-bold text-white mb-1">
                {formatCurrency(todayStats.net_income + todayStats.coin_sales)}
              </p>
              <p className="text-xs text-slate-400">
                순수입 + 코인판매
              </p>
            </div>
          </div>
        </div>
      </NeonCard>
    </div>
  );
}