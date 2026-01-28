import { CheckCircle, Clock, XCircle, ExternalLink } from "lucide-react";
import { NeonCard } from "./NeonCard";

export function DepositManagement() {
  const deposits = [
    {
      id: "DP001",
      user: "user_1234",
      coin: "BTC",
      amount: "0.5",
      txHash: "3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3u4v5w6x7y8z9",
      confirmations: 6,
      requiredConfirmations: 3,
      status: "confirmed",
      timestamp: "2024-11-11 14:30:22",
      walletAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
    },
    {
      id: "DP002",
      user: "user_5678",
      coin: "ETH",
      amount: "2.3",
      txHash: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0d8b0c0e0f0g0h0i0j0k0l0m",
      confirmations: 2,
      requiredConfirmations: 12,
      status: "pending",
      timestamp: "2024-11-11 14:25:15",
      walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
    },
    {
      id: "DP003",
      user: "user_9012",
      coin: "USDT",
      amount: "10,000",
      txHash: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
      confirmations: 15,
      requiredConfirmations: 12,
      status: "confirmed",
      timestamp: "2024-11-11 14:18:45",
      walletAddress: "TJRyWwFs9wTFGZg3JbrVriFbNfCug5tDeC"
    },
    {
      id: "DP004",
      user: "user_3456",
      coin: "BTC",
      amount: "0.05",
      txHash: "9z8y7x6w5v4u3t2s1r0q9p8o7n6m5l4k3j2i1h0g9f8e7d6c5b4a3",
      confirmations: 0,
      requiredConfirmations: 3,
      status: "failed",
      timestamp: "2024-11-11 14:10:30",
      walletAddress: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "pending":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "failed":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed":
        return <CheckCircle className="w-4 h-4" />;
      case "pending":
        return <Clock className="w-4 h-4" />;
      case "failed":
        return <XCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "confirmed":
        return "완료";
      case "pending":
        return "확인 대기";
      case "failed":
        return "실패";
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-cyan-400 mb-1">입금 관리</h2>
        <p className="text-slate-400 text-sm">실시간 입금 트랜잭션 모니터링</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">확인 완료</p>
            <p className="text-green-400 text-2xl">2</p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">확인 대기</p>
            <p className="text-amber-400 text-2xl">1</p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500 to-pink-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">실패</p>
            <p className="text-red-400 text-2xl">1</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {deposits.map((deposit) => (
          <NeonCard key={deposit.id}>
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <span className="text-green-400">{deposit.coin}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-slate-200">{deposit.user}</p>
                      <span className={`px-3 py-1 rounded-full text-xs border flex items-center gap-1 ${getStatusColor(deposit.status)}`}>
                        {getStatusIcon(deposit.status)}
                        {getStatusText(deposit.status)}
                      </span>
                    </div>
                    <p className="text-slate-500 text-sm">{deposit.timestamp}</p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-green-400">+{deposit.amount} {deposit.coin}</p>
                  <p className="text-slate-500 text-xs">ID: {deposit.id}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
                <div>
                  <p className="text-slate-500 text-xs mb-1">지갑 주소</p>
                  <code className="text-cyan-400 text-xs break-all">{deposit.walletAddress}</code>
                </div>
                <div>
                  <p className="text-slate-500 text-xs mb-1">확인 상태</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          deposit.confirmations >= deposit.requiredConfirmations
                            ? "bg-gradient-to-r from-green-500 to-emerald-500"
                            : deposit.status === "failed"
                            ? "bg-gradient-to-r from-red-500 to-pink-500"
                            : "bg-gradient-to-r from-amber-500 to-orange-500"
                        }`}
                        style={{
                          width: `${Math.min((deposit.confirmations / deposit.requiredConfirmations) * 100, 100)}%`
                        }}
                      ></div>
                    </div>
                    <span className="text-slate-400 text-xs whitespace-nowrap">
                      {deposit.confirmations}/{deposit.requiredConfirmations}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-500 text-xs mb-1">트랜잭션 해시</p>
                    <code className="text-cyan-400 text-xs break-all">{deposit.txHash}</code>
                  </div>
                  <button className="ml-4 p-2 text-slate-400 hover:text-cyan-400 transition-colors">
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </NeonCard>
        ))}
      </div>
    </div>
  );
}
