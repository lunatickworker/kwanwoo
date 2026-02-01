import { useState, useEffect } from 'react';
import { Send, X, RefreshCw } from 'lucide-react';
import { supabase } from '../utils/supabase/client';
import { toast } from 'sonner@2.0.3';
import { useAuth } from '../contexts/AuthContext';

interface WalletInfo {
  wallet_id: string;
  coin_type: string;
  balance: number;
  price_krw?: number;
}

interface CoinSaleRequestProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CoinSaleRequest({ onClose, onSuccess }: CoinSaleRequestProps) {
  const { user } = useAuth();
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [requestNote, setRequestNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [centerId, setCenterId] = useState<string>('');

  useEffect(() => {
    fetchStoreWallets();
    fetchCenterId();
  }, []);

  const fetchStoreWallets = async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      
      // 가맹점 자신의 지갑만 조회 (하위 사용자 지갑 제외)
      const { data: walletsData, error } = await supabase
        .from('wallets')
        .select('wallet_id, coin_type, balance, address, wallet_type, created_at, user_id')
        .eq('user_id', user.id)  // 가맹점 자신만
        .gt('balance', 0)  // balance가 0보다 큰 것만
        .order('created_at', { ascending: false });

      console.log('조회된 지갑 (가맹점 자신, balance > 0):', walletsData);

      if (error) throw error;

      // 코인 가격 정보 조회
      const { data: tokensData } = await supabase
        .from('supported_tokens')
        .select('symbol, price_krw')
        .eq('is_active', true);

      const priceMap = new Map(tokensData?.map(t => [t.symbol, t.price_krw]) || []);

      const formattedWallets = walletsData?.map(w => ({
        ...w,
        price_krw: priceMap.get(w.coin_type)
      })) || [];

      console.log('포맷된 지갑:', formattedWallets);
      setWallets(formattedWallets);
    } catch (error: any) {
      console.error('지갑 조회 오류:', error);
      toast.error('지갑 정보를 가져오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCenterId = async () => {
    if (!user?.id) return;

    try {
      // 가맹점의 parent_user_id가 센터
      const { data: userData, error } = await supabase
        .from('users')
        .select('parent_user_id, tenant_id')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      // parent_user_id 우선, 없으면 tenant_id
      const cId = userData?.parent_user_id || userData?.tenant_id;
      if (cId) {
        setCenterId(cId);
      } else {
        toast.error('센터 정보를 찾을 수 없습니다');
      }
    } catch (error: any) {
      console.error('센터 정보 조회 오류:', error);
      toast.error('센터 정보를 가져오는데 실패했습니다');
    }
  };

  const selectedWalletData = wallets.find(w => w.wallet_id === selectedWallet);
  const maxAmount = selectedWalletData?.balance || 0;
  const krwValue = selectedWalletData?.price_krw
    ? parseFloat(amount || '0') * selectedWalletData.price_krw
    : 0;

  const handleQuickAmount = (percentage: number) => {
    if (!selectedWalletData) return;
    const quickAmount = (maxAmount * percentage).toFixed(8);
    setAmount(quickAmount);
  };

  const handleSubmit = async () => {
    if (!selectedWallet) {
      toast.error('지갑을 선택해주세요');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error('금액을 입력해주세요');
      return;
    }

    if (parseFloat(amount) > maxAmount) {
      toast.error('잔액이 부족합니다');
      return;
    }

    if (!centerId) {
      toast.error('센터 정보가 없습니다');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('store_coin_sales')
        .insert({
          store_id: user?.id,
          center_id: centerId,
          wallet_id: selectedWallet,  // ✅ 실제 지갑 ID 추가
          coin_type: selectedWalletData?.coin_type,
          amount: parseFloat(amount),
          krw_value: krwValue,
          status: 'pending',
          request_note: requestNote || null
        });

      if (error) throw error;

      // 센터에게 알림 전송
      await supabase
        .from('notifications')
        .insert({
          user_id: centerId,
          type: 'store_coin_sale',
          title: '💰 가맹점 코인 판매 요청',
          message: `${user?.username || '가맹점'}에서 ${selectedWalletData?.coin_type} ${parseFloat(amount).toLocaleString()} 판매를 요청했습니다.`,
          is_read: false,
          metadata: {
            store_id: user?.id,
            coin_type: selectedWalletData?.coin_type,
            amount: parseFloat(amount),
            krw_value: krwValue
          }
        });

      toast.success('코인 판매 요청이 전송되었습니다');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('요청 전송 오류:', error);
      toast.error(error.message || '요청 전송에 실패했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-slate-900/95 backdrop-blur-xl border border-cyan-500/30 rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-cyan-500/20">
          <div>
            <h3 className="text-xl text-cyan-400 font-semibold">코인 판매 요청</h3>
            <p className="text-sm text-slate-400 mt-1">센터에게 코인 판매를 요청합니다</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-6 space-y-4">
          {isLoading ? (
            <div className="text-center py-8 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              로딩 중...
            </div>
          ) : (
            <>
              {/* 지갑 선택 */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">지갑 선택</label>
                <select
                  value={selectedWallet}
                  onChange={(e) => {
                    setSelectedWallet(e.target.value);
                    setAmount('');
                  }}
                  className="w-full p-2.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500"
                  disabled={isSubmitting}
                >
                  <option value="">선택하세요</option>
                  {wallets.length > 0 ? (
                    wallets.map((wallet) => {
                      console.log('렌더링 지갑:', wallet);
                      return (
                        <option key={wallet.wallet_id} value={wallet.wallet_id}>
                          {wallet.coin_type} - 잔액: {wallet.balance?.toLocaleString(undefined, { maximumFractionDigits: 8 }) || '0'}
                        </option>
                      );
                    })
                  ) : (
                    <option disabled>지갑 없음</option>
                  )}
                </select>
                <div className="text-xs text-slate-500 mt-1">총 {wallets.length}개 지갑</div>
              </div>

              {/* 금액 입력 */}
              {selectedWallet && (
                <>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">판매 금액</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      step="0.00000001"
                      min="0"
                      max={maxAmount}
                      className="w-full p-2.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500"
                      disabled={isSubmitting}
                    />
                    <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                      <span>최대: {maxAmount.toLocaleString(undefined, { maximumFractionDigits: 8 })} {selectedWalletData?.coin_type}</span>
                      {krwValue > 0 && (
                        <span className="text-cyan-400">≈ ₩{krwValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      )}
                    </div>
                  </div>

                  {/* 금액 단축 버튼 */}
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => handleQuickAmount(0.25)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-cyan-500/50 text-slate-300 rounded-lg transition-colors text-sm"
                      disabled={isSubmitting}
                    >
                      25%
                    </button>
                    <button
                      onClick={() => handleQuickAmount(0.5)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-cyan-500/50 text-slate-300 rounded-lg transition-colors text-sm"
                      disabled={isSubmitting}
                    >
                      50%
                    </button>
                    <button
                      onClick={() => handleQuickAmount(0.75)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-cyan-500/50 text-slate-300 rounded-lg transition-colors text-sm"
                      disabled={isSubmitting}
                    >
                      75%
                    </button>
                    <button
                      onClick={() => handleQuickAmount(1)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-cyan-500/50 text-slate-300 rounded-lg transition-colors text-sm"
                      disabled={isSubmitting}
                    >
                      100%
                    </button>
                  </div>

                  {/* 메모 */}
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">메모 (선택사항)</label>
                    <textarea
                      value={requestNote}
                      onChange={(e) => setRequestNote(e.target.value)}
                      placeholder="요청 사항을 입력하세요..."
                      rows={3}
                      className="w-full p-2.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500 resize-none"
                      disabled={isSubmitting}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center gap-3 p-6 border-t border-cyan-500/20">
          <button
            onClick={onClose}
            className="flex-1 p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            disabled={isSubmitting}
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedWallet || !amount || parseFloat(amount) <= 0}
            className="flex-1 flex items-center justify-center gap-2 p-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>전송 중...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>판매 요청</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}