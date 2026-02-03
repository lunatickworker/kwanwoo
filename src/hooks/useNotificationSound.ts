import { useEffect, useRef, useState } from 'react';
import { Notification } from '../utils/supabase/types';

// 사운드 파일 경로 (Vite new URL() 방식)
const SOUND_PATHS = {
  accountApproved: new URL('../assets/sounds/accountapproved.MP3', import.meta.url).href,
  coinSell: new URL('../assets/sounds/coinsell.MP3', import.meta.url).href,
  inquiry: new URL('../assets/sounds/inquery.MP3', import.meta.url).href,
  newUserApproved: new URL('../assets/sounds/newuserapproved.MP3', import.meta.url).href,
  depositCompleted: new URL('../assets/sounds/depositcompleted.MP3', import.meta.url).href,
  storeApply: new URL('../assets/sounds/storeapply.MP3', import.meta.url).href,
};

// 알림 타입과 소리 파일 매핑
const SOUND_MAP: Record<string, string> = {
  'verification_request': SOUND_PATHS.accountApproved,
  'account_verification': SOUND_PATHS.accountApproved,
  'purchase_request': SOUND_PATHS.coinSell,
  'support_request': SOUND_PATHS.inquiry,
  'signup': SOUND_PATHS.newUserApproved,
  'deposit': SOUND_PATHS.depositCompleted,
  'store_deposit': SOUND_PATHS.storeApply,
  'store_coin_sale_request': SOUND_PATHS.storeApply,
};

interface UseNotificationSoundProps {
  notifications: Notification[];
  enabled: boolean; // 소리 활성화 여부
}

export function useNotificationSound({ notifications, enabled }: UseNotificationSoundProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [lastPlayedNotificationId, setLastPlayedNotificationId] = useState<string | null>(null);
  const isInitializedRef = useRef(false); // 초기 로드 완료 여부 추적
  const prevEnabledRef = useRef(enabled); // 이전 enabled 상태 추적

  // 읽지 않은 알림 중 가장 최근 것 찾기
  const getLatestUnreadNotification = (): Notification | null => {
    const unreadNotifications = notifications.filter(n => !n.read);
    if (unreadNotifications.length === 0) return null;
    
    // 가장 최근 알림 반환
    return unreadNotifications[0];
  };

  // 소리 재생
  const playSound = (notificationType: string) => {
    if (!enabled) {
      console.log('🔇 Sound is disabled');
      return;
    }

    const soundFile = SOUND_MAP[notificationType];
    if (!soundFile) {
      console.log('❌ No sound file mapped for notification type:', notificationType);
      return;
    }

    try {
      // 기존 오디오 정지
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = '';
      }

      // 새 오디오 생성
      console.log('🔊 Creating audio element for:', soundFile);
      const audio = new Audio();
      let playSuccessful = false; // 재생 성공 여부 추적
      
      audio.src = soundFile;
      audio.volume = 0.7; // 볼륨 70%
      audio.crossOrigin = 'anonymous';
      audioRef.current = audio;

      // 재생 시도
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            playSuccessful = true;
            setIsPlaying(true);
            console.log('✅ Playing notification sound:', soundFile);
          })
          .catch((error) => {
            // WMA 형식 지원 안 함 에러는 한 번만 출력
            if (error.name === 'NotSupportedError') {
              if (!window.__notificationSoundWarningShown) {
                console.error('❌ Audio format not supported. Please convert WMA files to MP3');
                window.__notificationSoundWarningShown = true;
              }
            } else {
              console.error('❌ Failed to play notification sound:', error);
            }
            setIsPlaying(false);
          });
      }

      audio.onended = () => {
        setIsPlaying(false);
        console.log('🔇 Sound ended');
      };

      // 재생 성공 후에만 onerror 처리 (이미 성공한 경우 무시)
      audio.onerror = () => {
        if (!playSuccessful) {
          console.error('❌ Audio format not supported:', soundFile);
        }
        setIsPlaying(false);
      };
    } catch (error) {
      console.error('❌ Error creating audio:', error);
    }
  };

  // 소리 중지
  const stopSound = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // 읽지 않은 알림 모니터링 및 반복 재생
  useEffect(() => {
    console.log('🎵 useEffect triggered - enabled:', enabled, 'notifications:', notifications.length);

    if (!enabled) {
      stopSound();
      return;
    }

    const latestUnread = getLatestUnreadNotification();

    // 읽지 않은 알림이 없으면 소리 중지
    if (!latestUnread) {
      stopSound();
      setLastPlayedNotificationId(null);
      console.log('✅ No unread notifications');
      return;
    }

    console.log('🔔 Latest unread notification:', latestUnread.id, latestUnread.type);

    // 새로운 읽지 않은 알림이면 즉시 재생 (마지막 재생한 ID와 다른 경우)
    if (latestUnread.id !== lastPlayedNotificationId) {
      console.log('🎵 Playing new notification sound - notification ID:', latestUnread.id);
      setLastPlayedNotificationId(latestUnread.id);
      playSound(latestUnread.type);

      // 4초마다 반복 재생
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      intervalRef.current = setInterval(() => {
        const currentUnread = getLatestUnreadNotification();
        if (currentUnread && currentUnread.id === latestUnread.id) {
          console.log('🔁 Repeating notification sound');
          playSound(latestUnread.type);
        }
      }, 4000); // 4초마다 반복
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [notifications, enabled]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      stopSound();
    };
  }, []);

  return {
    isPlaying,
    stopSound,
  };
}