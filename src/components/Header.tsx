import { User, LogOut, UserPlus, FileCheck, ShoppingCart, MessageSquare, Wallet, ArrowLeftRight, ArrowDownCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useState, useEffect } from "react";
import { supabase } from "../utils/supabase/client";
import { toast } from "sonner";
import { getHierarchyUserIds } from "../utils/api/query-helpers";

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
  const [signupNotifications, setSignupNotifications] = useState<number>(0);
  const [verificationNotifications, setVerificationNotifications] = useState<number>(0);
  const [orderNotifications, setOrderNotifications] = useState<number>(0);
  const [supportNotifications, setSupportNotifications] = useState<number>(0);
  const [depositNotifications, setDepositNotifications] = useState<number>(0); // 가맹점 입금 알림
  const [showWalletMoveModal, setShowWalletMoveModal] = useState(false);
  const [moveDirection, setMoveDirection] = useState<'hot-to-cold' | 'cold-to-hot'>('hot-to-cold');
  const [moveAmount, setMoveAmount] = useState('');
  const [selectedCoin, setSelectedCoin] = useState('');
  const [isMoving, setIsMoving] = useState(false);

  const handleLogout = () => {
    logout();
    window.location.hash = '#admin/login';
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

  const isMaster = user?.role === 'master';
  const isCenter = user?.role === 'center';
  const isStore = user?.role === 'store';
  const showWallet = isCenter || isStore;
  const showNotifications = isCenter; // 센터만 알림 표시

  // 지갑 잔액 조회 (wallets 테이블에서)
  useEffect(() => {
    if (!showWallet || !user?.id) return;

    const fetchWalletBalances = async () => {
      try {
        // 1. 관리자의 모든 지갑 조회 (coin_type 포함)
        const { data: wallets, error: walletsError } = await supabase
          .from('wallets')
          .select('balance, wallet_type, coin_type')
          .eq('user_id', user.id)
          .eq('status', 'active');

        if (walletsError) throw walletsError;

        if (!wallets || wallets.length === 0) {
          setWalletBalances({ hot: 0, cold: 0, total: 0 });
          return;
        }

        // 2. 모든 활성 코인의 시세 조회
        const { data: prices, error: pricesError } = await supabase
          .from('supported_tokens')
          .select('symbol, price_krw')
          .eq('is_active', true);

        if (pricesError) throw pricesError;

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
      } catch (error) {
        console.error('지갑 잔액 조회 실패:', error);
        setWalletBalances({ hot: 0, cold: 0, total: 0 });
      }
    };

    fetchWalletBalances();

    // 실시간 구독 - wallets 테이블 변경 감지
    const walletSubscription = supabase
      .channel(`wallet_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${user.id}`
        },
        () => {
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
      walletSubscription.unsubscribe();
      priceSubscription.unsubscribe();
    };
  }, [showWallet, user?.id]);

  // 알림 개수 조회 (센터만)
  useEffect(() => {
    if (!showNotifications || !user?.id || !user?.role) return;

    const fetchNotifications = async () => {
      try {
        // 계층 구조에 따라 하위 사용자 ID 조회
        const hierarchyUserIds = await getHierarchyUserIds(user.id, user.role);
        console.log('🔔 [Header] 알림 확인 - 하위 사용자 IDs:', hierarchyUserIds);

        // 회원가입 알림 (승인대기 상태만, 하위만)
        const { count: signupCount } = await supabase
          .from('users')
          .select('user_id', { count: 'exact', head: true })
          .in('user_id', hierarchyUserIds)
          .eq('is_active', false)
          .eq('role', 'user'); // role='user'만 카운트
        
        setSignupNotifications(signupCount || 0);

        // 계좌 인증 알림 (pending 상태, 하위만)
        const { count: verificationCount } = await supabase
          .from('account_verifications')
          .select('*', { count: 'exact', head: true })
          .in('user_id', hierarchyUserIds)
          .eq('status', 'pending');
        
        setVerificationNotifications(verificationCount || 0);

        // 구매 요청 알림 (입출금 요청, 하위만)
        const { data: transferData, count: orderCount, error: transferError } = await supabase
          .from('transfer_requests')
          .select('*', { count: 'exact' })
          .in('user_id', hierarchyUserIds)
          .eq('status', 'pending');
        
        console.log('🔔 [Header] transfer_requests 조회 결과:', {
          count: orderCount,
          data: transferData,
          error: transferError,
          hierarchyUserIds
        });
        
        setOrderNotifications(orderCount || 0);

        // 고객센터 알림 - support_messages에서 읽지 않은 사용자 메시지 카운트
        const { count: supportCount } = await supabase
          .from('support_messages')
          .select('*', { count: 'exact', head: true })
          .eq('sender_type', 'user')
          .eq('is_read', false);
        
        setSupportNotifications(supportCount || 0);

        // 가맹점 입금 알림 (센터만)
        const { count: depositCount } = await supabase
          .from('deposits')
          .select('*', { count: 'exact', head: true })
          .in('user_id', hierarchyUserIds)
          .eq('status', 'pending');
        
        setDepositNotifications(depositCount || 0);

        console.log('🔔 [Header] 알림 개수:', {
          signup: signupCount,
          verification: verificationCount,
          order: orderCount,
          support: supportCount,
          deposit: depositCount
        });
      } catch (error) {
        console.error('알림 조회 실패:', error);
      }
    };

    fetchNotifications();

    // 실시간 구독: 계좌 인증 요청
    const accountVerificationSub = supabase
      .channel('account_verification_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'account_verifications'
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    // 실시간 구독: 신규 회원가입 및 상태 변경
    const usersSub = supabase
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
      .subscribe();

    // 실시간 구독: 입출금 요청
    const depositWithdrawalSub = supabase
      .channel('deposit_withdrawal_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transfer_requests'
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

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
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

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
      accountVerificationSub.unsubscribe();
      usersSub.unsubscribe();
      depositWithdrawalSub.unsubscribe();
      depositSub.unsubscribe();
      supportSub.unsubscribe();
      clearInterval(interval);
    };
  }, [showNotifications, user?.id, user?.role]);

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
    
    return () => {
      depositSub.unsubscribe();
      clearInterval(interval);
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

              {/* 가맹점 입금 알림 (노란색) */}
              <button 
                className="relative p-2.5 text-slate-400 hover:text-slate-300 transition-colors"
                onClick={() => onNavigate('deposits')}
                title="가맹점 입금 알림"
              >
                <ArrowDownCircle className="w-5 h-5" />
                {depositNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-yellow-500 rounded-full text-[10px] text-white flex items-center justify-center px-1">
                    {depositNotifications}
                  </span>
                )}
              </button>
            </>
          )}

          {/* 가맹점 입금 알림 (가맹점만) */}
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
              onClick={() => onNavigate('dashboard')}
              title={user?.username || 'Admin'}
            >
              <User className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm text-slate-300">{user?.username || 'Admin'}</p>
              <p className="text-xs text-slate-500">관리자</p>
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