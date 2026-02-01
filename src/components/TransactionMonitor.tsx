/**
 * 트랜잭션 자동 모니터링 컴포넌트
 * - 백그라운드에서 주기적으로 처리중인 트랜잭션 상태 체크
 * - 완료되면 자동으로 DB 업데이트
 */

import { useEffect, useState } from 'react';
import { Activity, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { SUPABASE_CONFIG } from '../utils/config';
import { supabase } from '../utils/supabase/client';

// make-server-b6d5667f의 모니터링 엔드포인트 사용
const MONITOR_URL = `${SUPABASE_CONFIG.backendUrl}/monitor-transactions`;
const MONITOR_INTERVAL = 4000; // 4초마다 체크

interface MonitorResult {
  timestamp: string;
  deposits: {
    checked: number;
    updated: number;
  };
  withdrawals: {
    checked: number;
    updated: number;
  };
  total_checked: number;
  total_updated: number;
}

export function TransactionMonitor() {
  const [isActive, setIsActive] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [stats, setStats] = useState<MonitorResult | null>(null);
  const [errorCount, setErrorCount] = useState(0);
  const [hasSession, setHasSession] = useState(false);
  const MAX_ERRORS = 3; // 연속 3번 실패하면 모니터링 중지

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const checkTransactions = async () => {
      try {
        setIsActive(true);
        
        // Supabase 세션 토큰 가져오기
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          // 세션 없음 - 로그인되지 않은 상태이므로 조용히 건너뛰기
          setHasSession(false);
          setIsActive(false);
          return;
        }
        
        // 세션이 처음 감지되면 로그 출력
        if (!hasSession) {
          console.log('✅ 트랜잭션 모니터링 시작');
          setHasSession(true);
        }
        
        const response = await fetch(MONITOR_URL, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result: MonitorResult = await response.json();
        
        setStats(result);
        setLastCheck(new Date());
        setErrorCount(0); // 성공하면 에러 카운트 리셋

        // 업데이트된 트랜잭션이 있으면 알림
        if (result.total_updated > 0) {
          toast.success(`✅ ${result.total_updated}개 트랜잭션 상태 업데이트됨`, {
            description: `입금: ${result.deposits.updated}건, 출금: ${result.withdrawals.updated}건`,
            duration: 3000
          });

          // 페이지 새로고침을 유도하기 위해 이벤트 발생
          window.dispatchEvent(new CustomEvent('transaction-updated', { detail: result }));
        }

        setIsActive(false);
      } catch (error: any) {
        console.error('❌ 트랜잭션 모니터링 오류:', error.message || error);
        setIsActive(false);
        
        setErrorCount(prev => prev + 1);
        
        // 연속 실패 카운트가 MAX_ERRORS에 도달하면 모니터링 중지
        if (errorCount >= MAX_ERRORS - 1) {
          console.warn('⚠️ ⚠️ 트랜잭션 모니터링 중지됨 (연속 실패)');
          if (intervalId) {
            clearInterval(intervalId);
          }
          return;
        }
      }
    };

    // 즉시 한 번 실행
    checkTransactions();

    // 주기적으로 실행
    intervalId = setInterval(checkTransactions, MONITOR_INTERVAL);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [errorCount, hasSession]);

  // UI 표시 안 함 (백그라운드 동작)
  // 디버깅이 필요한 경우 아래 코드 주석 해제
  /*
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-700 rounded-lg p-3 shadow-xl">
        <div className="flex items-center gap-2 mb-2">
          <Activity className={`w-4 h-4 ${isActive ? 'text-cyan-400 animate-pulse' : 'text-slate-400'}`} />
          <span className="text-slate-300 text-xs font-medium">트랜잭션 모니터</span>
        </div>
        
        {lastCheck && (
          <div className="text-slate-500 text-xs">
            마지막 체크: {lastCheck.toLocaleTimeString('ko-KR')}
          </div>
        )}

        {stats && stats.total_checked > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-700">
            <div className="text-xs text-slate-400">
              체크: {stats.total_checked}건
            </div>
            {stats.total_updated > 0 && (
              <div className="flex items-center gap-1 mt-1">
                <CheckCircle2 className="w-3 h-3 text-green-400" />
                <span className="text-xs text-green-400">
                  업데이트: {stats.total_updated}건
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
  */

  return null;
}