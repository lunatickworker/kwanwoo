import React, { useState, useEffect } from 'react';
import { Lock, Plus, AlertCircle, CheckCircle, Share2, X } from 'lucide-react';
import { NeonCard } from '../NeonCard';
import { supabase } from '../../utils/supabase/client';

interface StakingInfo {
  id?: string;
  user_id: string;
  staking_amount: number; // SUN 단위
  resource_type: 'ENERGY' | 'BANDWIDTH'; // 자원 유형
  freeze_period: number; // 동결 기간 (일 단위)
  frozen_at?: string;
  status: 'active' | 'pending' | 'completed' | 'error'; // 스테이킹 상태
  tx_hash?: string;
  error_message?: string;
  created_at?: string;
  updated_at?: string;
}

interface DelegationInfo {
  delegation_id: string;
  to_address: string;
  resource_type: 'ENERGY' | 'BANDWIDTH';
  amount_sun: number;
  amount_trx: number;
  status: string;
  delegated_at: string;
  tx_hash: string;
}

interface ReceivedDelegationInfo {
  delegation_id: string;
  from_user_id: string;
  resource_type: 'ENERGY' | 'BANDWIDTH';
  amount_sun: number;
  amount_trx: number;
  status: string;
  delegated_at: string;
}

interface StakingStats {
  total_staked: number; // TRX 단위
  active_stakings: number;
  estimated_daily_reward: number; // TRX 단위 (일일 0.0328%)
}

type TabType = 'staking' | 'delegations' | 'received';

const StakingManagement: React.FC<{ centerId?: string; centerAddress?: string }> = ({
  centerId,
  centerAddress,
}) => {
  // 탭 관리
  const [activeTab, setActiveTab] = useState<TabType>('staking');

  // 스테이킹 폼
  const [stakingAmount, setStakingAmount] = useState<string>('');
  const [resourceType, setResourceType] = useState<'ENERGY' | 'BANDWIDTH'>('ENERGY');
  const [freezePeriod, setFreezePeriod] = useState<number>(3);
  const [stakings, setStakings] = useState<StakingInfo[]>([]);
  const [stats, setStats] = useState<StakingStats>({
    total_staked: 0,
    active_stakings: 0,
    estimated_daily_reward: 0,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletAddress, setWalletAddress] = useState<string>('');

  // 위임 관련 상태
  const [delegations, setDelegations] = useState<DelegationInfo[]>([]);
  const [receivedDelegations, setReceivedDelegations] = useState<ReceivedDelegationInfo[]>([]);
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [selectedStakingForDelegate, setSelectedStakingForDelegate] = useState<string>('');
  const [delegateToAddress, setDelegateToAddress] = useState<string>('');
  const [delegateResourceType, setDelegateResourceType] = useState<'ENERGY' | 'BANDWIDTH'>('ENERGY');
  const [delegateAmount, setDelegateAmount] = useState<string>('');

  // 지갑 주소 및 잔액 조회
  useEffect(() => {
    const fetchWalletInfo = async () => {
      if (!centerId) return;

      try {
        // centerId로 TRX 지갑 조회
        const { data, error } = await supabase
          .from('wallets')
          .select('address')
          .eq('user_id', centerId)
          .eq('coin_type', 'TRX')
          .single();

        if (error || !data) {
          console.error('지갑 주소 조회 실패:', error);
          return;
        }

        setWalletAddress(data.address);

        // TronScan API로 잔액 조회
        const response = await fetch(
          `https://apilist.tronscan.org/api/account?address=${data.address}&apikey=8f829030-8c7d-430e-9c38-6a36c56bd729`
        );
        const accountData = await response.json();
        const balanceTRX = (accountData.balance || 0) / 1000000;
        setWalletBalance(balanceTRX);
      } catch (err) {
        console.error('지갑 정보 조회 실패:', err);
      }
    };

    fetchWalletInfo();
  }, [centerId]);

  // 스테이킹 내역 조회
  useEffect(() => {
    const fetchStakings = async () => {
      if (!centerId) return;

      try {
        const { data, error } = await supabase
          .from('staking_records')
          .select('*')
          .eq('user_id', centerId);

        if (error) throw error;

        setStakings(data || []);

        // 통계 계산
        const activeStakings = data?.filter((s) => s.status === 'active') || [];
        const totalStaked = activeStakings.reduce(
          (sum, s) => sum + (s.staking_amount || 0),
          0
        );
        const totalStakedTRX = totalStaked / 1000000;

        // 예상 일일 수익 (연 12% = 일일 0.0328%)
        const ANNUAL_RATE = 0.12; // 12%
        const DAILY_RATE = ANNUAL_RATE / 365; // 일일 수익률
        const estimatedDailyReward = totalStakedTRX * DAILY_RATE;

        setStats({
          total_staked: totalStakedTRX,
          active_stakings: activeStakings.length,
          estimated_daily_reward: estimatedDailyReward,
        });
      } catch (err) {
        console.error('스테이킹 조회 실패:', err);
      }
    };

    fetchStakings();
  }, [centerId]);

  // 위임 정보 조회
  const fetchDelegations = async () => {
    if (!centerId) return;

    try {
      // 위임한 리소스
      const delegResponse = await fetch(`/api/staking/delegations/${centerId}`);
      if (delegResponse.ok) {
        const delegData = await delegResponse.json();
        setDelegations(delegData.delegations || []);
      }

      // 받은 위임
      const receivedResponse = await fetch(`/api/staking/received-delegations/${centerId}`);
      if (receivedResponse.ok) {
        const receivedData = await receivedResponse.json();
        setReceivedDelegations(receivedData.received_delegations || []);
      }
    } catch (err) {
      console.error('위임 정보 조회 실패:', err);
    }
  };

  // 위임 탭 활성화 시 데이터 로드
  useEffect(() => {
    if (activeTab === 'delegations' || activeTab === 'received') {
      fetchDelegations();
    }
  }, [activeTab, centerId]);

  // 리소스 위임
  const handleDelegate = async () => {
    if (!selectedStakingForDelegate || !delegateToAddress || !delegateAmount) {
      setMessage({
        type: 'error',
        text: '모든 필드를 입력해주세요',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/staking/delegate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staking_id: selectedStakingForDelegate,
          user_id: centerId,
          to_address: delegateToAddress,
          resource_type: delegateResourceType,
          amount: Math.floor(parseFloat(delegateAmount) * 1000000), // TRX to SUN
        }),
      });

      if (!response.ok) {
        throw new Error('위임 실행 실패');
      }

      setMessage({
        type: 'success',
        text: '리소스가 성공적으로 위임되었습니다',
      });

      // 모달 닫기 및 초기화
      setShowDelegateModal(false);
      setSelectedStakingForDelegate('');
      setDelegateToAddress('');
      setDelegateAmount('');

      // 위임 목록 새로고침
      await fetchDelegations();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: `위임 실패: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  // 위임 취소
  const handleUndelegate = async (delegationId: string) => {
    if (!window.confirm('이 위임을 취소하시겠습니까?')) return;

    setLoading(true);
    try {
      const response = await fetch('/api/staking/undelegate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delegation_id: delegationId }),
      });

      if (!response.ok) {
        throw new Error('위임 취소 실패');
      }

      setMessage({
        type: 'success',
        text: '위임이 취소되었습니다',
      });

      // 위임 목록 새로고침
      await fetchDelegations();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: `위임 취소 실패: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  // 스테이킹 신청
  const handleStake = async () => {
    if (!stakingAmount || !centerId) {
      setMessage({ type: 'error', text: '스테이킹 금액을 입력해주세요' });
      return;
    }

    const amountTRX = parseFloat(stakingAmount);
    if (amountTRX <= 0) {
      setMessage({ type: 'error', text: '유효한 금액을 입력해주세요' });
      return;
    }

    if (amountTRX > walletBalance) {
      setMessage({
        type: 'error',
        text: `지갑 잔액 부족 (보유: ${walletBalance.toFixed(2)} TRX)`,
      });
      return;
    }

    setLoading(true);
    try {
      const amountSUN = Math.floor(amountTRX * 1000000);

      // DB에 스테이킹 기록 저장
      const { data: newStaking, error: insertError } = await supabase
        .from('staking_records')
        .insert({
          user_id: centerId,
          staking_amount: amountSUN,
          resource_type: resourceType,
          freeze_period: freezePeriod,
          status: 'pending',
          frozen_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setMessage({
        type: 'success',
        text: `스테이킹 신청 완료 (${amountTRX} TRX, ${resourceType})`,
      });

      // 엣지 펑션으로 실제 스테이킹 실행 요청
      const response = await fetch('/api/staking/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staking_id: newStaking.id,
          user_id: centerId,
          amount: amountSUN,
          resource_type: resourceType,
          freeze_period: freezePeriod,
        }),
      });

      if (!response.ok) {
        throw new Error('스테이킹 실행 실패');
      }

      // 폼 초기화
      setStakingAmount('');
      setFreezePeriod(3);

      // 스테이킹 내역 새로고침
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: `스테이킹 신청 실패: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  // 언스테이킹 신청
  const handleUnstake = async (stakingId: string) => {
    if (!window.confirm('스테이킹을 해제하시겠습니까?')) return;

    setLoading(true);
    try {
      const { error: updateError } = await supabase
        .from('staking_records')
        .update({ status: 'pending' })
        .eq('id', stakingId);

      if (updateError) throw updateError;

      // 엣지 펑션으로 언스테이킹 실행 요청
      const response = await fetch('/api/staking/unfreeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staking_id: stakingId,
        }),
      });

      if (!response.ok) {
        throw new Error('언스테이킹 실행 실패');
      }

      setMessage({
        type: 'success',
        text: '언스테이킹 신청이 완료되었습니다',
      });

      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: `언스테이킹 실패: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg">
            <Lock className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-blue-400 text-xl font-semibold">TRX 스테이킹 관리</h2>
            <p className="text-slate-400 text-sm">스테이킹 자원을 관리하고 수익을 창출합니다</p>
          </div>
        </div>
      </div>

      {/* 메시지 */}
      {message && (
        <div
          className={`p-4 rounded-lg flex items-center gap-3 border ${
            message.type === 'success'
              ? 'bg-green-500/20 text-green-400 border-green-500/30'
              : 'bg-red-500/20 text-red-400 border-red-500/30'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* 탭 네비게이션 */}
      <div className="flex gap-2 border-b border-slate-700">
        <button
          onClick={() => setActiveTab('staking')}
          className={`px-4 py-3 font-semibold transition-all ${
            activeTab === 'staking'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Lock className="inline w-4 h-4 mr-2" />
          스테이킹
        </button>
        <button
          onClick={() => setActiveTab('delegations')}
          className={`px-4 py-3 font-semibold transition-all ${
            activeTab === 'delegations'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Share2 className="inline w-4 h-4 mr-2" />
          위임한 리소스
        </button>
        <button
          onClick={() => setActiveTab('received')}
          className={`px-4 py-3 font-semibold transition-all ${
            activeTab === 'received'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Share2 className="inline w-4 h-4 mr-2 rotate-180" />
          받은 리소스
        </button>
      </div>

      {/* 스테이킹 탭 */}
      {activeTab === 'staking' && (
        <>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-6 hover:border-cyan-500/30 transition-all">
            <p className="text-slate-400 text-sm mb-2">총 스테이킹액</p>
            <p className="text-blue-400 text-2xl font-bold">{stats.total_staked.toFixed(2)}</p>
            <p className="text-slate-500 text-xs mt-1">TRX</p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-6 hover:border-cyan-500/30 transition-all">
            <p className="text-slate-400 text-sm mb-2">활성 스테이킹</p>
            <p className="text-green-400 text-2xl font-bold">{stats.active_stakings}</p>
            <p className="text-slate-500 text-xs mt-1">건</p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-6 hover:border-cyan-500/30 transition-all">
            <p className="text-slate-400 text-sm mb-2">예상 일일 수익</p>
            <p className="text-purple-400 text-2xl font-bold">{stats.estimated_daily_reward.toFixed(6)}</p>
            <p className="text-slate-500 text-xs mt-1">TRX</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 스테이킹 폼 */}
        <NeonCard>
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-5 h-5 text-blue-400" />
            <h3 className="text-slate-200 font-semibold">새 스테이킹 신청</h3>
          </div>

          <div className="space-y-4">
            {/* 지갑 잔액 */}
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
              <p className="text-slate-400 text-sm">지갑 잔액</p>
              <p className="text-blue-400 text-lg font-bold">{walletBalance.toFixed(2)} TRX</p>
            </div>

            {/* 스테이킹 금액 */}
            <div>
              <label className="block text-slate-300 text-sm mb-2">금액 (TRX)</label>
              <input
                type="number"
                value={stakingAmount}
                onChange={(e) => setStakingAmount(e.target.value)}
                placeholder="100"
                min="1"
                step="0.1"
                disabled={loading}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              />
              <p className="text-slate-500 text-xs mt-1">최소: 1 TRX | 최대: {walletBalance.toFixed(2)} TRX</p>
            </div>

            {/* 자원 유형 */}
            <div>
              <label className="block text-slate-300 text-sm mb-2">자원 유형</label>
              <select
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value as 'ENERGY' | 'BANDWIDTH')}
                disabled={loading}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
              >
                <option value="ENERGY">에너지 (ENERGY) - 스마트 계약 실행</option>
                <option value="BANDWIDTH">대역폭 (BANDWIDTH) - 거래 전송</option>
              </select>
            </div>

            {/* 동결 기간 */}
            <div>
              <label className="block text-slate-300 text-sm mb-2">동결 기간</label>
              <div className="grid grid-cols-4 gap-2">
                {[3, 7, 14, 30].map((days) => (
                  <button
                    key={days}
                    onClick={() => setFreezePeriod(days)}
                    disabled={loading}
                    className={`py-2 rounded-lg text-sm transition ${
                      freezePeriod === days
                        ? 'bg-blue-500 text-white border border-blue-400'
                        : 'bg-slate-800 text-slate-300 border border-slate-700 hover:border-blue-500'
                    } disabled:opacity-50`}
                  >
                    {days}일
                  </button>
                ))}
              </div>
              <p className="text-slate-500 text-xs mt-2">연 12% 수익률 (일일 약 0.0328%)</p>
            </div>

            {/* 신청 버튼 */}
            <button
              onClick={handleStake}
              disabled={loading || !stakingAmount}
              className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              {loading ? '처리 중...' : '스테이킹 신청'}
            </button>
          </div>
        </NeonCard>

        {/* 스테이킹 내역 요약 */}
        <NeonCard>
          <div className="flex items-center gap-2 mb-6">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <h3 className="text-slate-200 font-semibold">활성 스테이킹</h3>
          </div>

          {stakings.filter((s) => s.status === 'active').length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p>활성 스테이킹이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stakings
                .filter((s) => s.status === 'active')
                .map((staking) => (
                  <div key={staking.id} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-blue-400 font-semibold">
                        {(staking.staking_amount / 1000000).toFixed(2)} TRX
                      </span>
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded border border-blue-500/30">
                        {staking.resource_type}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400 text-xs">
                      <span>{staking.freeze_period}일 동결</span>
                      <button
                        onClick={() => staking.id && handleUnstake(staking.id)}
                        disabled={loading}
                        className="text-red-400 hover:text-red-300 transition disabled:opacity-50"
                      >
                        해제
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </NeonCard>
      </div>

      {/* 전체 스테이킹 내역 테이블 */}
      <NeonCard>
        <div className="flex items-center gap-2 mb-6">
          <Lock className="w-5 h-5 text-blue-400" />
          <h3 className="text-slate-200 font-semibold">전체 스테이킹 내역</h3>
        </div>

        {stakings.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <p>스테이킹 내역이 없습니다</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-3 text-left text-slate-400 font-semibold">금액</th>
                  <th className="px-4 py-3 text-left text-slate-400 font-semibold">자원</th>
                  <th className="px-4 py-3 text-left text-slate-400 font-semibold">기간</th>
                  <th className="px-4 py-3 text-left text-slate-400 font-semibold">상태</th>
                  <th className="px-4 py-3 text-left text-slate-400 font-semibold">생성일</th>
                  <th className="px-4 py-3 text-center text-slate-400 font-semibold">작업</th>
                </tr>
              </thead>
              <tbody>
                {stakings.map((staking) => (
                  <tr key={staking.id} className="border-b border-slate-700/50 hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-slate-200 font-medium">
                      {(staking.staking_amount / 1000000).toFixed(2)} TRX
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                        {staking.resource_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{staking.freeze_period}일</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold border ${
                          staking.status === 'active'
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : staking.status === 'pending'
                              ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                              : staking.status === 'error'
                                ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                        }`}
                      >
                        {staking.status === 'active'
                          ? '활성'
                          : staking.status === 'pending'
                            ? '진행 중'
                            : staking.status === 'error'
                              ? '오류'
                              : '완료'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {staking.created_at
                        ? new Date(staking.created_at).toLocaleDateString('ko-KR')
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {staking.status === 'active' && (
                        <button
                          onClick={() => staking.id && handleUnstake(staking.id)}
                          disabled={loading}
                          className="text-red-400 hover:text-red-300 transition disabled:opacity-50"
                        >
                          해제
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </NeonCard>

      {/* 안내 */}
      <NeonCard>
        <div className="space-y-2 text-sm">
          <h4 className="text-blue-400 font-semibold">📌 스테이킹 가이드</h4>
          <ul className="space-y-1 text-slate-300 text-xs">
            <li>• <span className="text-green-400">ENERGY</span>: 스마트 계약 실행 시 필요. DeFi 거래에 사용.</li>
            <li>• <span className="text-green-400">BANDWIDTH</span>: 거래 전송 시 필요. 일반 거래에 사용.</li>
            <li>• 동결 기간이 길수록 더 높은 보상을 받습니다 (최대 30일).</li>
            <li>• 동결 기간 종료 후 언스테이킹 버튼으로 자동 해제됩니다.</li>
            <li>• 연 12% 수익률로 계산됩니다 (일일 약 0.0328%).</li>
          </ul>
        </div>
      </NeonCard>
        </>
      )}

      {/* 위임한 리소스 탭 */}
      {activeTab === 'delegations' && (
        <>
          <div className="flex justify-between items-center">
            <h3 className="text-cyan-400 text-lg font-semibold">위임한 리소스</h3>
            <button
              onClick={() => setShowDelegateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-400 rounded-lg transition-all"
            >
              <Plus className="w-4 h-4" />
              새로운 위임
            </button>
          </div>

          {delegations.length === 0 ? (
            <NeonCard>
              <p className="text-slate-400 text-center py-8">위임한 리소스가 없습니다</p>
            </NeonCard>
          ) : (
            <NeonCard>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-700">
                    <tr className="text-slate-400">
                      <th className="px-4 py-3 text-left">위임받는 주소</th>
                      <th className="px-4 py-3 text-left">리소스 타입</th>
                      <th className="px-4 py-3 text-right">금액</th>
                      <th className="px-4 py-3 text-left">상태</th>
                      <th className="px-4 py-3 text-center">작업</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {delegations.map((d) => (
                      <tr key={d.delegation_id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                          {d.to_address.substring(0, 10)}...{d.to_address.substring(-6)}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            d.resource_type === 'ENERGY'
                              ? 'bg-purple-500/20 text-purple-400'
                              : 'bg-blue-500/20 text-blue-400'
                          }`}>
                            {d.resource_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-cyan-400 font-semibold">
                          {d.amount_trx.toFixed(2)} TRX
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400">
                            활성
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleUndelegate(d.delegation_id)}
                            disabled={loading}
                            className="px-3 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 rounded transition-all disabled:opacity-50"
                          >
                            취소
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </NeonCard>
          )}
        </>
      )}

      {/* 받은 리소스 탭 */}
      {activeTab === 'received' && (
        <>
          <h3 className="text-cyan-400 text-lg font-semibold">받은 리소스</h3>

          <NeonCard>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm mb-2">총 ENERGY</p>
                <p className="text-purple-400 text-2xl font-bold">
                  {(receivedDelegations
                    .filter(d => d.resource_type === 'ENERGY')
                    .reduce((sum, d) => sum + d.amount_trx, 0)
                  ).toFixed(2)}
                </p>
                <p className="text-slate-500 text-xs mt-1">TRX</p>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm mb-2">총 BANDWIDTH</p>
                <p className="text-blue-400 text-2xl font-bold">
                  {(receivedDelegations
                    .filter(d => d.resource_type === 'BANDWIDTH')
                    .reduce((sum, d) => sum + d.amount_trx, 0)
                  ).toFixed(2)}
                </p>
                <p className="text-slate-500 text-xs mt-1">TRX</p>
              </div>
            </div>
          </NeonCard>

          {receivedDelegations.length === 0 ? (
            <NeonCard>
              <p className="text-slate-400 text-center py-8">받은 리소스가 없습니다</p>
            </NeonCard>
          ) : (
            <NeonCard>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-700">
                    <tr className="text-slate-400">
                      <th className="px-4 py-3 text-left">위임자</th>
                      <th className="px-4 py-3 text-left">리소스 타입</th>
                      <th className="px-4 py-3 text-right">금액</th>
                      <th className="px-4 py-3 text-left">위임 날짜</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {receivedDelegations.map((d) => (
                      <tr key={d.delegation_id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                          {d.from_user_id.substring(0, 10)}...
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            d.resource_type === 'ENERGY'
                              ? 'bg-purple-500/20 text-purple-400'
                              : 'bg-blue-500/20 text-blue-400'
                          }`}>
                            {d.resource_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-cyan-400 font-semibold">
                          {d.amount_trx.toFixed(2)} TRX
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {new Date(d.delegated_at).toLocaleDateString('ko-KR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </NeonCard>
          )}
        </>
      )}

      {/* 위임 모달 */}
      {showDelegateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h3 className="text-xl font-bold text-white">리소스 위임</h3>
              <button
                onClick={() => setShowDelegateModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* 스테이킹 선택 */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  스테이킹 선택
                </label>
                <select
                  value={selectedStakingForDelegate}
                  onChange={(e) => setSelectedStakingForDelegate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg focus:border-cyan-500 focus:outline-none"
                >
                  <option value="">-- 선택해주세요 --</option>
                  {stakings
                    .filter(s => s.status === 'active')
                    .map(s => (
                      <option key={s.id} value={s.id}>
                        {(s.staking_amount / 1000000).toFixed(2)} TRX - {s.resource_type}
                      </option>
                    ))}
                </select>
              </div>

              {/* 위임받을 주소 */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  위임받을 주소
                </label>
                <input
                  type="text"
                  value={delegateToAddress}
                  onChange={(e) => setDelegateToAddress(e.target.value)}
                  placeholder="T로 시작하는 TRON 주소"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg focus:border-cyan-500 focus:outline-none"
                />
              </div>

              {/* 리소스 타입 */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  리소스 타입
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['ENERGY', 'BANDWIDTH'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setDelegateResourceType(type)}
                      className={`px-3 py-2 rounded-lg font-semibold transition-all ${
                        delegateResourceType === type
                          ? type === 'ENERGY'
                            ? 'bg-purple-500 text-white'
                            : 'bg-blue-500 text-white'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* 위임 금액 */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  위임 금액 (TRX)
                </label>
                <input
                  type="number"
                  value={delegateAmount}
                  onChange={(e) => setDelegateAmount(e.target.value)}
                  placeholder="예: 10"
                  step="0.01"
                  min="0"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg focus:border-cyan-500 focus:outline-none"
                />
              </div>

              {/* 버튼 */}
              <div className="flex gap-2 pt-4">
                <button
                  onClick={handleDelegate}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '처리 중...' : '위임'}
                </button>
                <button
                  onClick={() => setShowDelegateModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StakingManagement;
