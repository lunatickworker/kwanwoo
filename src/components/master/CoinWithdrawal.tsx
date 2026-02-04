import { useState, useEffect } from 'react';
import { ArrowUpRight, Send, AlertCircle, Loader2, Check, X } from 'lucide-react';
import { NeonCard } from '../NeonCard';
import { supabase } from '../../utils/supabase/client';
import { toast } from 'sonner@2.0.3';
import { useAuth } from '../../contexts/AuthContext';
import { executeWithdrawal } from '../../utils/withdrawalHelper';

interface WalletInfo {
  wallet_id: string;
  coin_type: string;
  balance: number;
  address: string;
  wallet_type: 'hot' | 'cold';
  icon_url?: string;
  price_krw?: number;
}

interface WithdrawalRequest {
  id: string;
  coin_type: string;
  amount: number;
  gas_fee: number;
  from_address: string;
  to_address: string;
  tx_hash: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  completed_at: string | null;
}

export function CoinWithdrawal() {
  const { user } = useAuth();
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWallet, setSelectedWallet] = useState<WalletInfo | null>(null);
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [gasFee, setGasFee] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchWallets();
    fetchWithdrawalRequests();

    // 실시간 출금 요청 모니터링
    const channel = supabase
      .channel(`master-withdrawals-${user?.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_coin_withdrawals',
          filter: `admin_id=eq.${user?.id}`
        },
        (payload) => {
          console.log('출금 요청 변경 감지:', payload);
          fetchWithdrawalRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const fetchWallets = async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      const { data: walletsData, error: walletsError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (walletsError) throw walletsError;

      const { data: tokensData } = await supabase
        .from('supported_tokens')
        .select('symbol, icon_url, price_krw')
        .eq('is_active', true);

      const tokensMap = new Map(
        tokensData?.map(token => [token.symbol, token]) || []
      );

      const formattedWallets = walletsData?.map((w: any) => ({
        wallet_id: w.wallet_id,
        coin_type: w.coin_type,
        balance: w.balance,
        address: w.address,
        wallet_type: w.wallet_type,
        icon_url: tokensMap.get(w.coin_type)?.icon_url,
        price_krw: tokensMap.get(w.coin_type)?.price_krw
      })) || [];

      setWallets(formattedWallets);
    } catch (error) {
      console.error('지갑 조회 오류:', error);
      toast.error('지갑 정보를 가져오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWithdrawalRequests = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('admin_coin_withdrawals')
        .select('*')
        .eq('admin_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setWithdrawalRequests(data || []);
    } catch (error) {
      console.error('출금 요청 조회 오류:', error);
    }
  };

  const calculateGasFee = (coinType: string) => {
    // 코인별 기본 가스비 설정
    const gasFeesMap: { [key: string]: number } = {
      'USDT': 30000,
      'USDC': 30000,
      'TRX': 8,
      'BTC': 0.001,
      'ETH': 0.01,
    };
    return gasFeesMap[coinType] || 50000;
  };

  const handleSelectWallet = (wallet: WalletInfo) => {
    setSelectedWallet(wallet);
    setGasFee(calculateGasFee(wallet.coin_type));
    setShowForm(true);
  };

  const handleSubmitWithdrawal = async () => {
    if (!selectedWallet || !toAddress || !amount) {
      toast.error('모든 필드를 입력해주세요');
      return;
    }

    const withdrawAmount = parseFloat(amount);
    if (withdrawAmount <= 0 || withdrawAmount > selectedWallet.balance) {
      toast.error('유효하지 않은 출금액입니다');
      return;
    }

    if (!toAddress.match(/^[a-zA-Z0-9]{20,}$/)) {
      toast.error('유효한 지갑 주소를 입력해주세요');
      return;
    }

    setIsSubmitting(true);

    try {
      console.log('🔄 관리자 출금 시작:', {
        walletId: selectedWallet.wallet_id,
        coinType: selectedWallet.coin_type,
        amount: withdrawAmount,
        toAddress,
        gasFee
      });

      // 통합 출금 함수 사용
      const result = await executeWithdrawal({
        withdrawalType: 'admin',
        adminId: user?.id!,
        adminRole: 'master',
        walletId: selectedWallet.wallet_id,
        coinType: selectedWallet.coin_type,
        amount: withdrawAmount,
        toAddress
      });

      if (!result.success) {
        toast.error(result.error || '출금 처리 중 오류가 발생했습니다');
        return;
      }

      // 성공
      toast.success(`✅ 출금 완료!\nTX: ${result.txHash?.substring(0, 10)}...`);

      // UI 초기화
      setToAddress('');
      setAmount('');
      setShowForm(false);
      setSelectedWallet(null);

      // 목록 갱신
      fetchWallets();
      fetchWithdrawalRequests();

    } catch (error: any) {
      console.error('출금 처리 오류:', error);
      toast.error(error.message || '출금 요청 중 오류가 발생했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400';
      case 'processing':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
      case 'completed':
        return 'bg-green-500/10 border-green-500/30 text-green-400';
      case 'failed':
        return 'bg-red-500/10 border-red-500/30 text-red-400';
      default:
        return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return '대기중';
      case 'processing':
        return '처리중';
      case 'completed':
        return '완료';
      case 'failed':
        return '실패';
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* 지갑 목록 */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
          <ArrowUpRight className="w-6 h-6 text-cyan-400" />
          코인 출금
        </h2>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          </div>
        ) : wallets.length === 0 ? (
          <NeonCard>
            <div className="text-center py-8 text-slate-400">
              보유한 지갑이 없습니다
            </div>
          </NeonCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {wallets.map((wallet) => (
              <NeonCard key={wallet.wallet_id}>
                <div className="p-4">
                  {/* 헤더 */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {wallet.icon_url && (
                        <img src={wallet.icon_url} alt={wallet.coin_type} className="w-6 h-6 rounded-full" />
                      )}
                      <div>
                        <p className="font-semibold text-white text-sm">{wallet.coin_type}</p>
                        <p className="text-xs text-slate-400">{wallet.wallet_type === 'hot' ? '핫 월렛' : '콜드 월렛'}</p>
                      </div>
                    </div>
                  </div>

                  {/* 잔액 */}
                  <div className="mb-4">
                    <p className="text-xs text-slate-400 mb-1">잔액</p>
                    <p className="text-xl font-bold text-cyan-400">{wallet.balance.toFixed(8)}</p>
                    {wallet.price_krw && (
                      <p className="text-xs text-slate-400">₩ {(wallet.balance * wallet.price_krw).toLocaleString()}</p>
                    )}
                  </div>

                  {/* 주소 */}
                  <div className="mb-4 p-2 bg-slate-800/50 rounded text-xs break-all text-slate-300">
                    {wallet.address}
                  </div>

                  {/* 출금 버튼 */}
                  <button
                    onClick={() => handleSelectWallet(wallet)}
                    className="w-full px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg text-sm font-semibold hover:shadow-lg hover:shadow-cyan-500/50 transition-all duration-300"
                  >
                    <Send className="w-4 h-4 inline mr-2" />
                    출금
                  </button>
                </div>
              </NeonCard>
            ))}
          </div>
        )}
      </div>

      {/* 출금 폼 */}
      {showForm && selectedWallet && (
        <NeonCard className="bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">
                {selectedWallet.coin_type} 출금
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 출금 주소 */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  수신 지갑 주소
                </label>
                <input
                  type="text"
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  placeholder="지갑 주소 입력"
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              {/* 출금액 */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  출금액
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="출금액 입력"
                    className="flex-1 px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                  <button
                    onClick={() => setAmount(selectedWallet.balance.toString())}
                    className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-semibold transition-colors"
                  >
                    전액
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  보유: {selectedWallet.balance.toFixed(8)} {selectedWallet.coin_type}
                </p>
              </div>

              {/* 가스비 */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  가스비
                </label>
                <p className="text-lg font-semibold text-slate-200">
                  {gasFee.toFixed(8)} {selectedWallet.coin_type}
                </p>
              </div>

              {/* 경고 */}
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-300">
                  출금은 취소할 수 없습니다. 주소를 다시 한 번 확인해주세요.
                </p>
              </div>

              {/* 버튼 */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSubmitWithdrawal}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      처리중...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      출금 요청
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </NeonCard>
      )}

      {/* 출금 이력 */}
      {withdrawalRequests.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-white mb-4">최근 출금 요청</h3>
          <div className="space-y-2">
            {withdrawalRequests.map((request) => (
              <NeonCard key={request.id}>
                <div className="p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="font-semibold text-white">{request.coin_type}</p>
                      <span className={`px-2 py-1 rounded text-xs font-semibold border ${getStatusColor(request.status)}`}>
                        {getStatusLabel(request.status)}
                      </span>
                    </div>
                    <div className="text-sm text-slate-400 space-y-1">
                      <p>수량: {request.amount.toFixed(8)}</p>
                      <p>수신 주소: {request.to_address.substring(0, 20)}...</p>
                      {request.tx_hash && <p>Tx: {request.tx_hash.substring(0, 20)}...</p>}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    {new Date(request.created_at).toLocaleDateString('ko-KR')}
                  </div>
                </div>
              </NeonCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
