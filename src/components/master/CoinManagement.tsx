import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Save, X, Coins, TrendingUp, DollarSign, RefreshCw } from "lucide-react";
import { NeonCard } from "../NeonCard";
import { supabase } from "../../utils/supabase/client";
import { toast } from "sonner@2.0.3";

interface CoinData {
  symbol: string;
  name: string;
  contract_address: string;
  chain_id: number;
  decimals: number;
  icon_url?: string | null;
  is_active: boolean;
  price_krw?: number;
  price_usd?: number;
  change_24h?: number;
  volume_24h?: number;
  withdrawal_fee?: number;
  min_deposit?: number | null;
  min_withdrawal?: number | null;
  network?: string | null;
  rpc_url?: string | null;
  explorer_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface CoinWithPrice extends CoinData {
  live_krw_price?: number;
  live_usd_price?: number;
}

export function CoinManagement() {
  const [coins, setCoins] = useState<CoinWithPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCoin, setEditingCoin] = useState<CoinData | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newCoin, setNewCoin] = useState<Partial<CoinData>>({
    symbol: '',
    name: '',
    contract_address: '',
    chain_id: 8453, // Base
    decimals: 18,
    network: '',
    icon_url: '',
    rpc_url: '',
    is_active: true
  });

  useEffect(() => {
    loadCoins();
  }, []);

  const loadCoins = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('supported_tokens')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      console.log('🔍 DB에서 가져온 코인:', data);
      
      const coinsData = data || [];
      
      // 실시간 가격 조회
      await fetchLivePrices(coinsData);
    } catch (error) {
      console.error('코인 로드 실패:', error);
      toast.error('코인 목록을 불러오는데 실패했습니다');
      setCoins([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchLivePrices = async (coinsData: CoinData[]) => {
    console.log('💰 가격 조회 시작, 코인 개수:', coinsData.length);
    
    // 먼저 코인 목록은 표시
    setCoins(coinsData.map(coin => ({ ...coin, live_krw_price: 0, live_usd_price: 0 })));
    
    try {
      // CoinGecko API로 실시간 가격 조회
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,tether,dai&vs_currencies=usd,krw`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          },
          mode: 'cors'
        }
      );
      
      if (!response.ok) {
        console.warn('⚠️ 가격 조회 실패, 기본값 사용');
        return;
      }
      
      const prices = await response.json();
      console.log('📊 가져온 가격 정보:', prices);
      
      // 각 코인에 실시간 가격 추가
      const coinsWithPrices = coinsData.map(coin => {
        let livePrices = { live_krw_price: 0, live_usd_price: 0 };
        
        if (coin.symbol === 'USDC' && prices['usd-coin']) {
          livePrices = {
            live_krw_price: prices['usd-coin'].krw,
            live_usd_price: prices['usd-coin'].usd
          };
        } else if (coin.symbol === 'USDT' && prices['tether']) {
          livePrices = {
            live_krw_price: prices['tether'].krw,
            live_usd_price: prices['tether'].usd
          };
        } else if (coin.symbol === 'DAI' && prices['dai']) {
          livePrices = {
            live_krw_price: prices['dai'].krw,
            live_usd_price: prices['dai'].usd
          };
        } else if (coin.symbol === 'KRWQ') {
          // KRWQ는 1 KRWQ = 1000 KRW 고정
          livePrices = {
            live_krw_price: 1000,
            live_usd_price: 1000 / 1330
          };
        }
        
        return { ...coin, ...livePrices };
      });
      
      console.log('✅ 가격 적용 완료:', coinsWithPrices);
      setCoins(coinsWithPrices);
    } catch (error) {
      console.error('❌ 실시간 가격 조회 실패:', error);
      // 가격 조회 실패해도 코인 목록은 표시 (이미 위에서 setCoins 했음)
    }
  };

  const handleAddCoin = async () => {
    if (!newCoin.symbol || !newCoin.name || !newCoin.contract_address) {
      toast.error('필수 항목을 모두 입력해주세요');
      return;
    }

    try {
      const { error } = await supabase
        .from('supported_tokens')
        .insert([{
          ...newCoin,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);

      if (error) throw error;

      toast.success('코인이 추가되었습니다');
      setIsAddingNew(false);
      setNewCoin({
        symbol: '',
        name: '',
        contract_address: '',
        chain_id: 8453,
        decimals: 18,
        network: '',
        icon_url: '',
        rpc_url: '',
        is_active: true
      });
      loadCoins();
    } catch (error: any) {
      console.error('코인 추가 실패:', error);
      toast.error(error.message || '코인 추가에 실패했습니다');
    }
  };

  const handleUpdateCoin = async (coin: CoinData) => {
    try {
      const { error } = await supabase
        .from('supported_tokens')
        .update({
          name: coin.name,
          contract_address: coin.contract_address,
          chain_id: coin.chain_id,
          decimals: coin.decimals,
          network: coin.network,
          icon_url: coin.icon_url,
          rpc_url: coin.rpc_url,
          is_active: coin.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('symbol', coin.symbol);

      if (error) throw error;

      toast.success('코인 정보가 수정되었습니다');
      setEditingCoin(null);
      loadCoins();
    } catch (error: any) {
      console.error('코인 수정 실패:', error);
      toast.error(error.message || '코인 수정에 실패했습니다');
    }
  };

  const handleDeleteCoin = async (symbol: string) => {
    if (!confirm('정말 이 코인을 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('supported_tokens')
        .delete()
        .eq('symbol', symbol);

      if (error) throw error;

      toast.success('코인이 삭제되었습니다');
      loadCoins();
    } catch (error: any) {
      console.error('코인 삭제 실패:', error);
      toast.error(error.message || '코인 삭제에 실패했습니다');
    }
  };

  const handleToggleActive = async (coin: CoinData) => {
    try {
      const { error } = await supabase
        .from('supported_tokens')
        .update({ 
          is_active: !coin.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('symbol', coin.symbol);

      if (error) throw error;

      toast.success(`${coin.symbol} ${!coin.is_active ? '활성화' : '비활성화'} 완료`);
      loadCoins();
    } catch (error: any) {
      console.error('활성화 토글 실패:', error);
      toast.error(error.message || '상태 변경에 실패했습니다');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-cyan-400 mb-2">코인 관리</h2>
          <p className="text-slate-400 text-sm">지원 코인 설정 및 환율 관리</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadCoins}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </button>
          <button
            onClick={() => setIsAddingNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            코인 추가
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NeonCard>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <Coins className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <p className="text-slate-400 text-sm">전체 코인</p>
              <p className="text-white text-2xl">{coins.length}</p>
            </div>
          </div>
        </NeonCard>

        <NeonCard>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-slate-400 text-sm">활성 코인</p>
              <p className="text-white text-2xl">{coins.filter(c => c.is_active).length}</p>
            </div>
          </div>
        </NeonCard>

        <NeonCard>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-slate-400 text-sm">네트워크</p>
              <p className="text-white text-2xl">{new Set(coins.map(c => c.chain_id)).size}</p>
            </div>
          </div>
        </NeonCard>
      </div>

      {/* Add New Coin Form */}
      {isAddingNew && (
        <NeonCard>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-cyan-400">새 코인 추가</h3>
              <button
                onClick={() => setIsAddingNew(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-400 text-sm mb-2">심볼 *</label>
                <input
                  type="text"
                  value={newCoin.symbol}
                  onChange={(e) => setNewCoin({ ...newCoin, symbol: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  placeholder="KRWQ"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-2">이름 *</label>
                <input
                  type="text"
                  value={newCoin.name}
                  onChange={(e) => setNewCoin({ ...newCoin, name: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  placeholder="Korean Won Quantum"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-slate-400 text-sm mb-2">컨트랙트 주소 *</label>
                <input
                  type="text"
                  value={newCoin.contract_address}
                  onChange={(e) => setNewCoin({ ...newCoin, contract_address: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  placeholder="0x..."
                />
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-2">체인 ID</label>
                <input
                  type="number"
                  value={newCoin.chain_id}
                  onChange={(e) => setNewCoin({ ...newCoin, chain_id: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-2">Decimals</label>
                <input
                  type="number"
                  value={newCoin.decimals}
                  onChange={(e) => setNewCoin({ ...newCoin, decimals: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-2">네트워크</label>
                <input
                  type="text"
                  value={newCoin.network}
                  onChange={(e) => setNewCoin({ ...newCoin, network: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-2">아이콘 URL</label>
                <input
                  type="text"
                  value={newCoin.icon_url}
                  onChange={(e) => setNewCoin({ ...newCoin, icon_url: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-2">RPC URL</label>
                <input
                  type="text"
                  value={newCoin.rpc_url}
                  onChange={(e) => setNewCoin({ ...newCoin, rpc_url: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsAddingNew(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAddCoin}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" />
                저장
              </button>
            </div>
          </div>
        </NeonCard>
      )}

      {/* Coin List */}
      <NeonCard>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4 text-slate-400 text-sm">코인</th>
                <th className="text-left py-3 px-4 text-slate-400 text-sm">컨트랙트 주소</th>
                <th className="text-left py-3 px-4 text-slate-400 text-sm">체인</th>
                <th className="text-right py-3 px-4 text-slate-400 text-sm">KRW 가격</th>
                <th className="text-right py-3 px-4 text-slate-400 text-sm">USD 가격</th>
                <th className="text-center py-3 px-4 text-slate-400 text-sm">상태</th>
                <th className="text-center py-3 px-4 text-slate-400 text-sm">작업</th>
              </tr>
            </thead>
            <tbody>
              {coins.filter(coin => coin && coin.symbol).map((coin) => (
                <tr key={coin.symbol} className="border-b border-slate-700/50 hover:bg-slate-800/30">
                  {editingCoin?.symbol === coin.symbol ? (
                    <td colSpan={7} className="py-4 px-4">
                      <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-cyan-400">코인 수정: {coin.symbol}</h4>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleUpdateCoin(editingCoin)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 text-green-400 rounded-lg transition-all text-sm"
                            >
                              <Save className="w-4 h-4" />
                              저장
                            </button>
                            <button
                              onClick={() => setEditingCoin(null)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 rounded-lg transition-all text-sm"
                            >
                              <X className="w-4 h-4" />
                              취소
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-slate-400 text-sm mb-2">심볼 (수정 불가)</label>
                            <input
                              type="text"
                              value={editingCoin.symbol}
                              disabled
                              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-500 cursor-not-allowed"
                            />
                          </div>

                          <div>
                            <label className="block text-slate-400 text-sm mb-2">이름</label>
                            <input
                              type="text"
                              value={editingCoin.name}
                              onChange={(e) => setEditingCoin({ ...editingCoin, name: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-slate-400 text-sm mb-2">컨트랙트 주소</label>
                            <input
                              type="text"
                              value={editingCoin.contract_address}
                              onChange={(e) => setEditingCoin({ ...editingCoin, contract_address: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                            />
                          </div>

                          <div>
                            <label className="block text-slate-400 text-sm mb-2">체인 ID</label>
                            <input
                              type="number"
                              value={editingCoin.chain_id}
                              onChange={(e) => setEditingCoin({ ...editingCoin, chain_id: Number(e.target.value) })}
                              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                            />
                          </div>

                          <div>
                            <label className="block text-slate-400 text-sm mb-2">Decimals</label>
                            <input
                              type="number"
                              value={editingCoin.decimals}
                              onChange={(e) => setEditingCoin({ ...editingCoin, decimals: Number(e.target.value) })}
                              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                            />
                          </div>

                          <div>
                            <label className="block text-slate-400 text-sm mb-2">네트워크</label>
                            <input
                              type="text"
                              value={editingCoin.network || ''}
                              onChange={(e) => setEditingCoin({ ...editingCoin, network: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                              placeholder="예: Ethereum, Tron (TRC-20)"
                            />
                          </div>

                          <div>
                            <label className="block text-slate-400 text-sm mb-2">아이콘 URL</label>
                            <input
                              type="text"
                              value={editingCoin.icon_url || ''}
                              onChange={(e) => setEditingCoin({ ...editingCoin, icon_url: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                              placeholder="https://..."
                            />
                          </div>

                          <div>
                            <label className="block text-slate-400 text-sm mb-2">RPC URL</label>
                            <input
                              type="text"
                              value={editingCoin.rpc_url || ''}
                              onChange={(e) => setEditingCoin({ ...editingCoin, rpc_url: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                              placeholder="https://..."
                            />
                          </div>

                          <div>
                            <label className="block text-slate-400 text-sm mb-2">상태</label>
                            <button
                              onClick={() => setEditingCoin({ ...editingCoin, is_active: !editingCoin.is_active })}
                              className={`w-full px-4 py-2 rounded-lg text-sm transition-all ${
                                editingCoin.is_active
                                  ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                                  : 'bg-red-500/20 text-red-400 border border-red-500/50'
                              }`}
                            >
                              {editingCoin.is_active ? '✓ 활성' : '✗ 비활성'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {coin.icon_url ? (
                            <img 
                              src={coin.icon_url} 
                              alt={coin.symbol}
                              className="w-8 h-8 rounded-full"
                              onError={(e) => {
                                // 이미지 로드 실패 시 폴백
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <div className={`w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center ${coin.icon_url ? 'hidden' : ''}`}>
                            <span className="text-cyan-400 text-xs">{coin.symbol.substring(0, 2)}</span>
                          </div>
                          <div>
                            <p className="text-white">{coin.symbol}</p>
                            <p className="text-slate-500 text-xs">{coin.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-slate-400 text-sm font-mono">
                          {coin.contract_address.substring(0, 10)}...{coin.contract_address.substring(38)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-slate-400 text-sm">{coin.chain_id}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-white">₩{coin.live_krw_price?.toLocaleString() || 0}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-white">${coin.live_usd_price?.toFixed(2) || 0}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleActive(coin)}
                          className={`px-3 py-1 rounded-full text-xs ${
                            coin.is_active
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {coin.is_active ? '활성' : '비활성'}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setEditingCoin(coin)}
                            className="p-1 text-cyan-400 hover:text-cyan-300"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCoin(coin.symbol)}
                            className="p-1 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </NeonCard>
    </div>
  );
}