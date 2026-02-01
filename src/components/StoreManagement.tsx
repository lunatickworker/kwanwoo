import { useState, useEffect } from "react";
import { Users, Mail, Lock, Search, Plus, Edit2, Trash2, Check, X, AlertCircle, Eye, EyeOff, History, Clock } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../utils/supabase/client";
import { checkEmailAvailability } from "../utils/api/check-email";
import { toast } from "sonner@2.0.3";
import { recordFeeRateChange, getFeeRateHistory } from "../utils/api/fee-rate-history";
import { EditStoreModal } from "./center/EditStoreModal";
import bcrypt from 'bcryptjs';

interface StoreData {
  user_id: string;
  username: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  parent_user_id: string | null;
  tenant_id: string | null;
  fee_rate: number;
}

export function StoreManagement() {
  const { user } = useAuth();
  const [stores, setStores] = useState<StoreData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null);
  
  // 생성 폼 상태
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: ""
  });

  // 수정 폼 상태
  const [editFormData, setEditFormData] = useState({
    username: "",
    password: ""
  });

  useEffect(() => {
    if (user) {
      fetchStores();
    }
  }, [user]);

  const fetchStores = async () => {
    setIsLoading(true);
    try {
      console.log('🏪 Fetching stores for center:', user?.id);
      
      // 현재 센터의 가맹점 조회 (users 테이블)
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'store')
        .eq('parent_user_id', user?.id)
        .order('created_at', { ascending: false });

      if (userError) {
        console.error('❌ Error fetching stores:', userError);
        toast.error('가맹점 데이터를 가져오는데 실패했습니다');
        return;
      }

      // stores 테이블에서 수수료율 정보 조회
      const userIds = userData?.map(u => u.user_id) || [];
      const { data: storesData, error: storesError } = await supabase
        .from('stores')
        .select('user_id, commission_rate')
        .in('user_id', userIds);

      if (storesError) {
        console.error('❌ Error fetching fee rates:', storesError);
      }

      // fee_rate 맵 생성
      const feeRateMap = new Map();
      storesData?.forEach(store => {
        feeRateMap.set(store.user_id, store.commission_rate);
      });

      // userData와 feeRate 병합
      const mergedData = userData?.map(user => ({
        ...user,
        fee_rate: feeRateMap.get(user.user_id) || 0
      })) || [];

      console.log('✅ Stores loaded:', mergedData.length);
      setStores(mergedData);
    } catch (error) {
      console.error('❌ Error:', error);
      toast.error('가맹점 데이터를 가져오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username || !formData.email || !formData.password) {
      toast.error('모든 필드를 입력해주세요');
      return;
    }

    try {
      // 이메일 중복 확인
      const isEmailAvailable = await checkEmailAvailability(formData.email);
      if (!isEmailAvailable) {
        toast.error('이미 존재하는 이메일입니다');
        return;
      }

      console.log('📝 Creating store account...');

      // 비밀번호 해시 생성
      const passwordHash = await bcrypt.hash(formData.password, 10);
      const referralCode = formData.email.split('@')[0].toLowerCase();

      // UUID 생성
      const userId = crypto.randomUUID();
      
      console.log('📝 Inserting user data with password_hash...', userId);
      
      // Users 테이블에 먼저 생성
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          user_id: userId,
          username: formData.username,
          email: formData.email,
          password_hash: passwordHash,
          referral_code: referralCode,
          role: 'store',
          status: 'active',
          parent_user_id: user?.id,
          tenant_id: user?.id,
          is_active: true,
          kyc_status: 'pending',
          balance: {},
          fee_rate: 5,
        });

      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }

      console.log('✅ Store created in DB successfully');
      
      toast.success('가맹점이 생성되었습니다');
      setFormData({ username: "", email: "", password: "" });
      setShowCreateModal(false);
      fetchStores();
      
    } catch (error: any) {
      console.error('❌ Create store error:', error);
      
      if (error.message.includes('invalid email') || error.message.includes('invalid')) {
        toast.error('유효하지 않은 이메일 형식입니다. 실제 도메인을 사용해주세요 (예: @gmail.com, @naver.com)');
      } else if (error.message.includes('already registered') || error.code === '23505') {
        toast.error('이미 존재하는 이메일입니다');
      } else {
        toast.error(error.message || '가맹점 생성 중 오류가 발생했습니다');
      }
    }
  };

  const handleStatusChange = async (storeId: string, newStatus: string) => {
    const { error } = await supabase
      .from('users')
      .update({ status: newStatus })
      .eq('user_id', storeId);

    if (error) {
      toast.error('상태 변경 실패');
      console.error('Status change error:', error);
      return;
    }

    toast.success(`가맹점 상태가 ${newStatus === 'active' ? '활성' : '비활성'}로 변경되었습니다`);
    fetchStores();
  };

  const handleDeleteStore = async (storeId: string) => {
    if (!confirm('정말로 이 가맹점을 삭제하시겠습니까?')) {
      return;
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('user_id', storeId);

    if (error) {
      toast.error('가맹점 삭제 실패');
      console.error('Delete error:', error);
      return;
    }

    toast.success('가맹점이 삭제되었습니다');
    fetchStores();
  };

  const handleEditStore = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedStore || !editFormData.username) {
      toast.error('가맹점명을 입력해주세요');
      return;
    }

    try {
      const updateData: any = {
        username: editFormData.username,
      };

      // 비밀번호 변경 시 - Backend API 사용
      if (editFormData.password) {
        updateData.password_hash = editFormData.password;
        
        // Backend API로 Auth 비밀번호 업데이트
        try {
          const backendUrl = 'https://mzoeeqmtvlnyonicycvg.supabase.co/functions/v1/make-server-b6d5667f';
          const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16b2VlcW10dmxueW9uaWN5Y3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MjIyNzcsImV4cCI6MjA3ODQ5ODI3N30.oo7FsWjthtBtM-Xa1VFJieMGQ4mG__V8w7r9qGBPzaI';
          
          const response = await fetch(`${backendUrl}/api/auth/change-password`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${anonKey}`
            },
            body: JSON.stringify({
              user_id: selectedStore.user_id,
              new_password: editFormData.password
            })
          });

          if (!response.ok) {
            console.error('Auth 비밀번호 변경 실패');
            // Auth 업데이트 실패해도 계속 진행
          }
        } catch (authErr) {
          console.error('Auth 업데이트 오류:', authErr);
          // 오류가 발생해도 계속 진행
        }
      }

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('user_id', selectedStore.user_id);

      if (error) throw error;

      toast.success('가맹점 정보가 수정되었습니다');
      setShowEditModal(false);
      setSelectedStore(null);
      setEditFormData({ username: "", password: "" });
      fetchStores();
    } catch (error: any) {
      console.error('❌ Error:', error);
      toast.error(error.message || '가맹점 정보 수정 실패');
    }
  };

  const openEditModal = (store: StoreData) => {
    setSelectedStore(store);
    setShowEditModal(true);
  };

  const filteredStores = stores.filter(store => 
    store.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    store.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400 bg-green-500/20 border-green-500/50';
      case 'pending': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
      case 'suspended': return 'text-orange-400 bg-orange-500/20 border-orange-500/50';
      case 'blocked': return 'text-red-400 bg-red-500/20 border-red-500/50';
      default: return 'text-slate-400 bg-slate-500/20 border-slate-500/50';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return '등록';
      case 'pending': return '승인대기';
      case 'suspended': return '정지';
      case 'blocked': return '차단';
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-cyan-500/20 border border-cyan-500/50 rounded-lg">
            <Users className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-cyan-400 text-xl">가맹점 관리</h2>
            <p className="text-slate-400 text-sm">센터 소속 가맹점을 관리합니다</p>
          </div>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg transition-all duration-300 shadow-lg shadow-cyan-500/30"
        >
          <Plus className="w-5 h-5" />
          가맹점 추가
        </button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">전체 가맹점</p>
            <p className="text-cyan-400 text-2xl">{stores.length}</p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">활성 가맹점</p>
            <p className="text-green-400 text-2xl">{stores.filter(s => s.status === 'active').length}</p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500 to-pink-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">비활성 가맹점</p>
            <p className="text-red-400 text-2xl">{stores.filter(s => s.status !== 'active').length}</p>
          </div>
        </div>
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="가맹점명 또는 이메일 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
        />
      </div>

      {/* 가맹점 목록 */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-cyan-500 border-t-transparent"></div>
          </div>
        ) : filteredStores.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <Users className="w-16 h-16 mb-4 opacity-50" />
            <p>등록된 가맹점이 없습니다</p>
            <p className="text-sm mt-2">우측 상단의 "가맹점 추가" 버튼을 클릭하여 가맹점을 등록하세요</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="px-6 py-4 text-left text-slate-400 text-sm">가맹점명</th>
                  <th className="px-6 py-4 text-left text-slate-400 text-sm">이메일</th>
                  <th className="px-6 py-4 text-left text-slate-400 text-sm">상태</th>
                  <th className="px-6 py-4 text-left text-slate-400 text-sm">적용 요율</th>
                  <th className="px-6 py-4 text-left text-slate-400 text-sm">가입일</th>
                  <th className="px-6 py-4 text-right text-slate-400 text-sm">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredStores.map((store) => (
                  <tr key={store.user_id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center">
                          <Users className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-slate-300">{store.username}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400">{store.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs border ${getStatusColor(store.status)}`}>
                        {getStatusText(store.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-cyan-400 font-medium">
                        {store.fee_rate || 0}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-sm">
                      {new Date(store.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {store.status === 'pending' && (
                          <button
                            onClick={() => handleStatusChange(store.user_id, 'active')}
                            className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 text-green-400 rounded-lg transition-all text-sm flex items-center gap-1.5"
                            title="승인"
                          >
                            <Check className="w-4 h-4" />
                            승인
                          </button>
                        )}
                        <button
                          onClick={() => openEditModal(store)}
                          className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors text-slate-400 hover:text-cyan-400"
                          title="수정"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {store.status !== 'pending' && (
                          <button
                            onClick={() => handleStatusChange(store.user_id, store.status === 'active' ? 'suspended' : 'active')}
                            className={`p-2 hover:bg-slate-700/50 rounded-lg transition-colors ${
                              store.status === 'active' ? 'text-yellow-400 hover:text-yellow-300' : 'text-green-400 hover:text-green-300'
                            }`}
                            title={store.status === 'active' ? '비활성화' : '활성화'}
                          >
                            {store.status === 'active' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteStore(store.user_id)}
                          className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors text-red-400 hover:text-red-300"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 가맹점 생성 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-slate-900 border border-cyan-500/30 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl text-cyan-400 mb-6">새 가맹점 추가</h3>
            
            <form onSubmit={handleCreateStore} className="space-y-4">
              <div>
                <label className="block text-slate-400 text-sm mb-2">가맹점명</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500"
                  placeholder="예: 강남점"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-2">이메일</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500"
                  placeholder="store@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-2">비밀번호</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500"
                  placeholder="8자 이상"
                  required
                  minLength={8}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormData({ username: "", email: "", password: "" });
                  }}
                  className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg transition-all shadow-lg shadow-cyan-500/30"
                >
                  생성
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 가맹점 수정 모달 */}
      {showEditModal && selectedStore && (
        <EditStoreModal
          store={selectedStore}
          onClose={() => {
            setShowEditModal(false);
            setSelectedStore(null);
          }}
          onSuccess={fetchStores}
        />
      )}
    </div>
  );
}