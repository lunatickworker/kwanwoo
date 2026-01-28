import { Check, X, Eye, Clock, AlertCircle } from "lucide-react";
import { NeonCard } from "./NeonCard";

export function WithdrawalManagement() {
  const pendingWithdrawals = [
    {
      id: "WD001",
      user: "user_1234",
      email: "user1234@example.com",
      coin: "BTC",
      amount: "0.5",
      fee: "0.0001",
      toAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      requestTime: "2024-11-11 14:30:22",
      status: "pending",
      kycStatus: "verified",
      dailyLimit: "0.8 / 1.0 BTC"
    },
    {
      id: "WD002",
      user: "user_5678",
      email: "user5678@example.com",
      coin: "ETH",
      amount: "10.0",
      fee: "0.005",
      toAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      requestTime: "2024-11-11 14:25:15",
      status: "pending",
      kycStatus: "verified",
      dailyLimit: "15 / 20 ETH"
    },
    {
      id: "WD003",
      user: "user_9012",
      email: "user9012@example.com",
      coin: "USDT",
      amount: "50,000",
      fee: "5",
      toAddress: "TJRyWwFs9wTFGZg3JbrVriFbNfCug5tDeC",
      requestTime: "2024-11-11 14:18:45",
      status: "pending",
      kycStatus: "pending",
      dailyLimit: "50,000 / 100,000 USDT"
    }
  ];

  const handleApprove = (id: string) => {
    console.log("Approve withdrawal:", id);
  };

  const handleReject = (id: string) => {
    console.log("Reject withdrawal:", id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-cyan-400 mb-1">출금 관리</h2>
          <p className="text-slate-400 text-sm">대기 중인 출금 요청을 승인하거나 거부합니다</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/30">
          <Clock className="w-4 h-4 text-amber-400" />
          <span className="text-amber-400 text-sm">{pendingWithdrawals.length}건 대기 중</span>
        </div>
      </div>

      <div className="space-y-4">
        {pendingWithdrawals.map((withdrawal) => (
          <NeonCard key={withdrawal.id}>
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <span className="text-purple-400">{withdrawal.coin}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-slate-200">{withdrawal.user}</p>
                      {withdrawal.kycStatus === "verified" ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                          KYC 인증
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          KYC 미인증
                        </span>
                      )}
                    </div>
                    <p className="text-slate-500 text-sm">{withdrawal.email}</p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-cyan-400 text-sm">ID: {withdrawal.id}</p>
                  <p className="text-slate-500 text-xs">{withdrawal.requestTime}</p>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
                <div>
                  <p className="text-slate-500 text-xs mb-1">출금 금액</p>
                  <p className="text-purple-400">{withdrawal.amount} {withdrawal.coin}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs mb-1">수수료</p>
                  <p className="text-slate-300">{withdrawal.fee} {withdrawal.coin}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs mb-1">실제 출금액</p>
                  <p className="text-green-400">{parseFloat(withdrawal.amount.replace(/,/g, '')) - parseFloat(withdrawal.fee.replace(/,/g, ''))} {withdrawal.coin}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs mb-1">일일 한도</p>
                  <p className="text-slate-300 text-sm">{withdrawal.dailyLimit}</p>
                </div>
              </div>

              {/* Address */}
              <div className="p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
                <p className="text-slate-500 text-xs mb-2">받는 주소</p>
                <div className="flex items-center justify-between">
                  <code className="text-cyan-400 text-sm break-all">{withdrawal.toAddress}</code>
                  <button className="ml-4 p-2 text-slate-400 hover:text-cyan-400 transition-colors">
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleApprove(withdrawal.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-all"
                >
                  <Check className="w-4 h-4" />
                  승인
                </button>
                <button
                  onClick={() => handleReject(withdrawal.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all"
                >
                  <X className="w-4 h-4" />
                  거부
                </button>
                <button className="px-4 py-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-all">
                  상세보기
                </button>
              </div>
            </div>
          </NeonCard>
        ))}
      </div>
    </div>
  );
}
