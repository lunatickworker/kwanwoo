import { User, LogOut, UserPlus, FileCheck, ShoppingCart, MessageSquare, Wallet, ArrowLeftRight, ArrowDownCircle, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useState, useEffect } from "react";
import { supabase } from "../utils/supabase/client";
import { toast } from "sonner";
import { getHierarchyUserIds } from "../utils/api/query-helpers";
import { MasterProfileCard } from "./MasterProfileCard";
import { AdminProfileCard } from "./AdminProfileCard";
import { useNotificationSound } from "../hooks/useNotificationSound"; // 소리 훅 추가
import { useNotifications } from "../hooks/useNotifications"; // 알림 훅 추가
import { Notification } from "../utils/supabase/types";

interface HeaderProps {
  onNavigate: (tab: string) => void;
}

interface WalletBalances {
  hot: number;
  cold: number;
  total: number;
}

export function Header({ onNavigate }: HeaderProps) {
  const { user, logout } = useAuth();
  const [walletBalances, setWalletBalances] = useState<WalletBalances>({ hot: 0, cold: 0, total: 0 });
  const [showWalletDropdown, setShowWalletDropdown] = useState(false);
  const [showWalletMoveModal, setShowWalletMoveModal] = useState(false);
  const [moveDirection, setMoveDirection] = useState<'hot-to-cold' | 'cold-to-hot'>('hot-to-cold');
  const [moveAmount, setMoveAmount] = useState('');
  const [selectedCoin, setSelectedCoin] = useState('');
  const [isMoving, setIsMoving] = useState(false);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true); // 소리 on/off 상태

  // 사용자 역할 확인 (훅보다 먼저 정의)
  const isMaster = user?.role === 'master';
  const isCenter = user?.role === 'center';
  const isAgency = user?.role === 'agency';
  const isStore = user?.role === 'store';
  const showWallet = isMaster || isCenter || isAgency || isStore; // 모든 관리자 역할에 대해 지갑 표시
  const showNotifications = isCenter || isAgency; // 센터와 에이전시 알림만 표시

  // 실시간 알림 조회 (센터, 가맹점)
  const { notifications: allNotifications } = useNotifications(user?.id, showNotifications);

  // 알림 소리 훅 (센터, 가맹점)
  const { isPlaying, stopSound } = useNotificationSound({
    notifications: allNotifications,
    enabled: showNotifications && soundEnabled,
  });

  // 알림 카운트 상태들
  const [signupNotifications, setSignupNotifications] = useState<number>(0);
  const [verificationNotifications, setVerificationNotifications] = useState<number>(0);
  const [orderNotifications, setOrderNotifications] = useState<number>(0);
  const [supportNotifications, setSupportNotifications] = useState<number>(0);
  const [depositNotifications, setDepositNotifications] = useState<number>(0); // 가맹점 입금 알림
  const [coinSaleNotifications, setCoinSaleNotifications] = useState<number>(0); // 가맹점 코인 판매 요청 알림

  const handleLogout = () => {
    logout();
    window.location.hash = '#admin/login';
  };

  // 구매 요청 알림 소리 재생
  const playPurchaseRequestSound = () => {
    if (!soundEnabled) return;
    
    try {
      const soundUrl = new URL('../assets/sounds/accountapproved.MP3', import.meta.url).href;
      const audio = new Audio(soundUrl);
      audio.volume = 0.7;
      audio.play().catch(err => {
        console.error('Failed to play sound:', err);
      });
    } catch (error) {
      console.error('Error creating audio element:', error);
    }
  };

  // 가맹점 판매 요청 알림 소리 재생
  const playCoinSaleSound = () => {
    if (!soundEnabled) return;
    
    try {
      const soundUrl = new URL('../assets/sounds/storeapply.MP3', import.meta.url).href;
      const audio = new Audio(soundUrl);
      audio.volume = 0.7;
      audio.play().catch(err => {
        console.error('Failed to play coin sale sound:', err);
      });
    } catch (error) {
      console.error('Error creating audio element:', error);
    }
  };

  // 신규 가입 알림 소리 재생
  const playSignupSound = () => {
    if (!soundEnabled) return;
    
    try {
      const soundUrl = new URL('../assets/sounds/newuserapproved.MP3', import.meta.url).href;
      const audio = new Audio(soundUrl);
      audio.volume = 0.7;
      audio.play().catch(err => {
        console.error('Failed to play sound:', err);
      });
    } catch (error) {
      console.error('Error creating audio element:', error);
    }
  };

  const handleWalletMove = async () => {
    if (!selectedCoin || !moveAmount || parseFloat(moveAmount) <= 0) {
      toast.error('코인과 금액을 입력해주세요');
      return;
    }

    setIsMoving(true);
    try {
      const endpoint = moveDirection === 'hot-to-cold' ? 'move-to-cold' : 'move-to-hot';
      const backendUrl = 'https://mzoeeqmtvlnyonicycvg.supabase.co/functions/v1/make-server-b6d5667f';
      
      const response = await fetch(`${backendUrl}/transaction/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          coin_type: selectedCoin,
          amount: moveAmount
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success(result.message);
        setShowWalletMoveModal(false);
        setMoveAmount('');
        setSelectedCoin('');
      } else {
        toast.error(result.error || '이동 실패');
      }
    } catch (error: any) {
      console.error('Wallet move error:', error);
      toast.error('자산 이동 실패');
    } finally {
      setIsMoving(false);
    }
  };

  // 지갑 잔액 조회 (wallets 테이블에서)
  useEffect(() => {
    if (!showWallet || !user?.id) return;

    const fetchWalletBalances = async () => {
      try {
        // 가맹점의 경우: 자신의 지갑만 (하위 사용자 제외)
        let targetUserIds = [user.id];
        
        // targetUserIds: store는 자신만, 나머지는 자신만 (확정됨)

        // 1. 관리자의 모든 지갑 조회 (자신의 지갑만)
        const { data: wallets, error: walletsError } = await supabase
          .from('wallets')
          .select('balance, wallet_type, coin_type')
          .in('user_id', targetUserIds)
          .eq('status', 'active');

        if (walletsError) {
          console.error('❌ 지갑 조회 실패:', walletsError);
          throw walletsError;
        }

        if (!wallets || wallets.length === 0) {
          setWalletBalances({ hot: 0, cold: 0, total: 0 });
          return;
        }

        // 2. 모든 활성 코인의 시세 조회
        const { data: prices, error: pricesError } = await supabase
          .from('supported_tokens')
          .select('symbol, price_krw')
          .eq('is_active', true);

        if (pricesError) {
          console.error('❌ 가격 조회 실패:', pricesError);
          // 가격 조회 실패 시에도 잔액은 표시 (가격 0으로)
          setWalletBalances({ hot: 0, cold: 0, total: 0 });
          return;
        }

        // 3. 시세 맵 생성 (빠른 조회를 위해)
        const priceMap = new Map<string, number>();
        prices?.forEach(p => {
          priceMap.set(p.symbol, Number(p.price_krw || 0));
        });

        // 4. 각 지갑의 balance × price_krw 계산 후 합산
        const balances = wallets.reduce((acc, wallet) => {
          const priceKrw = priceMap.get(wallet.coin_type) || 0;
          const balanceKrw = Number(wallet.balance || 0) * priceKrw;

          if (wallet.wallet_type === 'hot') {
            acc.hot += balanceKrw;
          } else if (wallet.wallet_type === 'cold') {
            acc.cold += balanceKrw;
          }
          acc.total += balanceKrw;
          return acc;
        }, { hot: 0, cold: 0, total: 0 });

        setWalletBalances(balances);
      } catch (error: any) {
        console.error('지갑 잔액 조회 실패:', {
          message: error?.message || '알 수 없는 오류',
          details: error?.toString() || '',
          hint: error?.hint || '',
          code: error?.code || ''
        });
        // 에러 발생 시 안전하게 0으로 설정
        setWalletBalances({ hot: 0, cold: 0, total: 0 });
      }
    };

    // 초기 로드를 약간 지연시켜 Supabase 초기화 완료 대기
    const timeoutId = setTimeout(() => {
      fetchWalletBalances();
    }, 100);

    // 실시간 구독 - wallets 테이블 변경 감지
    // 가맹점의 경우 하위 사용자의 지갑도 모니터링
    const walletSubscription = supabase
      .channel(`wallet_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallets',
          // 모든 사용자는 자신의 지갑만 모니터링
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('💰 지갑 변경 감지:', payload);
          fetchWalletBalances();
        }
      )
      .subscribe();

    // 실시간 구독 - supported_tokens 테이블 변경 감지 (가격 업데이트)
    const priceSubscription = supabase
      .channel('price_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'supported_tokens'
        },
        () => {
          fetchWalletBalances();
        }
      )
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      walletSubscription.unsubscribe();
      priceSubscription.unsubscribe();
    };
  }, [showWallet, user?.id, isStore]);

  // 알림 개수 조회 (센터만)
  useEffect(() => {
    if (!showNotifications || !user?.id || !user?.role) return;

    let lastFetchTime = 0;
    const FETCH_DEBOUNCE = 5000; // 5초 이상 간격으로만 조회

    const fetchNotifications = async () => {
      const now = Date.now();
      if (now - lastFetchTime < FETCH_DEBOUNCE) {
        // 너무 자주 호출되면 스킵
        return;
      }
      lastFetchTime = now;

      try {
        // 계층 구조에 따라 하위 사용자 ID 조회
        const hierarchyUserIds = await getHierarchyUserIds(user.id, user.role);
        console.log('🔔 [Header] 알림 확인 - 하위 사용자 IDs:', hierarchyUserIds);

        let signupCount = 0, verificationCount = 0, orderCount = 0, supportCount = 0, depositCount = 0, coinSaleCount = 0;
        let verificationData = [], transferData = [], depositData = [], coinSaleData = [];

        // 센터/에이전시만 하위 사용자 회원가입 알림 조회
        if (isCenter || isAgency) {
          const result = await supabase
            .from('users')
            .select('user_id', { count: 'exact', head: true })
            .in('user_id', hierarchyUserIds)
            .eq('is_active', false)
            .eq('role', 'user');
          signupCount = result.count || 0;
        }

        // 센터/에이전시만 하위 계좌 인증 알림 조회
        if (isCenter || isAgency) {
          const result = await supabase
            .from('account_verifications')
            .select('*', { count: 'exact' })
            .in('user_id', hierarchyUserIds)
            .eq('status', 'pending');
          verificationData = result.data || [];
          verificationCount = result.count || 0;
        }

        // 센터/에이전시만 입출금 요청 알림 조회
        if (isCenter || isAgency) {
          const result = await supabase
            .from('transfer_requests')
            .select('*', { count: 'exact' })
            .in('user_id', hierarchyUserIds)
            .eq('status', 'pending');
          transferData = result.data || [];
          orderCount = result.count || 0;
        }

        // 고객센터 알림 (센터/에이전시만)
        let supportData = [];
        if (isCenter || isAgency) {
          const supportResult = await supabase
            .from('support_messages')
            .select('*', { count: 'exact' })
            .eq('sender_type', 'user')
            .eq('is_read', false);
          supportData = supportResult.data || [];
          supportCount = supportResult.count || 0;
        }

        // 입금 알림 - 가맹점만
        if (isStore) {
          const result = await supabase
            .from('deposits')
            .select('*', { count: 'exact' })
            .eq('user_id', user.id)
            .eq('status', 'pending');
          depositData = result.data || [];
          depositCount = result.count || 0;
        }

        // 가맹점 코인 판매 요청 알림 - 센터/에이전시만
        if (isCenter || isAgency) {
          const result = await supabase
            .from('store_coin_sales')
            .select('*', { count: 'exact' })
            .eq('center_id', user.id)
            .eq('status', 'pending');
          coinSaleData = result.data || [];
          coinSaleCount = result.count || 0;
        }

        setSignupNotifications(signupCount);
        setVerificationNotifications(verificationCount);
        setOrderNotifications(orderCount);
        setSupportNotifications(supportCount);
        setDepositNotifications(depositCount);
        setCoinSaleNotifications(coinSaleCount);
        
        // 🔧 센터/에이전시만 notification 생성 (가맹점은 deposit만 필요)
        
        // 기존 계좌 인증 알림을 notifications 테이블에 생성 (센터/에이전시만)
        if ((isCenter || isAgency) && verificationData && verificationData.length > 0) {
          for (const verification of verificationData) {
            try {
              const verificationId = verification.verification_id || verification.id;
              
              // 이미 생성된 알림이 있는지 확인 (클라이언트 필터링)
              const { data: existingNotifications } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .eq('type', 'account_verification')
                .eq('is_read', false);
              
              // 클라이언트에서 필터링 - 같은 verification_id 확인
              const hasDuplicate = existingNotifications?.some(notif => {
                const notifId = notif.data?.verification_id || notif.data?.id;
                return notifId === verificationId;
              });
              
              // 읽지 않은 알림이 없으면 새로 생성
              if (!hasDuplicate) {
                const { error: insertError } = await supabase.from('notifications').insert({
                  user_id: user.id,
                  type: 'account_verification',
                  title: '계좌 인증 요청',
                  message: `새로운 계좌 인증 요청이 있습니다.`,
                  is_read: false,
                  data: verification,
                });
                if (insertError) {
                  console.error('Failed to insert verification notification:', insertError);
                } else {
                  // ✅ 알림 생성 성공 → 직접 소리 재생
                  console.log('🎵 [Header] Playing account_verification sound');
                  playPurchaseRequestSound();
                }
              }
            } catch (err) {
              console.error('Failed to create verification notification:', err);
            }
          }
        }

        // 구매 요청 알림 (입출금 요청, 하위만)
        // transferData와 orderCount는 이미 위에서 설정됨
        console.log('🔔 [Header] transfer_requests 조회 결과:', {
          count: orderCount,
          data: transferData,
          hierarchyUserIds
        });
        
        // 기존 입출금 요청을 notifications 테이블에 생성 (센터/에이전시만)
        if ((isCenter || isAgency) && transferData && transferData.length > 0) {
          for (const transfer of transferData) {
            try {
              // transfer의 ID 필드 확인 (request_id 또는 transfer_request_id)
              const transferId = transfer.request_id || transfer.transfer_request_id;
              
              // ID가 있는 경우만 처리
              if (!transferId) {
                console.warn('⚠️ [Header] transfer ID not found:', transfer);
                continue;
              }
              
              // 같은 transfer_id에 대한 알림이 있는지 확인
              // data->id 필터링 제거 - 클라이언트에서 필터링
              const { data: existingNotifications } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .eq('type', 'purchase_request')
                .eq('is_read', false);
              
              // 클라이언트에서 필터링 - data.id 또는 data.request_id 일치하는지 확인
              const hasDuplicate = existingNotifications?.some(notif => {
                const notifId = notif.data?.id || notif.data?.request_id;
                return notifId === transferId;
              });
              
              // 같은 건의 읽지 않은 알림이 없으면 새로 생성
              if (!hasDuplicate) {
                const { error: insertError } = await supabase.from('notifications').insert({
                  user_id: user.id,
                  type: 'purchase_request',
                  title: '입출금 요청 발생',
                  message: `새로운 입출금 요청이 있습니다.`,
                  is_read: false,
                  data: transfer,
                });
                if (insertError) {
                  console.error('Failed to insert transfer notification:', insertError);
                } else {
                  // ✅ 알림 생성 성공 → 직접 소리 재생
                  console.log('🎵 [Header] Playing purchase_request sound');
                  playPurchaseRequestSound();
                }
              }
            } catch (err) {
              console.error('Failed to create transfer notification:', err);
            }
          }
        }

        // 기존 고객센터 메시지를 notifications 테이블에 생성 (센터/에이전시만)
        if ((isCenter || isAgency) && supportData && supportData.length > 0) {
          for (const support of supportData) {
            try {
              const supportId = support.support_message_id || support.id;
              
              // 이미 생성된 알림이 있는지 확인 (클라이언트 필터링)
              const { data: existingNotifications } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .eq('type', 'support_request')
                .eq('is_read', false);
              
              // 클라이언트에서 필터링 - 같은 support_message_id 확인
              const hasDuplicate = existingNotifications?.some(notif => {
                const notifId = notif.data?.support_message_id || notif.data?.id;
                return notifId === supportId;
              });
              
              // 같은 건의 읽지 않은 알림이 없으면 새로 생성
              if (!hasDuplicate) {
                const { error: insertError } = await supabase.from('notifications').insert({
                  user_id: user.id,
                  type: 'support_request',
                  title: '고객 문의',
                  message: `새로운 고객 문의가 있습니다.`,
                  is_read: false,
                  data: support,
                });
                if (insertError) {
                  console.error('Failed to insert support notification:', insertError);
                } else {
                  // ✅ 알림 생성 성공 → 직접 소리 재생
                  console.log('🎵 [Header] Playing support_request sound');
                  playPurchaseRequestSound();
                }
              }
            } catch (err) {
              console.error('Failed to create support notification:', err);
            }
          }
        }

        // 기존 입출금 요청을 notifications 테이블에 생성
        if (depositData && depositData.length > 0) {
          for (const deposit of depositData) {
            try {
              const depositId = deposit.deposit_id || deposit.id;
              
              // 이미 생성된 알림이 있는지 확인 (클라이언트 필터링)
              const { data: existingNotifications } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .eq('type', 'deposit')
                .eq('is_read', false);
              
              // 클라이언트에서 필터링 - 같은 deposit_id 확인
              const hasDuplicate = existingNotifications?.some(notif => {
                const notifId = notif.data?.deposit_id || notif.data?.id;
                return notifId === depositId;
              });
              
              // 읽지 않은 알림이 없으면 새로 생성
              if (!hasDuplicate) {
                const { error: insertError } = await supabase.from('notifications').insert({
                  user_id: user.id,
                  type: 'deposit',
                  title: '입금 발생',
                  message: `새로운 입금이 있습니다.`,
                  is_read: false,
                  data: deposit,
                });
                if (insertError) {
                  console.error('Failed to create deposit notification:', insertError);
                }
              }
            } catch (err) {
              console.error('Failed to create deposit notification:', err);
            }
          }
        }

        // 신규 가입자 알림을 notifications 테이블에 생성 (센터/에이전시만)
        if ((isCenter || isAgency) && signupCount > 0) {
          try {
            // 하위 사용자 중 미활성 사용자(신규 가입자) 조회
            const { data: newUsers } = await supabase
              .from('users')
              .select('*')
              .in('user_id', hierarchyUserIds)
              .eq('is_active', false)
              .eq('role', 'user');
            
            if (newUsers && newUsers.length > 0) {
              for (const newUser of newUsers) {
                try {
                  const userId = newUser.user_id;
                  
                  // 이미 생성된 알림이 있는지 확인 (클라이언트 필터링)
                  const { data: existingNotifications } = await supabase
                    .from('notifications')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('type', 'signup')
                    .eq('is_read', false);
                  
                  // 클라이언트에서 필터링 - 같은 new_user_id 확인
                  const hasDuplicate = existingNotifications?.some(notif => {
                    const notifId = notif.data?.user_id || notif.data?.id;
                    return notifId === userId;
                  });
                  
                  // 읽지 않은 알림이 없으면 새로 생성
                  if (!hasDuplicate) {
                    const { error: insertError } = await supabase.from('notifications').insert({
                      user_id: user.id,
                      type: 'signup',
                      title: '신규 가입',
                      message: `새로운 사용자가 가입했습니다.`,
                      is_read: false,
                      data: newUser,
                    });
                    if (insertError) {
                      console.error('Failed to insert signup notification:', insertError);
                    } else {
                      // ✅ 알림 생성 성공 → 직접 소리 재생
                      console.log('🎵 [Header] Playing signup sound');
                      playSignupSound();
                    }
                  }
                } catch (err) {
                  console.error('Failed to process signup notification:', err);
                }
              }
            }
          } catch (err) {
            console.error('Failed to create signup notifications:', err);
          }
        }

        // 가맹점 코인 판매 요청 알림을 notifications 테이블에 생성 (센터/에이전시만)
        if ((isCenter || isAgency) && coinSaleData && coinSaleData.length > 0) {
          for (const coinSale of coinSaleData) {
            try {
              const coinSaleId = coinSale.id;
              
              // 이미 생성된 알림이 있는지 확인 (클라이언트 필터링)
              const { data: existingNotifications } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .eq('type', 'store_coin_sale_request')
                .eq('is_read', false);
              
              // 클라이언트에서 필터링 - 같은 coin_sale_id 확인
              const hasDuplicate = existingNotifications?.some(notif => {
                const notifId = notif.data?.id;
                return notifId === coinSaleId;
              });
              
              // 읽지 않은 알림이 없으면 새로 생성
              if (!hasDuplicate) {
                const { error: insertError } = await supabase.from('notifications').insert({
                  user_id: user.id,
                  type: 'store_coin_sale_request',
                  title: '가맹점 판매 요청',
                  message: `새로운 가맹점 판매 요청이 있습니다.`,
                  is_read: false,
                  data: coinSale,
                });
                if (insertError) {
                  console.error('Failed to insert coin sale notification:', insertError);
                } else {
                  // ✅ 알림 생성 성공 → 직접 소리 재생
                  console.log('🎵 [Header] Playing coin sale sound');
                  playCoinSaleSound();
                }
              }
            } catch (err) {
              console.error('Failed to process coin sale notification:', err);
            }
          }
        }

        console.log('🔔 [Header] 알림 개수:', {
          signup: signupCount,
          verification: verificationCount,
          order: orderCount,
          support: supportCount,
          deposit: depositCount,
          coinSale: coinSaleCount
        });

        // Notification이 INSERT될 시간을 줌 (useNotifications 구독이 감지되도록)
        if (orderCount > 0 || verificationCount > 0 || depositCount > 0 || coinSaleCount > 0) {
          await new Promise(r => setTimeout(r, 500));
        }

        // 🧹 고아 알림 정리 - 원본 데이터가 없으면 notification 삭제
        try {
          // signup 타입 정리
          if (signupCount === 0) {
            const { data: orphaned } = await supabase
              .from('notifications')
              .select('notification_id')
              .eq('user_id', user.id)
              .eq('type', 'signup')
              .eq('is_read', false);
            
            if (orphaned && orphaned.length > 0) {
              for (const notif of orphaned) {
                await supabase.from('notifications').delete().eq('notification_id', notif.notification_id);
              }
              console.log('🧹 Cleaned up', orphaned.length, 'orphaned signup notifications');
            }
          }

          // account_verification 타입 정리
          if (verificationCount === 0) {
            const { data: orphaned } = await supabase
              .from('notifications')
              .select('notification_id')
              .eq('user_id', user.id)
              .eq('type', 'account_verification')
              .eq('is_read', false);
            
            if (orphaned && orphaned.length > 0) {
              for (const notif of orphaned) {
                await supabase.from('notifications').delete().eq('notification_id', notif.notification_id);
              }
              console.log('🧹 Cleaned up', orphaned.length, 'orphaned verification notifications');
            }
          }

          // purchase_request 타입 정리
          if (orderCount === 0) {
            const { data: orphaned } = await supabase
              .from('notifications')
              .select('notification_id')
              .eq('user_id', user.id)
              .eq('type', 'purchase_request')
              .eq('is_read', false);
            
            if (orphaned && orphaned.length > 0) {
              for (const notif of orphaned) {
                await supabase.from('notifications').delete().eq('notification_id', notif.notification_id);
              }
              console.log('🧹 Cleaned up', orphaned.length, 'orphaned purchase notifications');
            }
          }

          // support_request 타입 정리
          if (supportCount === 0) {
            const { data: orphaned } = await supabase
              .from('notifications')
              .select('notification_id')
              .eq('user_id', user.id)
              .eq('type', 'support_request')
              .eq('is_read', false);
            
            if (orphaned && orphaned.length > 0) {
              for (const notif of orphaned) {
                await supabase.from('notifications').delete().eq('notification_id', notif.notification_id);
              }
              console.log('🧹 Cleaned up', orphaned.length, 'orphaned support notifications');
            }
          }

          // deposit 타입 정리
          if (depositCount === 0) {
            const { data: orphaned } = await supabase
              .from('notifications')
              .select('notification_id')
              .eq('user_id', user.id)
              .in('type', ['deposit', 'store_deposit'])
              .eq('is_read', false);
            
            if (orphaned && orphaned.length > 0) {
              for (const notif of orphaned) {
                await supabase.from('notifications').delete().eq('notification_id', notif.notification_id);
              }
              console.log('🧹 Cleaned up', orphaned.length, 'orphaned deposit notifications');
            }
          }
        } catch (err) {
          console.error('Failed to cleanup orphaned notifications:', err);
        }
      } catch (error) {
        console.error('알림 조회 실패:', error);
      }
    };

    fetchNotifications();

    // 실시간 구독: 계좌 인증 요청 (센터/에이전시만)
    const accountVerificationSub = (isCenter || isAgency) ? supabase
      .channel('account_verification_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'account_verifications'
        },
        async (payload: any) => {
          console.log('🔔 [Header] account_verification changed:', payload);
          if (payload.eventType === 'INSERT') {
            // 새로운 계좌 인증 요청이 생성됨 - 알림 생성
            const { error: notificationError } = await supabase.from('notifications').insert({
              user_id: user?.id,
              type: 'account_verification',
              title: '계좌 인증 요청',
              message: `새로운 계좌 인증 요청이 있습니다.`,
              is_read: false,
              data: payload.new,
            });
            if (notificationError) console.error('Failed to create notification:', notificationError);
          }
          fetchNotifications();
        }
      )
      .subscribe() : null;

    // 실시간 구독: 신규 회원가입 및 상태 변경 (센터/에이전시만)
    const usersSub = (isCenter || isAgency) ? supabase
      .channel('users_notifications')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT와 UPDATE 모두 감지
          schema: 'public',
          table: 'users'
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe() : null;

    // 실시간 구독: 입출금 요청 (센터/에이전시만)
    const depositWithdrawalSub = (isCenter || isAgency) ? supabase
      .channel('deposit_withdrawal_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transfer_requests'
        },
        async (payload: any) => {
          console.log('🔔 [Header] transfer_request changed:', payload);
          if (payload.eventType === 'INSERT') {
            // 새로운 입출금 요청이 생성됨 - 알림 생성
            const { error: notificationError } = await supabase.from('notifications').insert({
              user_id: user?.id,
              type: 'purchase_request',
              title: '입출금 요청 발생',
              message: `새로운 입출금 요청이 있습니다.`,
              is_read: false,
              data: payload.new,
            });
            if (notificationError) console.error('Failed to create notification:', notificationError);
          }
          fetchNotifications();
        }
      )
      .subscribe() : null;

    // 실시간 구독: 가맹점 입금 요청
    const depositSub = supabase
      .channel('deposit_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deposits'
        },
        async (payload: any) => {
          console.log('🔔 [Header] deposit changed:', payload);
          if (payload.eventType === 'INSERT') {
            // 새로운 입금이 생성됨 - 알림 생성
            const { error: notificationError } = await supabase.from('notifications').insert({
              user_id: user?.id,
              type: 'deposit',
              title: '입금 발생',
              message: `새로운 입금이 있습니다.`,
              is_read: false,
              data: payload.new,
            });
            if (notificationError) console.error('Failed to create notification:', notificationError);
          }
          fetchNotifications();
        }
      )
      .subscribe();

    // 실시간 구독: 가맹점 코인 판매 요청
    const coinSaleSub = (isCenter || isAgency) ? supabase
      .channel('store_coin_sales_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'store_coin_sales'
        },
        async (payload: any) => {
          console.log('🔔 [Header] store_coin_sales changed:', payload);
          if (payload.eventType === 'INSERT') {
            // 새로운 가맹점 판매 요청이 생성됨 - 알림 생성
            const { error: notificationError } = await supabase.from('notifications').insert({
              user_id: user?.id,
              type: 'store_coin_sale_request',
              title: '가맹점 판매 요청',
              message: `새로운 가맹점 판매 요청이 있습니다.`,
              is_read: false,
              data: payload.new,
            });
            if (notificationError) {
              console.error('Failed to create notification:', notificationError);
            } else {
              // soundEnabled 체크 후 소리 재생
              if (soundEnabled) {
                console.log('🎵 [Header] Playing coin sale sound (realtime)');
                playCoinSaleSound();
              }
            }
          }
          fetchNotifications();
        }
      )
      .subscribe() : null;

    // 실시간 구독: 고객센터 메시지
    const supportSub = supabase
      .channel('support_messages_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'support_messages'
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    // 10초마다 갱신 (fallback)
    const interval = setInterval(fetchNotifications, 10000);
    
    return () => {
      if (accountVerificationSub) accountVerificationSub.unsubscribe(); // ✅ null 체크
      if (usersSub) usersSub.unsubscribe(); // ✅ null 체크
      if (depositWithdrawalSub) depositWithdrawalSub.unsubscribe(); // ✅ null 체크
      if (coinSaleSub) coinSaleSub.unsubscribe(); // ✅ null 체크
      depositSub.unsubscribe();
      supportSub.unsubscribe();
      clearInterval(interval);
    };
  }, [showNotifications, user?.id, user?.role, soundEnabled]);

  // 가맹점 입금 알림 (가맹점만)
  useEffect(() => {
    if (!isStore || !user?.id) return;

    const fetchStoreDepositNotifications = async () => {
      try {
        console.log('🏪 가맹점 입금 알림 조회:', { userId: user.id });

        // 계층 구조의 하위 사용자 ID 조회
        const hierarchyUserIds = await getHierarchyUserIds(user.id, user.role);
        
        // viewed_by_store = false인 입금만 카운트
        const { count: newDepositCount } = await supabase
          .from('deposits')
          .select('*', { count: 'exact', head: true })
          .in('user_id', hierarchyUserIds)
          .eq('viewed_by_store', false);
        
        console.log('📥 미확인 입금:', newDepositCount);
        setDepositNotifications(newDepositCount || 0);
      } catch (error) {
        console.error('❌ 가맹점 입금 알림 조회 실패:', error);
      }
    };

    fetchStoreDepositNotifications();

    // 실시간 구독: 입금 발생 또는 viewed 상태 변경 시 알림
    const depositSub = supabase
      .channel('store_deposit_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',  // INSERT, UPDATE 모두 감지
          schema: 'public',
          table: 'deposits'
        },
        () => {
          console.log('📥 입금 데이터 변경 감지!');
          fetchStoreDepositNotifications();
        }
      )
      .subscribe();

    // 10초마다 갱신 (fallback)
    const interval = setInterval(fetchStoreDepositNotifications, 10000);
    
    // 커스텀 이벤트 리스너: 입금 탭 확인 시 즉시 갱신
    const handleDepositsViewed = () => {
      console.log('📥 입금 확인 이벤트 감지!');
      fetchStoreDepositNotifications();
    };
    
    window.addEventListener('deposits-viewed', handleDepositsViewed);
    
    return () => {
      depositSub.unsubscribe();
      clearInterval(interval);
      window.removeEventListener('deposits-viewed', handleDepositsViewed);
    };
  }, [isStore, user?.id, user?.role]);

  return (
    <>
      <header className="h-16 bg-slate-900/50 backdrop-blur-xl border-b border-cyan-500/20 flex items-center justify-between px-6">
        {/* 왼쪽: 지갑 보유금 (센터/가맹점만) */}
        <div className="flex items-center gap-6">
          {showWallet && (
            <>
              {/* Hot Wallet */}
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-orange-500" />
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400">Hot Wallet</span>
                  <span className="text-sm text-orange-500">₩{walletBalances.hot.toLocaleString()}</span>
                </div>
              </div>
              
              {/* Cold Wallet */}
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-blue-500" />
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400">Cold Wallet</span>
                  <span className="text-sm text-blue-500">₩{walletBalances.cold.toLocaleString()}</span>
                </div>
              </div>
              
              {/* Hot ↔ Cold 이동 버튼 */}
              <button
                onClick={() => setShowWalletMoveModal(true)}
                className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
                title="Hot ↔ Cold 지갑 이동"
              >
                <ArrowLeftRight className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        {/* 오른쪽: 알림 + 프로필 */}
        <div className="flex items-center gap-4">
          {/* 알림 아이콘들 (센터만) */}
          {showNotifications && (
            <>
              {/* 소리 on/off 버튼 */}
              <button
                onClick={() => {
                  setSoundEnabled(!soundEnabled);
                  if (soundEnabled) {
                    stopSound();
                  }
                }}
                className={`p-2 transition-all duration-200 ${
                  soundEnabled 
                    ? 'text-cyan-400 hover:text-cyan-300' 
                    : 'text-slate-500 hover:text-slate-400'
                }`}
                aria-label={soundEnabled ? '소리 끄기' : '소리 켜기'}
                title={soundEnabled ? '알림 소리 끄기' : '알림 소리 켜기'}
              >
                {soundEnabled ? (
                  <Volume2 className={`w-5 h-5 ${isPlaying ? 'animate-pulse' : ''}`} />
                ) : (
                  <VolumeX className="w-5 h-5" />
                )}
              </button>

              {/* 회원가입 알림 (초록색) */}
              <button 
                className="relative p-2.5 text-slate-400 hover:text-slate-300 transition-colors"
                onClick={() => onNavigate('users-wallets')}
                title="회원가입 알림"
              >
                <UserPlus className="w-5 h-5" />
                {signupNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-green-500 rounded-full text-[10px] text-white flex items-center justify-center px-1">
                    {signupNotifications}
                  </span>
                )}
              </button>

              {/* 계좌 인증 알림 (파란색) */}
              <button 
                className="relative p-2.5 text-slate-400 hover:text-slate-300 transition-colors"
                onClick={() => onNavigate('account-verifications')}
                title="계좌 인증 알림"
              >
                <FileCheck className="w-5 h-5" />
                {verificationNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-blue-500 rounded-full text-[10px] text-white flex items-center justify-center px-1">
                    {verificationNotifications}
                  </span>
                )}
              </button>

              {/* 구매 요청 알림 (보라색) */}
              <button 
                className="relative p-2.5 text-slate-400 hover:text-slate-300 transition-colors"
                onClick={() => onNavigate('deposit-withdrawal')}
                title="구매 요청 알림"
              >
                <ShoppingCart className="w-5 h-5" />
                {orderNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-purple-500 rounded-full text-[10px] text-white flex items-center justify-center px-1">
                    {orderNotifications}
                  </span>
                )}
              </button>

              {/* 고객센터 알림 (빨간색 숫자) */}
              <button 
                className="relative p-2.5 text-slate-400 hover:text-slate-300 transition-colors"
                onClick={() => onNavigate('support-center')}
                title="고객센터 알림"
              >
                <MessageSquare className="w-5 h-5" />
                {supportNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center px-1">
                    {supportNotifications}
                  </span>
                )}
              </button>

              {/* 가맹점 판매 요청 알림 (주황색) */}
              <button 
                className="relative p-2.5 text-slate-400 hover:text-slate-300 transition-colors"
                onClick={() => {
                  localStorage.setItem('admin_deposit_active_tab', 'coin_sales');
                  onNavigate('deposit-withdrawal');
                }}
                title="가맹점 판매 요청 알림"
              >
                <ArrowDownCircle className="w-5 h-5" />
                {coinSaleNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-orange-500 rounded-full text-[10px] text-white flex items-center justify-center px-1">
                    {coinSaleNotifications}
                  </span>
                )}
              </button>
            </>
          )}

          {/* 가맹점 입금 알림만 (가맹점용) */}
          {isStore && (
            <button 
              className="relative p-2.5 text-slate-400 hover:text-slate-300 transition-colors"
              onClick={() => onNavigate('deposit-withdrawal')}
              title="입금 알림"
            >
              <ArrowDownCircle className="w-5 h-5" />
              {depositNotifications > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-cyan-500 rounded-full text-[10px] text-white flex items-center justify-center px-1">
                  {depositNotifications}
                </span>
              )}
            </button>
          )}

          {/* 사용자 프로필 */}
          <div className="flex items-center gap-3">
            <div 
              className="w-9 h-9 rounded-full bg-cyan-500/20 border-2 border-cyan-500 flex items-center justify-center cursor-pointer hover:bg-cyan-500/30 transition-colors"
              onClick={() => {
                if (isMaster || isCenter || isAgency || isStore) {
                  setShowProfileCard(true);
                } else {
                  onNavigate('dashboard');
                }
              }}
              title={user?.username || 'Admin'}
            >
              <User className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm text-slate-300">{user?.username || 'Admin'}</p>
              <p className="text-xs text-slate-500">
                {isMaster ? '마스터 관리자' : '관리자'}
              </p>
            </div>
          </div>

          {/* 로그아웃 */}
          <button 
            onClick={handleLogout}
            className="p-2.5 text-slate-400 hover:text-red-400 transition-colors"
            title="로그아웃"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 마스터 프로필 카드 */}
      {isMaster && showProfileCard && (
        <MasterProfileCard onClose={() => setShowProfileCard(false)} />
      )}
      
      {/* 센터/에이전시/가맹점 관리자 프로필 카드 */}
      {(isCenter || isAgency || isStore) && showProfileCard && (
        <AdminProfileCard onClose={() => setShowProfileCard(false)} />
      )}

      {/* Hot ↔ Cold 이동 모달 - header 밖으로 분리 */}
      {showWalletMoveModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]" onClick={() => setShowWalletMoveModal(false)}>
          <div className="bg-slate-800 rounded-lg p-6 w-[400px] border border-cyan-500/30 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg text-cyan-400 mb-4">지갑 자산 이동</h3>
            
            {/* 이동 방향 선택 */}
            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-2">이동 방향</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMoveDirection('hot-to-cold')}
                  className={`flex-1 p-3 rounded-lg border transition-colors ${
                    moveDirection === 'hot-to-cold'
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  🔥 Hot → ❄️ Cold
                </button>
                <button
                  onClick={() => setMoveDirection('cold-to-hot')}
                  className={`flex-1 p-3 rounded-lg border transition-colors ${
                    moveDirection === 'cold-to-hot'
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  ❄️ Cold → 🔥 Hot
                </button>
              </div>
            </div>
            
            {/* 코인 선택 */}
            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-2">코인</label>
              <select
                value={selectedCoin}
                onChange={(e) => setSelectedCoin(e.target.value)}
                className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="">선택하세요</option>
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
              </select>
            </div>
            
            {/* 금액 입력 */}
            <div className="mb-6">
              <label className="block text-sm text-slate-400 mb-2">금액</label>
              <input
                type="number"
                value={moveAmount}
                onChange={(e) => setMoveAmount(e.target.value)}
                placeholder="이동할 금액을 입력하세요"
                className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500"
              />
            </div>
            
            {/* 버튼 */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowWalletMoveModal(false)}
                className="flex-1 p-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleWalletMove}
                disabled={isMoving}
                className="flex-1 p-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isMoving ? '이동 중...' : '이동'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}