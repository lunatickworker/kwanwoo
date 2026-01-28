import { Search, UserCheck, UserX, Lock, Unlock, Shield } from "lucide-react";
import { NeonCard } from "./NeonCard";
import { useState, useEffect } from "react";
import { supabase } from "../utils/supabase/client";

interface UserData {
  user_id: string;
  username: string;
  email: string;
  kyc_status: string;
  status: string;
  created_at: string;
  last_login: string;
}

export function UserManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    verified: 0,
    pending: 0,
    frozen: 0
  });

  useEffect(() => {
    fetchUsers();
    fetchStats();
  }, []);

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setUsers(data);
    }
    setIsLoading(false);
  };

  const fetchStats = async () => {
    const { count: total } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    const { count: verified } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('kyc_status', 'verified');

    const { count: pending } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('kyc_status', 'pending');

    const { count: frozen } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'suspended');

    setStats({
      total: total || 0,
      verified: verified || 0,
      pending: pending || 0,
      frozen: frozen || 0
    });
  };

  const handleFreezeWallet = async (userId: string) => {
    const { error } = await supabase
      .from('users')
      .update({ status: 'suspended' })
      .eq('user_id', userId);

    if (!error) {
      fetchUsers();
      fetchStats();
    }
  };

  const handleUnfreezeWallet = async (userId: string) => {
    const { error } = await supabase
      .from('users')
      .update({ status: 'active' })
      .eq('user_id', userId);

    if (!error) {
      fetchUsers();
      fetchStats();
    }
  };

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.user_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-cyan-400 mb-1">사용자 관리</h2>
          <p className="text-slate-400 text-sm">사용자 계정 및 지갑 상태 관리</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="사용자 ID, 이메일, 이름으로 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-slate-900/50 border border-cyan-500/30 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">전체 사용자</p>
            <p className="text-cyan-400 text-2xl">{stats.total}</p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">KYC 인증</p>
            <p className="text-green-400 text-2xl">{stats.verified}</p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">KYC 대기</p>
            <p className="text-amber-400 text-2xl">{stats.pending}</p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500 to-pink-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">동결된 지갑</p>
            <p className="text-red-400 text-2xl">{stats.frozen}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredUsers.map((user) => (
          <NeonCard key={user.user_id}>
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div 
                    className="w-12 h-12 rounded-full bg-slate-800 border-2 border-cyan-500 flex items-center justify-center"
                    style={{ boxShadow: '0 0 15px rgba(6, 182, 212, 0.6), inset 0 0 15px rgba(6, 182, 212, 0.2)' }}
                  >
                    <span className="text-cyan-400" style={{ filter: 'drop-shadow(0 0 2px rgba(6, 182, 212, 1))' }}>{user.username[0]}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-slate-200">{user.username}</p>
                      {user.kyc_status === "verified" && (
                        <Shield className="w-4 h-4 text-green-400" />
                      )}
                    </div>
                    <p className="text-slate-400 text-sm">{user.email}</p>
                    <p className="text-slate-500 text-xs">ID: {user.user_id}</p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-cyan-400">총 보유액</p>
                  <p className="text-slate-500 text-xs">미구현</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
                <div>
                  <p className="text-slate-500 text-xs mb-1">KYC 상태</p>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${
                    user.kyc_status === "verified"
                      ? "bg-green-500/20 text-green-400 border-green-500/30"
                      : user.kyc_status === "pending"
                      ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                      : "bg-red-500/20 text-red-400 border-red-500/30"
                  }`}>
                    {user.kyc_status === "verified" ? (
                      <>
                        <UserCheck className="w-3 h-3" />
                        인증됨
                      </>
                    ) : user.kyc_status === "pending" ? (
                      "대기중"
                    ) : (
                      <>
                        <UserX className="w-3 h-3" />
                        거부됨
                      </>
                    )}
                  </span>
                </div>

                <div>
                  <p className="text-slate-500 text-xs mb-1">지갑 상태</p>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${
                    user.status === "active"
                      ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
                      : "bg-red-500/20 text-red-400 border-red-500/30"
                  }`}>
                    {user.status === "active" ? (
                      <>
                        <Unlock className="w-3 h-3" />
                        활성
                      </>
                    ) : (
                      <>
                        <Lock className="w-3 h-3" />
                        동결
                      </>
                    )}
                  </span>
                </div>

                <div>
                  <p className="text-slate-500 text-xs mb-1">가입일</p>
                  <p className="text-slate-300 text-sm">{user.created_at}</p>
                </div>

                <div>
                  <p className="text-slate-500 text-xs mb-1">마지막 로그인</p>
                  <p className="text-slate-300 text-sm">{user.last_login}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-all text-sm">
                  상세보기
                </button>
                
                {user.status === "active" ? (
                  <button
                    onClick={() => handleFreezeWallet(user.user_id)}
                    className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all text-sm flex items-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    지갑 동결
                  </button>
                ) : (
                  <button
                    onClick={() => handleUnfreezeWallet(user.user_id)}
                    className="px-4 py-2 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-all text-sm flex items-center gap-2"
                  >
                    <Unlock className="w-4 h-4" />
                    동결 해제
                  </button>
                )}

                <button className="px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-all text-sm">
                  출금 한도 설정
                </button>
              </div>
            </div>
          </NeonCard>
        ))}
      </div>
    </div>
  );
}