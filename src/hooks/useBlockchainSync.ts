import { useEffect, useRef, useState } from 'react';

interface BlockchainSyncOptions {
  maxAttempts?: number;
  interval?: number;
  onSuccess?: () => void;
  onTimeout?: () => void;
  onError?: (error: Error) => void;
}

export function useBlockchainSync(options: BlockchainSyncOptions = {}) {
  const {
    maxAttempts = 30, // 120초 (4초 × 30)
    interval = 4000, // 4초
    onSuccess,
    onTimeout,
    onError
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

        console.log(`🔍 모니터링 시도 ${attempts}/${maxAttempts}`);

        const response = await fetch(
          'https://mzoeeqmtvlnyonicycvg.supabase.co/functions/v1/make-server-b6d5667f/scan-blockchain',
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          }
        );

        if (!response.ok) {
          throw new Error(`API 오류: ${response.status}`);
        }

        const data = await response.json();

        console.log('📊 스캔 결과:', {
          scanned: data.scanned,
          created: data.created,
          timestamp: data.timestamp
        });

        // created > 0이면 wallets이 업데이트됨
        if (data.created > 0) {
          console.log('✅ 블록체인 동기화 완료!');
          stopMonitoring();
          setProgress(100);
          onSuccess?.();
          return;
        }
      } catch (error) {
        console.error('❌ 모니터링 오류:', error);
        onError?.(error as Error);
      }

      // 최대 시도 횟수 도달
      if (attempts >= maxAttempts) {
        console.log('⏱️ 모니터링 타임아웃 (120초)');
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
