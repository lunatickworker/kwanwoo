import { useState, useEffect } from 'react';
import { Wallet, Plus, X, RefreshCw, TrendingUp, TrendingDown, Copy, Check, Trash2, Send } from 'lucide-react';
import { supabase } from '../utils/supabase/client';
import { toast } from 'sonner@2.0.3';
import { useAuth } from '../contexts/AuthContext';
import { CoinSaleRequest } from './CoinSaleRequest';
import { useBlockchainSync } from '../hooks/useBlockchainSync';

interface WalletInfo {
  wallet_id: string;
  coin_type: string;
  balance: number;
  address: string;
  wallet_type: 'hot' | 'cold';
  icon_url?: string;
  price_krw?: number;
  change_24h?: number;
}

interface AdminProfileCardProps {
  onClose: () => void;
}

export function AdminProfileCard({ onClose }: AdminProfileCardProps) {
  const { user } = useAuth();
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [supportedCoins, setSupportedCoins] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [selectedCoinType, setSelectedCoinType] = useState('');
  const [selectedWalletType, setSelectedWalletType] = useState<'hot' | 'cold'>('hot');
  const [isCreating, setIsCreating] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [deletingWalletId, setDeletingWalletId] = useState<string | null>(null);
  const [showCoinSaleRequest, setShowCoinSaleRequest] = useState(false);
  const { startMonitoring } = useBlockchainSync({
    onSuccess: () => {
      console.log('✅ 프로필 잔액 동기화 완료');
    },
    onTimeout: () => {
      console.log('⏱️ 프로필 동기화 타임아웃');
    }
  });

  // 주소 복사 함수
  const copyAddress = async (address: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      // Clipboard API가 차단된 경우를 대비한 fallback 방법
      const textArea = document.createElement('textarea');
      textArea.value = address;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        setCopiedAddress(address);
        toast.success('주소가 복사되었습니다');
        setTimeout(() => setCopiedAddress(null), 2000);
      } else {
        throw new Error('복사 실패');
      }
    } catch (error) {
      console.error('Copy failed:', error);
      toast.error('복사에 실패했습니다');
    }
  };

  useEffect(() => {
    console.log('🎴 프로필카드 열림 - 블록체인 동기화 시작');
    startMonitoring();
    
    fetchWallets();
    fetchSupportedCoins();
    
    // wallets 테이블 실시간 구독
    const walletSubscription = supabase
      .channel(`admin_profile_wallets_${user?.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallets',
          // 모든 사용자는 자신의 지갑만 모니터링
          filter: `user_id=eq.${user?.id}`
        },
        (payload) => {
          console.log('💰 [프로필] 지갑 변경 감지:', payload);
          fetchWallets();
        }
      )
      .subscribe();
    
    return () => {
      walletSubscription.unsubscribe();
    };
  }, [user?.id, user?.role]);

  const fetchWallets = async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      
      // 가맹점의 경우: 자신의 지갑 + 하위 사용자들의 지갑 포함
      let targetUserIds = [user.id];
      
      if (user.role === 'store') {
        // 하위 사용자 ID 조회
        const { data: childUsers } = await supabase
          .from('users')
          .select('user_id')
          .eq('parent_user_id', user.id)
          .eq('role', 'user');
        
        if (childUsers && childUsers.length > 0) {
          targetUserIds = [...targetUserIds, ...childUsers.map(u => u.user_id)];
        }
      }
      
      // 1. 지갱 정보 조회 (status 필터링 제거)
      const { data: walletsData, error: walletsError } = await supabase
        .from('wallets')
        .select('*')
        .in('user_id', targetUserIds)
        .order('created_at', { ascending: false });

      console.log('📊 fetchWallets 결과:', { walletsData, walletsError, targetUserIds });

      if (walletsError) throw walletsError;

      // 2. 활성 코인 정보 조회
      const { data: tokensData, error: tokensError } = await supabase
        .from('supported_tokens')
        .select('symbol, icon_url, price_krw, change_24h')
        .eq('is_active', true);

      if (tokensError) throw tokensError;

      // 3. 코인 정보를 Map으로 변환 (빠른 조회)
      const tokensMap = new Map(
        tokensData?.map(token => [token.symbol, token]) || []
      );

      // 4. 지갑 데이터와 코인 정보 결합
      // 가맹점은 자신의 지갑만 표시 (하위 사용자 제외)
      if (user.role === 'store') {
        // 가맹점 자신의 지갑만 필터링
        const storeOwnWallets = walletsData?.filter((w: any) => w.user_id === user.id) || [];
        
        // 각 지갑을 배열로 변환
        const formattedWallets = storeOwnWallets.map((w: any) => {
          const tokenInfo = tokensMap.get(w.coin_type);
          return {
            wallet_id: w.wallet_id,
            coin_type: w.coin_type,
            balance: Number(w.balance),
            address: w.address,
            wallet_type: w.wallet_type,
            icon_url: tokenInfo?.icon_url,
            price_krw: tokenInfo?.price_krw,
            change_24h: tokenInfo?.change_24h
          };
        });
        
        console.log('💾 최종 포맷팅된 지갱 리스트 (store):', formattedWallets);
        setWallets(formattedWallets);
      } else {
        // 다른 역할은 기존대로 처리
        const formattedWallets = walletsData?.map((w: any) => {
          const tokenInfo = tokensMap.get(w.coin_type);
          return {
            wallet_id: w.wallet_id,
            coin_type: w.coin_type,
            balance: w.balance,
            address: w.address,
            wallet_type: w.wallet_type,
            icon_url: tokenInfo?.icon_url,
            price_krw: tokenInfo?.price_krw,
            change_24h: tokenInfo?.change_24h
          };
        }) || [];

        console.log('💾 최종 포맷팅된 지갱 리스트:', formattedWallets);
        setWallets(formattedWallets);
      }
    } catch (error: any) {
      console.error('지갑 조회 오류:', error);
      toast.error('지갑 정보를 가져오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSupportedCoins = async () => {
    try {
      const { data, error } = await supabase
        .from('supported_tokens')
        .select('symbol, name, icon_url, is_active')
        .eq('is_active', true)
        .order('symbol', { ascending: true });

      if (error) throw error;
      setSupportedCoins(data || []);
    } catch (error) {
      console.error('코인 목록 조회 오류:', error);
    }
  };

  const handleCreateWallet = async () => {
    if (!selectedCoinType) {
      toast.error('코인 종류를 선택해주세요');
      return;
    }

    if (!user?.id) {
      toast.error('사용자 정보를 찾을 수 없습니다');
      return;
    }

    setIsCreating(true);

    try {
      // ✅ 중복 체크는 백엔드에서 처리 (같은 주소 재사용)
      // Biconomy를 통한 지갑 생성
      const backendUrl = 'https://mzoeeqmtvlnyonicycvg.supabase.co/functions/v1/make-server-b6d5667f';
      const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16b2VlcW10dmxueW9uaWN5Y3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MjIyNzcsImV4cCI6MjA3ODQ5ODI3N30.oo7FsWjthtBtM-Xa1VFJieMGQ4mG__V8w7r9qGBPzaI';

      toast.info('지갑 생성 중...');

      const response = await fetch(`${backendUrl}/wallet/create-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`
        },
        body: JSON.stringify({
          user_id: user.id,
          coin_types: [selectedCoinType],
          wallet_type: selectedWalletType
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '지갑 생성에 실패했습니다');
      }

      console.log('✅ 지갱 생성 성공:', result);
      toast.success(`${selectedCoinType} ${selectedWalletType === 'hot' ? 'Hot' : 'Cold'} 지갑이 생성되었습니다!`);
      setShowAddWallet(false);
      setSelectedCoinType('');
      setSelectedWalletType('hot');
      await fetchWallets();

    } catch (error: any) {
      console.error('지갑 생성 오류:', error);
      toast.error(error.message || '지갑 생성에 실패했습니다');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteWallet = async (walletId: string, coinType: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`${coinType} 지갑을 삭제하시겠습니까?\n\n⚠️ 주의: 지갑 삭제는 되돌릴 수 없으며, 지갑 내 자산이 있는 경우 복구가 불가능합니다.`)) {
      return;
    }

    setDeletingWalletId(walletId);

    try {
      // 지갑의 잔액 확인
      const wallet = wallets.find(w => w.wallet_id === walletId);
      if (wallet && wallet.balance > 0) {
        const confirmDelete = confirm(
          `이 지갑에는 ${wallet.balance.toLocaleString()} ${coinType}이 남아있습니다.\n정말로 삭제하시겠습니까?`
        );
        if (!confirmDelete) {
          setDeletingWalletId(null);
          return;
        }
      }

      // 지갑 상태를 'closed'로 변경 (소프트 삭제)
      const { error } = await supabase
        .from('wallets')
        .update({ status: 'closed' })
        .eq('wallet_id', walletId);

      if (error) throw error;

      toast.success('지갑이 삭제되었습니다');
      fetchWallets(); // 지갑 목록 새로고침

    } catch (error: any) {
      console.error('지갑 삭제 오류:', error);
      toast.error(error.message || '지갑 삭제에 실패했습니다');
    } finally {
      setDeletingWalletId(null);
    }
  };

  const totalValueKRW = wallets.reduce((sum, w) => {
    return sum + (w.balance * (w.price_krw || 0));
  }, 0);

  // 역할에 따른 타이틀
  const getRoleTitle = () => {
    switch (user?.role) {
      case 'center':
        return '센터 관리자';
      case 'agency':
        return '에이전시 관리자';
      case 'store':
        return '가맹점 관리자';
      case 'admin':
        return '시스템 관리자';
      default:
        return '관리자';
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-start justify-end p-4 bg-black/50"
      onClick={onClose}
    >
      {/* 프로필 카드 */}
      <div 
        className="mt-16 mr-4 w-[480px] bg-slate-900/95 backdrop-blur-xl border border-cyan-500/30 rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-cyan-500/20">
          <div>
            <h3 className="text-xl text-cyan-400 font-semibold">{user?.username || 'Admin'}</h3>
            <p className="text-sm text-slate-400 mt-1">{getRoleTitle()}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 총 자산 */}
        <div className="p-6 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border-b border-cyan-500/20">
          <div className="text-sm text-slate-400 mb-2">총 자산 (KRW)</div>
          <div className="text-3xl text-cyan-400 font-bold">
            ₩{totalValueKRW.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>

        {/* 가맹점 전용: 코인 판매 요청 버튼 */}
        {user?.role === 'store' && (
          <div className="p-6 border-b border-cyan-500/20">
            <button
              onClick={() => setShowCoinSaleRequest(true)}
              className="w-full px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg transition-colors border border-cyan-500/30 hover:border-cyan-500/50"
            >
              코인판매요청
            </button>
          </div>
        )}

        {/* 지갑 목록 */}
        <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg text-cyan-400">지갑 목록</h4>
            {/* 가맹점(store)이 아닐 때만 지갑 생성 버튼 표시 */}
            {user?.role !== 'store' && (
              <button
                onClick={() => setShowAddWallet(!showAddWallet)}
                className="flex items-center gap-2 px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg transition-colors border border-cyan-500/30"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">지갑 생성</span>
              </button>
            )}
          </div>

          {/* 지갑 생성 폼 */}
          {showAddWallet && (
            <div className="mb-4 p-4 bg-slate-800/50 border border-cyan-500/20 rounded-lg space-y-3">
              <div>
                <label className="block text-sm text-slate-400 mb-2">코인 선택</label>
                <select
                  value={selectedCoinType}
                  onChange={(e) => setSelectedCoinType(e.target.value)}
                  className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500"
                >
                  <option value="">선택하세요</option>
                  {supportedCoins.map((coin) => (
                    <option key={coin.symbol} value={coin.symbol}>
                      {coin.symbol} - {coin.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">지갑 타입</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedWalletType('hot')}
                    className={`flex-1 p-2.5 rounded-lg border transition-colors ${
                      selectedWalletType === 'hot'
                        ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                        : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    🔥 Hot Wallet
                  </button>
                  <button
                    onClick={() => setSelectedWalletType('cold')}
                    className={`flex-1 p-2.5 rounded-lg border transition-colors ${
                      selectedWalletType === 'cold'
                        ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                        : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    ❄️ Cold Wallet
                  </button>
                </div>
              </div>

              <button
                onClick={handleCreateWallet}
                disabled={isCreating || !selectedCoinType}
                className="w-full p-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? '생성 중...' : '지갑 생성'}
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              로딩 중...
            </div>
          ) : wallets.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Wallet className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>생성된 지갑이 없습니다</p>
              {user?.role === 'store' ? (
                <p className="text-sm mt-1">지갑은 센터 관리자가 생성합니다</p>
              ) : (
                <p className="text-sm mt-1">위의 '지갑 생성' 버튼을 눌러 지갑을 만들어보세요</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {wallets.map((wallet) => {
                const valueKRW = wallet.balance * (wallet.price_krw || 0);
                const isHot = wallet.wallet_type === 'hot';

                return (
                  <div
                    key={wallet.wallet_id}
                    className={`p-4 rounded-lg border transition-all hover:shadow-lg ${
                      isHot
                        ? 'bg-orange-500/5 border-orange-500/30 hover:border-orange-500/50'
                        : 'bg-blue-500/5 border-blue-500/30 hover:border-blue-500/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        {wallet.icon_url ? (
                          <img src={wallet.icon_url} alt={wallet.coin_type} className="w-10 h-10 rounded-full" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                            <Wallet className="w-5 h-5 text-cyan-400" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <h5 className="text-slate-200 font-semibold">{wallet.coin_type}</h5>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              isHot
                                ? 'bg-orange-500/20 text-orange-400'
                                : 'bg-blue-500/20 text-blue-400'
                            }`}>
                              {isHot ? '🔥 Hot' : '❄️ Cold'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-xs text-slate-400">
                              {wallet.address.substring(0, 10)}...{wallet.address.substring(wallet.address.length - 8)}
                            </p>
                            <button
                              onClick={(e) => copyAddress(wallet.address, e)}
                              className="p-0.5 text-slate-400 hover:text-cyan-400 transition-colors"
                              title="주소 복사"
                            >
                              {copiedAddress === wallet.address ? (
                                <Check className="w-3 h-3 text-green-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {wallet.change_24h !== undefined && wallet.change_24h !== null && (
                          <div className={`flex items-center gap-1 text-sm ${
                            wallet.change_24h >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {wallet.change_24h >= 0 ? (
                              <TrendingUp className="w-4 h-4" />
                            ) : (
                              <TrendingDown className="w-4 h-4" />
                            )}
                            <span>{wallet.change_24h >= 0 ? '+' : ''}{wallet.change_24h.toFixed(2)}%</span>
                          </div>
                        )}
                        
                        {/* 휴지통 아이콘 */}
                        <button
                          onClick={(e) => handleDeleteWallet(wallet.wallet_id, wallet.coin_type, e)}
                          disabled={deletingWalletId === wallet.wallet_id}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="지갑 삭제"
                        >
                          {deletingWalletId === wallet.wallet_id ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">보유량</p>
                        <p className="text-slate-200 font-semibold">
                          {wallet.balance.toLocaleString(undefined, { maximumFractionDigits: 8 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">평가액 (KRW)</p>
                        <p className="text-cyan-400 font-semibold">
                          ₩{valueKRW.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 코인 판매 요청 모달 */}
      {showCoinSaleRequest && (
        <CoinSaleRequest
          onClose={() => setShowCoinSaleRequest(false)}
          onSuccess={() => {
            fetchWallets();
          }}
        />
      )}
    </div>
  );
} 