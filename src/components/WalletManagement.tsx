import { Wallet, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { NeonCard } from "./NeonCard";

export function WalletManagement() {
  const wallets = [
    {
      type: "Hot Wallet",
      coin: "BTC",
      balance: "15.5",
      fiatValue: "₩1,550,000,000",
      percentage: 12,
      status: "active",
      dailyInflow: "+2.3 BTC",
      dailyOutflow: "-1.8 BTC",
      threshold: "20 BTC",
      color: "from-orange-500 to-red-500"
    },
    {
      type: "Cold Wallet",
      coin: "BTC",
      balance: "120.8",
      fiatValue: "₩12,080,000,000",
      percentage: 88,
      status: "active",
      dailyInflow: "+0.0 BTC",
      dailyOutflow: "-0.0 BTC",
      threshold: "100 BTC",
      color: "from-cyan-500 to-blue-500"
    },
    {
      type: "Hot Wallet",
      coin: "ETH",
      balance: "450.2",
      fiatValue: "₩1,800,800,000",
      percentage: 15,
      status: "active",
      dailyInflow: "+50.5 ETH",
      dailyOutflow: "-35.2 ETH",
      threshold: "500 ETH",
      color: "from-orange-500 to-red-500"
    },
    {
      type: "Cold Wallet",
      coin: "ETH",
      balance: "2,550.8",
      fiatValue: "₩10,203,200,000",
      percentage: 85,
      status: "active",
      dailyInflow: "+0.0 ETH",
      dailyOutflow: "-0.0 ETH",
      threshold: "2000 ETH",
      color: "from-cyan-500 to-blue-500"
    },
    {
      type: "Hot Wallet",
      coin: "USDT",
      balance: "5,450,000",
      fiatValue: "₩7,085,000,000",
      percentage: 18,
      status: "warning",
      dailyInflow: "+850,000 USDT",
      dailyOutflow: "-650,000 USDT",
      threshold: "5,000,000 USDT",
      color: "from-orange-500 to-red-500"
    },
    {
      type: "Cold Wallet",
      coin: "USDT",
      balance: "24,550,000",
      fiatValue: "₩31,915,000,000",
      percentage: 82,
      status: "active",
      dailyInflow: "+0 USDT",
      dailyOutflow: "-0 USDT",
      threshold: "20,000,000 USDT",
      color: "from-cyan-500 to-blue-500"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-cyan-400 mb-1">지갑 관리</h2>
          <p className="text-slate-400 text-sm">Hot/Cold 지갑 분리 및 자산 현황</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-all">
          <RefreshCw className="w-4 h-4" />
          새로고침
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">Hot Wallet 총액</p>
            <p className="text-orange-400 text-2xl">₩10.4B</p>
            <p className="text-slate-500 text-xs mt-1">전체의 15%</p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">Cold Wallet 총액</p>
            <p className="text-cyan-400 text-2xl">₩54.2B</p>
            <p className="text-slate-500 text-xs mt-1">전체의 85%</p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">총 자산</p>
            <p className="text-purple-400 text-2xl">₩64.6B</p>
            <p className="text-green-400 text-xs mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +5.2% (24h)
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {wallets.map((wallet, index) => (
          <NeonCard key={index}>
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${wallet.color} flex items-center justify-center shadow-lg`}>
                    <Wallet className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-slate-200">{wallet.type}</p>
                      {wallet.status === "warning" && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          임계값 근접
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-sm">{wallet.coin}</p>
                  </div>
                </div>

                <div className="text-right">
                  <p className={`text-lg ${wallet.type === "Hot Wallet" ? "text-orange-400" : "text-cyan-400"}`}>
                    {wallet.balance} {wallet.coin}
                  </p>
                  <p className="text-slate-500 text-xs">{wallet.fiatValue}</p>
                </div>
              </div>

              <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 bg-gradient-to-r ${wallet.color} rounded-full shadow-lg`}
                  style={{ width: `${wallet.percentage}%` }}
                ></div>
              </div>

              <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
                <div>
                  <p className="text-slate-500 text-xs mb-1">일일 유입</p>
                  <p className="text-green-400 text-sm flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {wallet.dailyInflow}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs mb-1">일일 유출</p>
                  <p className="text-purple-400 text-sm flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" />
                    {wallet.dailyOutflow}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs mb-1">임계값</p>
                  <p className="text-slate-300 text-sm">{wallet.threshold}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button className="flex-1 px-3 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-all text-sm">
                  주소 보기
                </button>
                {wallet.type === "Hot Wallet" && (
                  <button className="flex-1 px-3 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30 transition-all text-sm">
                    Cold로 이동
                  </button>
                )}
              </div>
            </div>
          </NeonCard>
        ))}
      </div>

      <NeonCard>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
            <h3 className="text-slate-200">보안 알림</h3>
          </div>
          
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <p className="text-amber-400 text-sm">⚠️ USDT Hot Wallet이 설정된 임계값(5,000,000 USDT)에 근접했습니다.</p>
            <p className="text-slate-400 text-xs mt-1">Cold Wallet으로 자산 이동을 권장합니다.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
              <p className="text-slate-500 text-xs mb-1">권장 Hot Wallet 비율</p>
              <p className="text-cyan-400">10-20% of total</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
              <p className="text-slate-500 text-xs mb-1">현재 Hot Wallet 비율</p>
              <p className="text-green-400">15% of total</p>
            </div>
          </div>
        </div>
      </NeonCard>
    </div>
  );
}
