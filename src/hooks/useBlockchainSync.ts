import { useEffect, useRef, useState } from 'react';
import { supabase } from '../utils/supabase/client';
import { SUPABASE_CONFIG } from '../utils/config';

interface BlockchainSyncOptions {
  maxAttempts?: number;
  interval?: number;
  onSuccess?: () => void;
  onTimeout?: () => void;
  onError?: (error: Error) => void;
  enabled?: boolean; // 모니터링 활성화 여부
}

export function useBlockchainSync(options: BlockchainSyncOptions = {}) {
  const {
    maxAttempts = 30, // 120초 (4초 × 30)
    interval = 4000, // 4초
    onSuccess,
    onTimeout,
    onError,
    enabled = false // 기본값: 비활성화 (Edge Function이 없는 경우 대비)
  } = options;

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [progress, setProgress] = useState(0); // 진행도 (0-100)

  /**
   * 블록체인 동기화 모니터링 시작
   * - 4초마다 /scan-blockchain 호출
   * - wallets.balance 변화 감지 시 자동 중지
   * - 최대 120초 후 타임아웃
   */
  const startMonitoring = () => {
    // 모니터링이 비활성화되어 있으면 실행하지 않음
    if (!enabled) {
      console.log('⚠️ 블록체인 모니터링이 비활성화되어 있습니다.');
      return;
    }

    if (isMonitoring) {
      console.log('⚠️ 모니터링이 이미 실행 중입니다');
      return;
    }

    console.log('🚀 블록체인 동기화 모니터링 시작...');
    setIsMonitoring(true);
    setProgress(0);

    let attempts = 0;

    intervalRef.current = setInterval(async () => {
      try {
        attempts++;
        const progressPercent = (attempts / maxAttempts) * 100;
        setProgress(Math.min(progressPercent, 95)); // 95%까지만

        // Supabase 세션 가져오기
        const { data: { session } } = await supabase.auth.getSession();
        
        const headers: Record<string, string> = { 
          'Content-Type': 'application/json'
        };
        
        // 세션이 있으면 Authorization 헤더만 추가 (apikey 제거)
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const response = await fetch(
          'https://mzoeeqmtvlnyonicycvg.supabase.co/functions/v1/make-server-b6d5667f/scan-blockchain',
          {
            method: 'GET',
            headers,
            // 타임아웃 설정 (10초)
            signal: AbortSignal.timeout(10000)
          }
        );

        if (!response.ok) {
          // 조용히 건너뜀
          return;
        }

        const data = await response.json();

        // ✅ 성공 시에만 로그 출력
        if (data.created > 0) {
          console.log('✅ 블록체인 동기화 완료!', {
            scanned: data.scanned,
            created: data.created
          });
          stopMonitoring();
          setProgress(100);
          onSuccess?.();
          return;
        }
      } catch (error) {
        // ✅ 모든 에러를 조용히 처리 (로그 노이즈 방지)
        // 아무 것도 하지 않음
      }

      // 최대 시도 횟수 도달
      if (attempts >= maxAttempts) {
        console.log('⏱️ 블록체인 모니터링 타임아웃 (120초)');
        stopMonitoring();
        setProgress(100);
        onTimeout?.();
      }
    }, interval);
  };

  /**
   * 모니터링 중지
   */
  const stopMonitoring = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsMonitoring(false);
  };

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, []);

  return {
    startMonitoring,
    stopMonitoring,
    isMonitoring,
    progress
  };
}