import { useState, useEffect } from 'react';
import { Zap, DollarSign, TrendingUp, Search, Filter, Calendar, Download } from 'lucide-react';
import { NeonCard } from '../NeonCard';
import { StatCard } from '../StatCard';
import { supabase } from '../../utils/supabase/client';
import { toast } from 'sonner@2.0.3';
import { useAuth } from '../../contexts/AuthContext';

interface GasExpense {
  id: string;
  admin_id: string;
  admin_role: string;
  coin_type: string;
  gas_fee: number;
  settlement_amount: number; // 정산 금액 (KRW)
  status: 'pending' | 'settled';
  created_at: string;
  settled_at: string | null;
}

interface GasSummary {
  total_gas_fee: number;
  total_settlement: number;
  pending_settlement: number;
  settled_amount: number;
  master_total_received: number;
}

export function GasManagement() {
  const { user } = useAuth();
  const [gasExpenses, setGasExpenses] = useState<GasExpense[]>([]);
  const [summary, setSummary] = useState<GasSummary>({
    total_gas_fee: 0,
    total_settlement: 0,
    pending_settlement: 0,
    settled_amount: 0,
    master_total_received: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('month'); // week, month, year
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [isSettling, setIsSettling] = useState(false);

  useEffect(() => {
    fetchGasExpenses();
    fetchGasSummary();

    // 실시간 모니터링
    const channel = supabase
      .channel('gas-expenses-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_coin_withdrawals'
        },
        () => {
          fetchGasExpenses();
          fetchGasSummary();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, selectedPeriod]);

  const fetchGasExpenses = async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);

      // 기간 계산
      const now = new Date();
      let startDate = new Date();

      if (selectedPeriod === 'week') {
        startDate.setDate(now.getDate() - 7);
      } else if (selectedPeriod === 'month') {
        startDate.setMonth(now.getMonth() - 1);
      } else if (selectedPeriod === 'year') {
        startDate.setFullYear(now.getFullYear() - 1);
      }

      // 모든 관리자의 출금 기록 조회 (가스비 포함)
      const { data, error } = await supabase
        .from('admin_coin_withdrawals')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 가스비만 별도로 수집
      const expenses: GasExpense[] = (data || [])
        .filter(w => w.gas_fee > 0)
        .map(w => ({
          id: w.id,
          admin_id: w.admin_id,
          admin_role: w.admin_role,
          coin_type: w.coin_type,
          gas_fee: w.gas_fee,
          settlement_amount: w.gas_fee * 1200, // 임시: 코인당 KRW 환율 적용 필요
          status: 'pending',
          created_at: w.created_at,
          settled_at: null
        }));

      setGasExpenses(expenses);
    } catch (error) {
      console.error('가스 비용 조회 오류:', error);
      toast.error('가스 비용을 불러오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGasSummary = async () => {
    try {
      // 모든 가스비 합계
      const { data, error } = await supabase
        .from('admin_coin_withdrawals')
        .select('gas_fee')
        .gt('gas_fee', 0);

      if (error) throw error;

      const totalGasFee = (data || []).reduce((sum, item) => sum + (item.gas_fee || 0), 0);
      const totalSettlement = totalGasFee * 1200; // 임시

      setSummary({
        total_gas_fee: totalGasFee,
        total_settlement: totalSettlement,
        pending_settlement: totalSettlement,
        settled_amount: 0,
        master_total_received: 0
      });
    } catch (error) {
      console.error('가스 요약 조회 오류:', error);
    }
  };

  const handleSettleGasExpenses = async () => {
    if (gasExpenses.length === 0) {
      toast.error('정산할 가스비가 없습니다');
      return;
    }

    setIsSettling(true);

    try {
      // 선택된 항목들을 settled로 업데이트
      const pendingIds = gasExpenses
        .filter(e => e.status === 'pending')
        .map(e => e.id);

      if (pendingIds.length === 0) {
        toast.info('이미 정산된 항목만 있습니다');
        return;
      }

      // 각 항목을 업데이트
      for (const id of pendingIds) {
        await supabase
          .from('admin_coin_withdrawals')
          .update({ status: 'settled', settled_at: new Date().toISOString() })
          .eq('id', id);
      }

      toast.success('가스비 정산이 완료되었습니다');
      fetchGasExpenses();
      fetchGasSummary();
    } catch (error: any) {
      console.error('정산 오류:', error);
      toast.error(error.message || '정산에 실패했습니다');
    } finally {
      setIsSettling(false);
    }
  };

  const downloadReport = async () => {
    try {
      // CSV 형식으로 변환
      const headers = ['날짜', '역할', '코인', '가스비', '정산액(KRW)', '상태'];
      const rows = gasExpenses.map(e => [
        new Date(e.created_at).toLocaleDateString('ko-KR'),
        e.admin_role,
        e.coin_type,
        e.gas_fee.toFixed(8),
        e.settlement_amount.toLocaleString(),
        e.status === 'pending' ? '대기중' : '정산됨'
      ]);

      const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');

      // 다운로드
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `gas_report_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();

      toast.success('보고서가 다운로드되었습니다');
    } catch (error) {
      console.error('다운로드 오류:', error);
      toast.error('보고서 다운로드에 실패했습니다');
    }
  };

  return (
    <div className="space-y-6">
      {/* 요약 통계 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Zap}
          label="총 가스비"
          value={summary.total_gas_fee.toFixed(8)}
          unit="코인"
          trend={5.2}
        />
        <StatCard
          icon={DollarSign}
          label="정산액 (KRW)"
          value={summary.total_settlement.toLocaleString()}
          unit="₩"
          trend={3.1}
        />
        <StatCard
          icon={TrendingUp}
          label="정산 대기중"
          value={summary.pending_settlement.toLocaleString()}
          unit="₩"
          trend={-2.5}
        />
        <StatCard
          icon={Zap}
          label="정산 완료"
          value={summary.settled_amount.toLocaleString()}
          unit="₩"
          trend={0}
        />
      </div>

      {/* 필터 및 검색 */}
      <NeonCard>
        <div className="p-4 flex flex-col md:flex-row gap-4 items-end">
          {/* 기간 선택 */}
          <div className="flex-1">
            <label className="block text-sm text-slate-400 mb-2">기간</label>
            <div className="flex gap-2">
              {['week', 'month', 'year'].map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    selectedPeriod === period
                      ? 'bg-cyan-500 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {period === 'week' ? '1주' : period === 'month' ? '1개월' : '1년'}
                </button>
              ))}
            </div>
          </div>

          {/* 역할 필터 */}
          <div className="flex-1">
            <label className="block text-sm text-slate-400 mb-2">역할</label>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="all">전체</option>
              <option value="master">마스터</option>
              <option value="center">센터</option>
              <option value="agency">에이전시</option>
            </select>
          </div>

          {/* 다운로드 버튼 */}
          <button
            onClick={downloadReport}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            보고서
          </button>
        </div>
      </NeonCard>

      {/* 가스비 목록 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">가스비 내역</h3>
          <button
            onClick={handleSettleGasExpenses}
            disabled={isSettling || gasExpenses.filter(e => e.status === 'pending').length === 0}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-all duration-300"
          >
            {isSettling ? '정산중...' : '가스비 정산'}
          </button>
        </div>

        {isLoading ? (
          <NeonCard>
            <div className="text-center py-8 text-slate-400">로딩 중...</div>
          </NeonCard>
        ) : gasExpenses.length === 0 ? (
          <NeonCard>
            <div className="text-center py-8 text-slate-400">가스비 내역이 없습니다</div>
          </NeonCard>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {gasExpenses.map((expense) => (
              <NeonCard key={expense.id}>
                <div className="p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {expense.admin_role === 'master' ? '마스터' : expense.admin_role === 'center' ? '센터' : '에이전시'}
                        </p>
                        <p className="text-xs text-slate-400">{expense.coin_type}</p>
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold border ${
                          expense.status === 'pending'
                            ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                            : 'bg-green-500/10 border-green-500/30 text-green-400'
                        }`}
                      >
                        {expense.status === 'pending' ? '정산대기' : '정산완료'}
                      </span>
                    </div>
                    <div className="text-sm text-slate-400">
                      {new Date(expense.created_at).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-bold text-cyan-400">
                      {expense.gas_fee.toFixed(8)} {expense.coin_type}
                    </p>
                    <p className="text-sm text-slate-400">
                      ₩{expense.settlement_amount.toLocaleString()}
                    </p>
                  </div>
                </div>
              </NeonCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
