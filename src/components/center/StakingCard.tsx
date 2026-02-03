import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';

interface StakingCardProps {
  centerId: string;
}

export function StakingCard({ centerId }: StakingCardProps) {
  const [totalStaked, setTotalStaked] = useState<number>(0);

  // 스테이킹 내역 조회 - 총 스테이킹액만 계산
  useEffect(() => {
    const fetchStakings = async () => {
      if (!centerId) return;
      try {
        const { data, error } = await supabase
          .from('staking_records')
          .select('*')
          .eq('user_id', centerId);

        if (error) throw error;

        // 활성 스테이킹만 계산
        const activeStakings = data?.filter((s) => s.status === 'active') || [];
        const totalStaked = activeStakings.reduce((sum, s) => sum + (s.staking_amount || 0), 0);
        const totalStakedTRX = totalStaked / 1000000;

        setTotalStaked(totalStakedTRX);
      } catch (err) {
        console.error('스테이킹 조회 실패:', err);
      }
    };

    fetchStakings();
  }, [centerId]);

  // StatCard와 같은 스타일의 카드
  return (
    <div className="relative group">
      {/* Glow effect */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
      
      {/* Card content */}
      <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-6 hover:border-cyan-500/30 transition-all">
        <div className="flex items-start justify-between mb-4">
          <div className="bg-blue-500/20 flex items-center justify-center w-12 h-12 rounded-lg">
            <Lock className="w-6 h-6 text-blue-400" />
          </div>
          <span className="px-2 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400">
            스테이킹중
          </span>
        </div>
        
        <div>
          <p className="text-slate-400 text-sm mb-1">TRX 스테이킹액</p>
          <p className="text-2xl text-blue-400">{totalStaked.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}
