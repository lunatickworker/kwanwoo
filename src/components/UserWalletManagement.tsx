import { Search, UserCheck, UserX, Lock, Wallet, Plus, Loader2, Copy, Check, Shield, Activity, TrendingUp, Coins, ChevronLeft, ChevronRight, Trash2, UserPlus } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "../utils/supabase/client";
import { toast } from "sonner@2.0.3";
import { useAuth } from "../contexts/AuthContext";
import { checkEmailAvailability } from "../utils/api/check-email";
import bcrypt from 'bcryptjs';

interface UserData {
  user_id: string;
  username: string;
  email: string;
  account_verifications?: Array<{ status: string }>;  // 조인된 데이터
  status: string;
  is_active: boolean;  // 승인 여부
  created_at: string;
  last_login: string;
  role?: string;
  level?: string;
  parent_user_id?: string;
  tenant_id?: string;
  parent?: { username: string } | null;  // Supabase 조인 형식 (parent:users!parent_user_id(username))
}

interface WalletData {
  wallet_id: string;
  coin_type: string;
  address: string;
  balance: number;
  wallet_type?: string;
  created_at: string;
}

interface CoinData {
  symbol: string;
  icon_url: string | null;
}

interface Stats {
  totalUsers: number;
  pendingApproval: number; // 승인 대기
  totalCoins: number;      // 총 코인 개수 (balance 합)
  totalValue: number;      // 원화 환산 가치
}

export function UserWalletManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [userWallets, setUserWallets] = useState<WalletData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [parentFilter, setParentFilter] = useState("all"); // 소속별 필터
  const [activeTab, setActiveTab] = useState<"info" | "wallets">("info");
  const [userListTab, setUserListTab] = useState<"members" | "stores">("members"); // 회원/가맹점 탭
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    pendingApproval: 0,
    totalCoins: 0,
    totalValue: 0
  });
  const [isStatsLoading, setIsStatsLoading] = useState(false); // 통계 로딩 상태 추가
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [showAddCoinModal, setShowAddCoinModal] = useState(false);
  const [availableCoins, setAvailableCoins] = useState<string[]>([]);
  const [selectedCoins, setSelectedCoins] = useState<string[]>([]);
  const [isAddingCoins, setIsAddingCoins] = useState(false);
  const [coinIcons, setCoinIcons] = useState<Map<string, string>>(new Map());
  
  // 페이지네이션
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // 사용자 정보 편집
  const [isEditMode, setIsEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    username: '',
    email: '',
    newPassword: ''
  });
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');

  // 센터 계정 전용: 회원 추가/삭제
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [stores, setStores] = useState<{ user_id: string; username: string; }[]>([]);
  const [createUserForm, setCreateUserForm] = useState({
    username: '',
    email: '',
    password: '',
    phoneNumber: '',
    storeId: '' // 소속 가맹점
  });
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [emailValidation, setEmailValidation] = useState<{
    isValid: boolean;
    isAvailable: boolean | null;
    isChecking: boolean;
    message: string;
  }>({
    isValid: false,
    isAvailable: null,
    isChecking: false,
    message: ''
  });

  useEffect(() => {
    // 병렬로 데이터 로드
    fetchData();
    fetchCoinIcons(); // 백그라운드에서 비동기 로드
    
    // 센터 계정인 경우 가맹점 목록 조회
    if (user?.role === 'center') {
      fetchStores();
    }
    
    // 실시간 업데이트
    const channel = supabase
      .channel('user-wallet-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => {
        fetchData();
        if (selectedUser) {
          fetchUserWallets(selectedUser.user_id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 사용자 목록이 로드되면 첫 번째 사용자 자동 선택
  useEffect(() => {
    if (users.length > 0 && !selectedUser && !isLoading) {
      const firstUser = users[0];
      setSelectedUser(firstUser);
      fetchUserWallets(firstUser.user_id);
    }
  }, [users, selectedUser, isLoading]);

  const fetchCoinIcons = async () => {
    try {
      const { data: coins } = await supabase
        .from('supported_tokens')
        .select('symbol, icon_url');
      
      if (coins) {
        const iconMap = new Map<string, string>();
        coins.forEach((coin: CoinData) => {
          if (coin.icon_url) {
            iconMap.set(coin.symbol, coin.icon_url);
          }
        });
        setCoinIcons(iconMap);
      }
    } catch (error) {
      console.error('Error fetching coin icons:', error);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Backend API로 사용자 데이터 가져오기 (RLS 우회)
      const backendUrl = 'https://mzoeeqmtvlnyonicycvg.supabase.co/functions/v1/make-server-b6d5667f';
      const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16b2VlcW10dmxueW9uaWN5Y3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MjIyNzcsImV4cCI6MjA3ODQ5ODI3N30.oo7FsWjthtBtM-Xa1VFJieMGQ4mG__V8w7r9qGBPzaI';
      
      const response = await fetch(`${backendUrl}/api/admin/users`, {
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || '',
          'X-User-Role': user?.role || '',
          'X-User-Id': user?.id || ''
        }
      });
      
      // 응답 상태 확인
      if (!response.ok) {
        console.error('❌ HTTP Error:', response.status, response.statusText);
        const text = await response.text();
        console.error('Response body:', text);
        toast.error(`서버 오류: ${response.status}`);
        setIsLoading(false);
        return;
      }

      // Content-Type 확인
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('❌ Invalid content-type:', contentType);
        const text = await response.text();
        console.error('Response body:', text);
        toast.error('서버 응답 형식이 올바르지 않습니다');
        setIsLoading(false);
        return;
      }

      const result = await response.json();

      if (result.success && result.users) {
        // 센터 관리자 본인은 목록에서 제외
        const filteredUsers = result.users.filter((u: UserData) => u.user_id !== user?.id);
        
        // 🎯 STEP 1: 사용자 목록을 즉시 표시 (로딩 해제)
        setUsers(filteredUsers);
        setIsLoading(false); // ⚡ 여기서 먼저 로딩 해제하여 즉시 표시
        
        // 🎯 STEP 2: parent 정보는 백그라운드에서 비동기 처리
        const usersWithoutParent = filteredUsers.filter(u => u.parent_user_id && !u.parent);
        if (usersWithoutParent.length > 0) {
          console.log('⚠️ parent 정보가 없는 사용자:', usersWithoutParent.length, '명 - 백그라운드 조회 시작');
          
          // 비동기로 parent 정보 조회 (UI 블로킹 없음)
          (async () => {
            try {
              const parentIds = [...new Set(usersWithoutParent.map(u => u.parent_user_id).filter(Boolean))];
              
              const { data: parents } = await supabase
                .from('users')
                .select('user_id, username')
                .in('user_id', parentIds);
              
              if (parents && parents.length > 0) {
                const parentMap = new Map(parents.map(p => [p.user_id, p]));
                
                // 업데이트된 사용자 목록 생성
                const updatedUsers = filteredUsers.map(u => {
                  if (u.parent_user_id && !u.parent) {
                    const parentInfo = parentMap.get(u.parent_user_id);
                    if (parentInfo) {
                      return { ...u, parent: { username: parentInfo.username } };
                    }
                  }
                  return u;
                });
                
                setUsers(updatedUsers);
                console.log('✅ Parent 정보 업데이트 완료');
              }
            } catch (error) {
              console.error('❌ Fallback parent 조회 실패:', error);
            }
          })();
        }
        
        // 🎯 STEP 3: 통계는 백그라운드에서 계산 (별도 비동기)
        fetchStats(filteredUsers);
      } else {
        console.error('❌ Backend API error:', result);
        toast.error(result.error || '사용자 데이터를 가져오는데 실패했습니다');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('❌ Error fetching users:', error);
      toast.error('사용자 데이터를 가져오는데 실패했습니다');
      setIsLoading(false);
    }
  };

  const fetchStats = async (usersData: UserData[]) => {
    setIsStatsLoading(true); // 통계 로딩 시작
    try {
      // 통계 계산 - role='user'인 일반 사용자만 카운트 (관리자 제외)
      const regularUsers = usersData.filter((u: any) => u.role === 'user');
      const totalUsers = regularUsers.length;
      
      // 승인 대기 사용자 (is_active가 false)
      const pendingApproval = regularUsers.filter((u: any) => u.is_active === false).length;
      
      // 사용자들의 user_id 배열
      const userIds = usersData.map((u: any) => u.user_id);
      
      if (userIds.length === 0) {
        setStats({
          totalUsers: 0,
          pendingApproval: 0,
          totalCoins: 0,
          totalValue: 0
        });
        setIsStatsLoading(false);
        return;
      }
      
      // ⚡ 최적화: 병렬로 데이터 조회
      const [walletsResult, coinsResult] = await Promise.all([
        supabase
          .from('wallets')
          .select('balance, coin_type')
          .in('user_id', userIds),
        supabase
          .from('coins')
          .select('symbol, krw_price')
      ]);
      
      const walletsData = walletsResult.data;
      const coinsData = coinsResult.data;
      
      // 총 코인 개수 (모든 balance 합산)
      const totalCoins = walletsData?.reduce((sum, w) => sum + (parseFloat(w.balance) || 0), 0) || 0;
      
      // 코인별 시세 맵 생성
      const coinPriceMap = new Map<string, number>();
      coinsData?.forEach((coin) => {
        coinPriceMap.set(coin.symbol, parseFloat(coin.krw_price) || 0);
      });
      
      // 총 자산 가치 계산 (코인 개수 × 원화 시세)
      let totalValue = 0;
      walletsData?.forEach((wallet) => {
        const balance = parseFloat(wallet.balance) || 0;
        const price = coinPriceMap.get(wallet.coin_type) || 0;
        totalValue += balance * price;
      });

      setStats({
        totalUsers,
        pendingApproval,
        totalCoins: Math.round(totalCoins * 100) / 100, // 소수점 2자리
        totalValue: Math.round(totalValue)
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      // 통계 에러는 조용히 처리 (사용자 목록은 이미 표시됨)
    } finally {
      setIsStatsLoading(false); // 통계 로딩 완료
    }
  };

  const fetchUserWallets = async (userId: string) => {
    const { data } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (data) {
      setUserWallets(data);
    }
  };

  // 센터 계정 전용: 가맹점 목록 조회
  const fetchStores = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('user_id, username')
        .eq('role', 'store')
        .eq('parent_user_id', user?.id)
        .eq('status', 'active')
        .order('username', { ascending: true });

      if (error) throw error;
      setStores(data || []);
    } catch (error) {
      console.error('가맹점 목록 조회 실패:', error);
    }
  };

  // 이메일 실시간 검증 (디바운싱 포함)
  const validateEmail = async (email: string) => {
    // 빈 값 체크
    if (!email.trim()) {
      setEmailValidation({
        isValid: false,
        isAvailable: null,
        isChecking: false,
        message: ''
      });
      return;
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailValidation({
        isValid: false,
        isAvailable: null,
        isChecking: false,
        message: '올바른 이메일 형식이 아닙니다'
      });
      return;
    }

    // 중복 체크 시작 (형식이 올바른 경우)
    setEmailValidation({
      isValid: true,
      isAvailable: null,
      isChecking: true,
      message: '이메일 확인 중...'
    });

    try {
      const isAvailable = await checkEmailAvailability(email);
      
      console.log('🔍 센터 회원추가 - 이메일 체크 결과:', isAvailable);
      
      setEmailValidation({
        isValid: true,
        isAvailable: isAvailable,
        isChecking: false,
        message: isAvailable 
          ? '✓ 사용 가능한 이메일입니다' 
          : '✗ 이미 사용 중인 이메일입니다'
      });
    } catch (error) {
      setEmailValidation({
        isValid: true,
        isAvailable: null,
        isChecking: false,
        message: '이메일 확인 중 오류가 발생했습니다'
      });
    }
  };

  // 디바운싱된 이메일 검증
  useEffect(() => {
    if (!createUserForm.email) return;

    const timer = setTimeout(() => {
      validateEmail(createUserForm.email);
    }, 500); // 0.5초 대기

    return () => clearTimeout(timer);
  }, [createUserForm.email]);

  // 회원 추가
  const handleCreateUser = async () => {
    try {
      setIsCreatingUser(true);
      
      // 검증
      if (!createUserForm.username.trim()) {
        toast.error('사용자명을 입력해주세요');
        return;
      }
      if (!createUserForm.email.trim()) {
        toast.error('이메일을 입력해주세요');
        return;
      }
      
      // 이메일 형식 검증
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(createUserForm.email)) {
        toast.error('올바른 이메일 형식이 아닙니다');
        return;
      }
      
      if (!createUserForm.password || createUserForm.password.length < 8) {
        toast.error('비밀번호는 최소 8자 이상이어야 합니다');
        return;
      }
      if (!createUserForm.storeId) {
        toast.error('소속 가맹점을 선택해주세요');
        return;
      }

      // 이메일 중복 확인
      if (!emailValidation.isAvailable) {
        toast.error('사용할 수 없는 이메일입니다');
        return;
      }

      // 회원 생성 (Auth 없이 DB에만 저장)
      const userId = self.crypto.randomUUID();
      const passwordHash = await bcrypt.hash(createUserForm.password, 10);

      // users 테이블에 사용자 정보 저장
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          user_id: userId,
          email: createUserForm.email,
          username: createUserForm.username,
          password_hash: passwordHash,
          phone: createUserForm.phoneNumber || null,
          referral_code: createUserForm.email.split('@')[0].toLowerCase(), // 이메일 @ 앞부분을 추천인 코드로
          role: 'user',
          level: 'Basic',
          parent_user_id: createUserForm.storeId,
          tenant_id: createUserForm.storeId, // 소속 가맹점을 tenant_id로 사용
          status: 'active',
          is_active: true,
          kyc_status: 'pending',
        });

      if (insertError) {
        console.error('❌ DB Insert Error:', insertError);
        throw new Error('데이터베이스 저장 중 오류가 발생했습니다');
      }

      toast.success('회원이 추가되었습니다');
      setShowCreateUserModal(false);
      setCreateUserForm({
        username: '',
        email: '',
        password: '',
        phoneNumber: '',
        storeId: ''
      });
      setEmailValidation({
        isValid: false,
        isAvailable: null,
        isChecking: false,
        message: ''
      });
      fetchData();
    } catch (error: any) {
      console.error('회원 추가 실패:', error);
      toast.error(error.message || '회원 추가에 실패했습니다');
    } finally {
      setIsCreatingUser(false);
    }
  };

  // 회원 삭제
  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    if (!confirm(`${selectedUser.username} (${selectedUser.email}) 회원을 정말 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }

    try {
      // 1. 사용자 지갑 모두 삭제
      const { error: walletError } = await supabase
        .from('wallets')
        .delete()
        .eq('user_id', selectedUser.user_id);

      if (walletError) {
        console.error('지갑 삭제 오류:', walletError);
      }

      // 2. 사용자 삭제
      const { error: userError } = await supabase
        .from('users')
        .delete()
        .eq('user_id', selectedUser.user_id);

      if (userError) throw userError;

      // 3. Auth 사용자 삭제 (선택적)
      try {
        await supabase.auth.admin.deleteUser(selectedUser.user_id);
      } catch (authError) {
        console.error('Auth 삭제 오류:', authError);
      }

      toast.success('회원이 삭제되었습니다');
      setSelectedUser(null);
      fetchData();
    } catch (error: any) {
      console.error('회원 삭제 실패:', error);
      toast.error(error.message || '회원 삭제에 실패했습니다');
    }
  };

  const handleUserSelect = async (user: UserData) => {
    setSelectedUser(user);
    setActiveTab("info");
    setIsEditMode(false); // 편집 모드 초기화
    setShowPasswordReset(false); // 비밀번호 모달 초기화
    await fetchUserWallets(user.user_id);
  };

  const handleStatusChange = async (userId: string, newStatus: string) => {
    const { error } = await supabase
      .from('users')
      .update({ status: newStatus })
      .eq('user_id', userId);

    if (error) {
      toast.error('상태 변경 실패');
      console.error('Status change error:', error);
      return;
    }

    toast.success(`사용자 상태가 ${newStatus === 'active' ? '활성' : newStatus === 'suspended' ? '정지' : newStatus === 'blocked' ? '차단' : '비활성'}로 변경되었습니다`);
    
    // 데이터 새로고침
    await fetchData();
    
    // 선택된 사용자 업데이트
    if (selectedUser?.user_id === userId) {
      setSelectedUser({ ...selectedUser, status: newStatus });
    }
  };

  const handleEditUser = () => {
    if (!selectedUser) return;
    setEditForm({
      username: selectedUser.username,
      email: selectedUser.email,
      newPassword: ''
    });
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditForm({ username: '', email: '', newPassword: '' });
  };

  const handleSaveUserInfo = async () => {
    if (!selectedUser) return;

    try {
      // 사용자 기본 정보 업데이트 (이메일 제외)
      const { error: updateError } = await supabase
        .from('users')
        .update({
          username: editForm.username
          // email은 변경하지 않음 (referral_code와 연동)
        })
        .eq('user_id', selectedUser.user_id);

      if (updateError) throw updateError;

      toast.success('사용자 정보가 업데이트되었습니다');
      
      // 선택된 사용자 업데이트 (이메일은 기존 값 유지)
      setSelectedUser({
        ...selectedUser,
        username: editForm.username
      });
      
      await fetchData();
      setIsEditMode(false);
    } catch (error) {
      console.error('Update error:', error);
      toast.error('정보 업데이트에 실패했습니다');
    }
  };

  const handleGeneratePassword = () => {
    // 안전한 임시 비밀번호 생성 (12자리: 대문자+소문자+숫자+특수문자)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    const length = 12;
    let password = '';
    
    // 각 카테고리에서 최소 1개씩
    password += 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]; // 대문자
    password += 'abcdefghijkmnpqrstuvwxyz'[Math.floor(Math.random() * 24)]; // 소문자
    password += '23456789'[Math.floor(Math.random() * 8)]; // 숫자
    password += '!@#$%'[Math.floor(Math.random() * 5)]; // 특수문자
    
    // 나머지 랜덤
    for (let i = 4; i < length; i++) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }
    
    // 섞기
    password = password.split('').sort(() => Math.random() - 0.5).join('');
    
    setGeneratedPassword(password);
    setShowPasswordReset(true);
  };

  const handleResetPassword = async () => {
    if (!selectedUser || !generatedPassword) return;

    try {
      // 비밀번호 해시 생성
      const passwordHash = await bcrypt.hash(generatedPassword, 10);
      
      // users 테이블에 임시 비밀번호 저장 (bcrypt 해시로 저장)
      const { error } = await supabase
        .from('users')
        .update({ 
          password_hash: passwordHash
        })
        .eq('user_id', selectedUser.user_id);

      if (error) throw error;

      toast.success('비밀번호가 초기화되었습니다. 새 비밀번호를 사용자에게 안전하게 전달하세요.');
    } catch (error) {
      console.error('Password reset error:', error);
      toast.error('비밀번호 초기화에 실패했습니다');
    }
  };

  const handleCopyPassword = async () => {
    try {
      // Fallback 방식을 기본으로 사용 (권한 문제 회피)
      const textArea = document.createElement('textarea');
      textArea.value = generatedPassword;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        toast.success('비밀번호가 클립보드에 복사되었습니다');
      } else {
        throw new Error('Copy command failed');
      }
    } catch (error) {
      console.error('Copy failed:', error);
      toast.error('복사에 실패했습니다. 수동으로 복사해주세요.');
    }
  };

  const handleAddCoins = async () => {
    if (!selectedUser) return;
    
    // 사용 가능한 코인 조회 (DB 테이블: supported_tokens, 컬럼: symbol)
    const { data: coins } = await supabase
      .from('supported_tokens')
      .select('symbol')
      .eq('is_active', true);

    // 이미 보유한 코인 제외
    const existingCoins = userWallets.map(w => w.coin_type);
    const available = coins?.map(c => c.symbol).filter(c => !existingCoins.includes(c)) || [];

    setAvailableCoins(available);
    setSelectedCoins([]);
    setShowAddCoinModal(true);
  };

  const handleConfirmAddCoins = async () => {
    if (!selectedUser || selectedCoins.length === 0) return;
    
    setIsAddingCoins(true);

    try {
      // ✅ Edge Function을 통한 실제 블록체인 지갑 생성
      const backendUrl = 'https://mzoeeqmtvlnyonicycvg.supabase.co/functions/v1/make-server-b6d5667f';
      const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16b2VlcW10dmxueW9uaWN5Y3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MjIyNzcsImV4cCI6MjA3ODQ5ODI3N30.oo7FsWjthtBtM-Xa1VFJieMGQ4mG__V8w7r9qGBPzaI';

      const response = await fetch(`${backendUrl}/wallet/create-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`
        },
        body: JSON.stringify({
          user_id: selectedUser.user_id,
          coin_types: selectedCoins,
          wallet_type: 'hot'
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '지갑 생성 실패');
      }

      const { wallets, errors, summary } = result;

      if (summary.succeeded > 0) {
        toast.success(`${summary.succeeded}개의 코인 지갑이 생성되었습니다`);
      }
      
      if (errors && errors.length > 0) {
        errors.forEach((err: any) => {
          toast.error(`${err.coin_type} 지갑 생성 실패: ${err.error}`);
        });
      }

      setShowAddCoinModal(false);
      await fetchUserWallets(selectedUser.user_id);
    } catch (error: any) {
      toast.error(`지갑 생성 실패: ${error.message}`);
      console.error('지갑 생성 오류:', error);
    } finally {
      setIsAddingCoins(false);
    }
  };

  const copyToClipboard = async (address: string, walletId: string) => {
    try {
      // Fallback 방식을 기본으로 사용 (권한 문제 회피)
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
        setCopiedAddress(walletId);
        toast.success('주소가 복사되었습니다');
        setTimeout(() => setCopiedAddress(null), 2000);
      } else {
        throw new Error('Copy command failed');
      }
    } catch (error) {
      console.error('Copy failed:', error);
      toast.error('복사에 실패했습니다. 수동으로 복사해주세요.');
    }
  };

  // 필터링된 사용자 목록
  const filteredUsers = users.filter(userData => {
    const matchesSearch = userData.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         userData.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || userData.status === statusFilter;
    
    // 가맹점 관리자는 회원만 표시 (탭 기능 없음)
    if (user?.role === 'store') {
      return matchesSearch && matchesStatus && userData.role === 'user';
    }
    
    // 센터 관리자는 탭에 따라 회원/가맹점 필터링
    const matchesTab = userListTab === 'members' 
      ? userData.role === 'user'  // 회원만
      : userData.role === 'store'; // 가맹점만
    
    // 소속별 필터링 (회원 탭일 때만 적용)
    const matchesParent = userListTab === 'members' 
      ? (parentFilter === 'all' || userData.parent_user_id === parentFilter)
      : true;
    
    return matchesSearch && matchesStatus && matchesTab && matchesParent;
  });

  // 페이지네이션 계산
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentUsers = filteredUsers.slice(startIndex, endIndex);

  // 페이지 변경 시 첫 페이지로 리셋 (필터 변경 시)
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, itemsPerPage, userListTab, parentFilter]);

  const getStatusColor = (user: UserData) => {
    // is_active가 false면 승인 대기
    if (!user.is_active) {
      return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
    }
    
    switch (user.status) {
      case 'active': return 'text-green-400 bg-green-500/20 border-green-500/50';
      case 'suspended': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
      case 'blocked': return 'text-red-400 bg-red-500/20 border-red-500/50';
      default: return 'text-slate-400 bg-slate-500/20 border-slate-500/50';
    }
  };

  const getStatusText = (user: UserData) => {
    // is_active가 false면 승인 대기
    if (!user.is_active) {
      return '승인대기';
    }
    
    switch (user.status) {
      case 'active': return '활성';
      case 'suspended': return '정지';
      case 'blocked': return '차단';
      default: return user.status;
    }
  };

  const getVerificationColor = (status?: string) => {
    if (!status) return 'text-slate-400 bg-slate-500/20';
    
    switch (status) {
      case 'verified': return 'text-green-400 bg-green-500/20';
      case 'pending': return 'text-yellow-400 bg-yellow-500/20';
      case 'rejected': return 'text-red-400 bg-red-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  };

  const getVerificationText = (status?: string) => {
    if (!status) return '-';
    
    switch (status) {
      case 'verified': return '인증';
      case 'pending': return '대기';
      case 'rejected': return '거절';
      case 'not_submitted': return '미제출';
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">총 사용자</p>
            <p className="text-cyan-400 text-2xl">{stats.totalUsers.toLocaleString()}</p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">승인 대기</p>
            <p className="text-orange-400 text-2xl">{stats.pendingApproval.toLocaleString()}</p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">총 코인 개수</p>
            {isStatsLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                <span className="text-purple-400 text-lg">계산중...</span>
              </div>
            ) : (
              <p className="text-purple-400 text-2xl">{stats.totalCoins.toLocaleString()}</p>
            )}
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg opacity-20 group-hover:opacity-30 blur transition-opacity"></div>
          <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">총 자산 가치</p>
            {isStatsLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
                <span className="text-yellow-400 text-lg">계산중...</span>
              </div>
            ) : (
              <p className="text-yellow-400 text-2xl">₩{stats.totalValue.toLocaleString()}</p>
            )}
          </div>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 왼쪽: 사용자 목록 */}
        <div className="lg:col-span-2">
          <div className="relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-xl opacity-20 blur"></div>
            <div className="relative bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-xl p-6 min-h-[600px]">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl text-cyan-400">사용자 목록</h2>
                  <div className="flex items-center gap-2">
                    {user?.role === 'center' && (
                      <button
                        onClick={() => setShowCreateUserModal(true)}
                        className="px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg text-sm flex items-center gap-1.5 transition-all shadow-lg shadow-cyan-500/30"
                      >
                        <UserPlus className="w-4 h-4" />
                        회원 추가
                      </button>
                    )}
                    <select
                      value={itemsPerPage}
                      onChange={(e) => setItemsPerPage(Number(e.target.value))}
                      className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                    >
                      <option value={20}>20개</option>
                      <option value={30}>30개</option>
                      <option value={50}>50개</option>
                    </select>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="all">전체</option>
                      <option value="active">활성</option>
                      <option value="suspended">정지</option>
                      <option value="blocked">차단</option>
                    </select>
                  </div>
                </div>

                {/* 회원/가맹점 탭 - 센터 관리자만 표시 */}
                {user?.role === 'center' && (
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setUserListTab('members')}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        userListTab === 'members'
                          ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/30'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      👤 회원
                    </button>
                    <button
                      onClick={() => setUserListTab('stores')}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        userListTab === 'stores'
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      🏪 가맹점
                    </button>
                  </div>
                )}
              </div>

              {/* 검색 및 필터 */}
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="사용자명 또는 이메일 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                
                {/* 소속별 필터 (센터 관리자의 회원 탭일 때만 표시) */}
                {user?.role === 'center' && userListTab === 'members' && (
                  <select
                    value={parentFilter}
                    onChange={(e) => setParentFilter(e.target.value)}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500 min-w-[160px]"
                  >
                    <option value="all">전체 소속</option>
                    {stores.map(store => (
                      <option key={store.user_id} value={store.user_id}>
                        {store.username}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* 사용자 리스트 - 스크롤 없이 페이지네이션 */}
              <div className="space-y-1.5 min-h-[480px]">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mb-4" />
                    <p className="text-slate-400">사용자 목록을 불러오는 중...</p>
                  </div>
                ) : currentUsers.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    검색 결과가 없습니다
                  </div>
                ) : (
                  currentUsers.map(user => (
                    <button
                      key={user.user_id}
                      onClick={() => handleUserSelect(user)}
                      className={`w-full p-2.5 rounded-lg border transition-all text-left ${
                        selectedUser?.user_id === user.user_id
                          ? 'bg-cyan-500/20 border-cyan-500/50'
                          : 'bg-slate-800/70 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-slate-300 text-sm font-medium truncate">{user.username}</p>
                            {/* Role 배지 */}
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              user.role === 'user' ? 'bg-blue-500/20 text-blue-400' :
                              user.role === 'store' ? 'bg-purple-500/20 text-purple-400' :
                              user.role === 'center' ? 'bg-orange-500/20 text-orange-400' :
                              user.role === 'admin' ? 'bg-red-500/20 text-red-400' :
                              user.role === 'master' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-slate-500/20 text-slate-400'
                            }`}>
                              {user.role === 'user' ? '회원' :
                               user.role === 'store' ? '가맹점' :
                               user.role === 'center' ? '센터' :
                               user.role === 'admin' ? '관리자' :
                               user.role === 'master' ? '마스터' : user.role}
                            </span>
                          </div>
                          <p className="text-slate-500 text-xs truncate">{user.email}</p>
                          {/* 소속 정보 - 디버깅 */}
                          {user.role === 'user' && (
                            <p className="text-slate-400 text-xs mt-0.5">
                              {user.parent?.username ? (
                                <span className="truncate">🏪 소속: {user.parent.username}</span>
                              ) : (
                                <span className="text-slate-600 text-[10px] block">
                                  parent_id: {user.parent_user_id?.substring(0, 8) || '없음'}... | 
                                  parent: {user.parent ? JSON.stringify(user.parent) : 'null'} | 
                                  type: {typeof user.parent}
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs border ${getStatusColor(user)}`}>
                            {getStatusText(user)}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-xs ${getVerificationColor(user.account_verifications?.[0]?.status)}`}>
                            {getVerificationText(user.account_verifications?.[0]?.status)}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-slate-700 pt-4">
                  <p className="text-sm text-slate-400">
                    {startIndex + 1}-{Math.min(endIndex, filteredUsers.length)} / {filteredUsers.length}명
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 bg-slate-800 border border-slate-700 rounded hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4 text-slate-400" />
                    </button>
                    <span className="text-sm text-slate-300 px-2">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-1.5 bg-slate-800 border border-slate-700 rounded hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 오른쪽: 사용자 상세 정보 */}
        <div className="lg:col-span-3">
          <div className="relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-xl opacity-20 blur"></div>
            <div className="relative bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-xl min-h-[600px]">
              {!selectedUser ? (
                <div className="p-12 h-full flex items-center justify-center">
                  <div className="text-center text-slate-400">
                    <UserCheck className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>사용자를 선택해주세요</p>
                  </div>
                </div>
              ) : (
                <div className="p-6 h-full flex flex-col">
              {/* 탭 헤더 */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab("info")}
                    className={`px-4 py-2 rounded-lg transition-all ${
                      activeTab === "info"
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    사용자 정보
                  </button>
                  <button
                    onClick={() => setActiveTab("wallets")}
                    className={`px-4 py-2 rounded-lg transition-all ${
                      activeTab === "wallets"
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    지갑 관리 ({userWallets.length})
                  </button>
                </div>

                {activeTab === "wallets" && (
                  <button
                    onClick={handleAddCoins}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-all border border-cyan-500/50"
                  >
                    <Plus className="w-4 h-4" />
                    코인 추가
                  </button>
                )}
              </div>

              {/* 탭 컨텐츠 - 스크롤 없이 */}
              <div className="flex-1 min-h-0">
                {activeTab === "info" ? (
                  <div className="space-y-6">
                    {/* 기본 정보 */}
                    <div className="bg-slate-800/70 rounded-lg p-6 border border-slate-700">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg text-cyan-400 flex items-center gap-2">
                          <UserCheck className="w-5 h-5" />
                          기본 정보
                        </h3>
                        {!isEditMode ? (
                          <button
                            onClick={handleEditUser}
                            className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-all border border-purple-500/50 text-sm"
                          >
                            정보 수정
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={handleSaveUserInfo}
                              className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-all border border-green-500/50 text-sm"
                            >
                              저장
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-3 py-1.5 bg-slate-600 text-slate-300 rounded-lg hover:bg-slate-500 transition-all text-sm"
                            >
                              취소
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-slate-400 text-sm mb-1">사용자명</p>
                          {isEditMode ? (
                            <input
                              type="text"
                              value={editForm.username}
                              onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-300 focus:outline-none focus:border-cyan-500"
                            />
                          ) : (
                            <p className="text-slate-300">{selectedUser.username}</p>
                          )}
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm mb-1">이메일</p>
                          {isEditMode ? (
                            <div className="relative">
                              <input
                                type="email"
                                value={editForm.email}
                                readOnly
                                disabled
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-500 cursor-not-allowed"
                              />
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 group">
                                <Lock className="w-4 h-4 text-slate-600" />
                                <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                  이메일은 변경할 수 없습니다
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className="text-slate-300">{selectedUser.email}</p>
                          )}
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm mb-1">계좌증 상태</p>
                          <span className={`inline-block px-3 py-1 rounded text-sm ${getVerificationColor(selectedUser.account_verifications?.[0]?.status)}`}>
                            {getVerificationText(selectedUser.account_verifications?.[0]?.status)}
                          </span>
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm mb-1">계정은 상태</p>
                          <div className="flex items-center gap-2">
                            <span className={`inline-block px-3 py-1 rounded text-sm border ${getStatusColor(selectedUser)}`}>
                              {getStatusText(selectedUser)}
                            </span>
                            {!selectedUser.is_active && (
                              <>
                                <button
                                  onClick={async () => {
                                    try {
                                      const { error } = await supabase
                                        .from('users')
                                        .update({ is_active: true })
                                        .eq('user_id', selectedUser.user_id);
                                      
                                      if (error) throw error;
                                      
                                      toast.success('사용자가 승인되었습니다');
                                      setSelectedUser({ ...selectedUser, is_active: true });
                                      await fetchData();
                                    } catch (error) {
                                      toast.error('승인 처리 실패');
                                    }
                                  }}
                                  className="px-3 py-1 bg-green-500/20 text-green-400 rounded text-sm hover:bg-green-500/30 transition-all border border-green-500/50"
                                >
                                  승인하기
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!confirm('승인을 취소하고 사용자를 삭제하시겠습니까?')) {
                                      return;
                                    }
                                    try {
                                      const { error } = await supabase
                                        .from('users')
                                        .delete()
                                        .eq('user_id', selectedUser.user_id);
                                      
                                      if (error) throw error;
                                      
                                      toast.success('사용자 승인이 취소되었습니다');
                                      setSelectedUser(null);
                                      await fetchData();
                                    } catch (error) {
                                      toast.error('승인 취소 실패');
                                    }
                                  }}
                                  className="px-3 py-1 bg-red-500/20 text-red-400 rounded text-sm hover:bg-red-500/30 transition-all border border-red-500/50"
                                >
                                  승인취소
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm mb-1">가입일</p>
                          <p className="text-slate-300">{new Date(selectedUser.created_at).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm mb-1">마지막 로그인</p>
                          <p className="text-slate-300">
                            {selectedUser.last_login ? new Date(selectedUser.last_login).toLocaleDateString() : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm mb-1">계정 유형</p>
                          <span className={`inline-block px-3 py-1 rounded text-sm ${
                            selectedUser.role === 'user' ? 'bg-blue-500/20 text-blue-400' :
                            selectedUser.role === 'store' ? 'bg-purple-500/20 text-purple-400' :
                            selectedUser.role === 'center' ? 'bg-orange-500/20 text-orange-400' :
                            selectedUser.role === 'admin' ? 'bg-red-500/20 text-red-400' :
                            selectedUser.role === 'master' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {selectedUser.role === 'user' ? '회원' :
                             selectedUser.role === 'store' ? '가맹점' :
                             selectedUser.role === 'center' ? '센터' :
                             selectedUser.role === 'admin' ? '관리자' :
                             selectedUser.role === 'master' ? '마스터' : selectedUser.role}
                          </span>
                        </div>
                        {selectedUser.role === 'user' && selectedUser.parent?.username && (
                          <div>
                            <p className="text-slate-400 text-sm mb-1">소속 가맹점</p>
                            <p className="text-slate-300">🏪 {selectedUser.parent.username}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-slate-400 text-sm mb-1">
                            회원 등급
                            <span className="ml-2 text-xs text-cyan-400">💡 가스비 정책 자동 적용</span>
                          </p>
                          <div className="flex items-center gap-2">
                            <select
                              value={selectedUser.level || 'Basic'}
                              onChange={async (e) => {
                                const newLevel = e.target.value;
                                
                                try {
                                  // Backend API로 등급 업데이트
                                  const backendUrl = 'https://mzoeeqmtvlnyonicycvg.supabase.co/functions/v1/make-server-b6d5667f';
                                  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16b2VlcW10dmxueW9uaWN5Y3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MjIyNzcsImV4cCI6MjA3ODQ5ODI3N30.oo7FsWjthtBtM-Xa1VFJieMGQ4mG__V8w7r9qGBPzaI';
                                  
                                  const response = await fetch(`${backendUrl}/api/admin/users/${selectedUser.user_id}/level`, {
                                    method: 'PUT',
                                    headers: {
                                      'Authorization': `Bearer ${anonKey}`,
                                      'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ level: newLevel })
                                  });

                                  const result = await response.json();
                                  
                                  if (!result.success) {
                                    throw new Error(result.error || '등급 변경 실패');
                                  }
                                  
                                  toast.success(`등급이 ${newLevel}로 변경되었습니다. 가스비 정책이 자동으로 적용됩니다.`);
                                  setSelectedUser({ ...selectedUser, level: newLevel });
                                  await fetchData();
                                } catch (error: any) {
                                  console.error('Level update error:', error);
                                  toast.error(error.message || '등급 변경 실패');
                                }
                              }}
                              className="px-3 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-slate-300 focus:outline-none focus:border-cyan-500"
                            >
                              <option value="Basic">Basic (100% 사용자 부담)</option>
                              <option value="Standard">Standard (부분 지원)</option>
                              <option value="Premium">Premium (대부분 지원)</option>
                              <option value="VIP">VIP (100% 운영자 부담)</option>
                            </select>
                            {selectedUser.level === 'VIP' && <span className="text-yellow-400">👑</span>}
                            {selectedUser.level === 'Premium' && <span className="text-purple-400">💎</span>}
                            {selectedUser.level === 'Standard' && <span className="text-cyan-400">⭐</span>}
                          </div>
                        </div>
                      </div>

                      {/* 비밀번호 초기화 - 기본 정보 카드 내부 */}
                      <div className="mt-6 pt-6 border-t border-slate-700/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4 text-orange-400" />
                            <p className="text-slate-400 text-sm">비밀번호 초기화</p>
                          </div>
                          <button
                            onClick={handleGeneratePassword}
                            className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 transition-all border border-orange-500/50 text-sm"
                          >
                            <Shield className="w-4 h-4" />
                            임시 비밀번호 생성
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 상태 관리 */}
                    <div className="bg-slate-800/70 rounded-lg p-6 border border-slate-700">
                      <h3 className="text-lg text-cyan-400 mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        상태 관리
                      </h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStatusChange(selectedUser.user_id, 'active')}
                          disabled={selectedUser.status === 'active'}
                          className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-all border border-green-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <UserCheck className="w-4 h-4" />
                          활성화
                        </button>
                        <button
                          onClick={() => handleStatusChange(selectedUser.user_id, 'suspended')}
                          disabled={selectedUser.status === 'suspended'}
                          className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-all border border-yellow-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Lock className="w-4 h-4" />
                          정지
                        </button>
                        <button
                          onClick={() => handleStatusChange(selectedUser.user_id, 'blocked')}
                          disabled={selectedUser.status === 'blocked'}
                          className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-all border border-red-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <UserX className="w-4 h-4" />
                          차단
                        </button>
                      </div>
                    </div>

                    {/* 회원 삭제 (센터 계정만) */}
                    {user?.role === 'center' && (
                      <div className="bg-red-900/20 rounded-lg p-6 border border-red-500/30">
                        <h3 className="text-lg text-red-400 mb-4 flex items-center gap-2">
                          <Trash2 className="w-5 h-5" />
                          회원 삭제
                        </h3>
                        <p className="text-slate-400 text-sm mb-4">
                          회원을 삭제하면 모든 데이터(지갑, 거래내역 등)가 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                        </p>
                        <button
                          onClick={handleDeleteUser}
                          className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-all border border-red-500/50"
                        >
                          <Trash2 className="w-4 h-4" />
                          회원 삭제
                        </button>
                      </div>
                    )}

                    {/* 지갑 요약 */}
                    <div className="bg-slate-800/70 rounded-lg p-6 border border-slate-700">
                      <h3 className="text-lg text-cyan-400 mb-4 flex items-center gap-2">
                        <Wallet className="w-5 h-5" />
                        지갑 요약
                      </h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-slate-400 text-sm mb-1">총 지갑 수</p>
                          <p className="text-2xl text-cyan-400">{userWallets.length}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm mb-1">총 자산 가치</p>
                          <p className="text-2xl text-green-400">
                            ₩{userWallets.reduce((sum, w) => sum + w.balance, 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm mb-1">보유 코인 종류</p>
                          <p className="text-2xl text-purple-400">{userWallets.length}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {userWallets.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">
                        <Wallet className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p>지갑이 없습니다</p>
                        <button
                          onClick={handleAddCoins}
                          className="mt-4 px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-all border border-cyan-500/50"
                        >
                          코인 추가하기
                        </button>
                      </div>
                    ) : (
                      userWallets.map(wallet => (
                        <div
                          key={wallet.wallet_id}
                          className="bg-slate-800/70 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                              <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-500/50 overflow-hidden">
                                {coinIcons.has(wallet.coin_type) ? (
                                  <img 
                                    src={coinIcons.get(wallet.coin_type)} 
                                    alt={wallet.coin_type}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      const parent = target.parentElement;
                                      if (parent && !parent.querySelector('svg')) {
                                        const fallback = document.createElement('div');
                                        fallback.innerHTML = '<svg class="w-5 h-5 text-cyan-400" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>';
                                        parent.appendChild(fallback.firstChild!);
                                      }
                                    }}
                                  />
                                ) : (
                                  <Coins className="w-5 h-5 text-cyan-400" />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-slate-300 font-medium">{wallet.coin_type}</p>
                                  {wallet.wallet_type && (
                                    <span className={`px-2 py-0.5 rounded text-xs ${
                                      wallet.wallet_type === 'hot' 
                                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50'
                                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                                    }`}>
                                      {wallet.wallet_type === 'hot' ? 'Hot' : 'Cold'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-500 text-sm font-mono">{wallet.address.slice(0, 20)}...</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-lg text-cyan-400 font-mono">{wallet.balance.toFixed(8)}</p>
                                <p className="text-slate-500 text-sm">
                                  ≈ ₩{(wallet.balance * 1000).toLocaleString()}
                                </p>
                              </div>
                              
                              {/* Hot ↔ Cold 이동 버튼 */}
                              {wallet.balance > 0 && (
                                <button
                                  onClick={async () => {
                                    const direction = wallet.wallet_type === 'hot' ? 'Cold' : 'Hot';
                                    const amount = prompt(`${direction} Wallet으로 이동할 금액을 입력하세요 (보유: ${wallet.balance})`);
                                    
                                    if (!amount || parseFloat(amount) <= 0) return;
                                    if (parseFloat(amount) > wallet.balance) {
                                      toast.error('잔액이 부족합니다');
                                      return;
                                    }

                                    try {
                                      const endpoint = wallet.wallet_type === 'hot' ? 'move-to-cold' : 'move-to-hot';
                                      const backendUrl = 'https://mzoeeqmtvlnyonicycvg.supabase.co/functions/v1/make-server-b6d5667f';
                                      
                                      const response = await fetch(`${backendUrl}/transaction/${endpoint}`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          user_id: selectedUser.user_id,
                                          coin_type: wallet.coin_type,
                                          amount: amount
                                        })
                                      });

                                      const result = await response.json();
                                      
                                      if (result.success) {
                                        toast.success(result.message);
                                        fetchUserWallets(selectedUser.user_id);
                                      } else {
                                        toast.error(result.error || '이동 실패');
                                      }
                                    } catch (error: any) {
                                      console.error('Wallet move error:', error);
                                      toast.error('자산 이동 실패');
                                    }
                                  }}
                                  className={`p-2 rounded transition-colors ${
                                    wallet.wallet_type === 'hot'
                                      ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10'
                                      : 'text-orange-400 hover:text-orange-300 hover:bg-orange-500/10'
                                  }`}
                                  title={wallet.wallet_type === 'hot' ? 'Cold Wallet으로 이동' : 'Hot Wallet으로 이동'}
                                >
                                  {wallet.wallet_type === 'hot' ? '❄️' : '🔥'}
                                </button>
                              )}
                              
                              <button
                                onClick={() => copyToClipboard(wallet.address, wallet.wallet_id)}
                                className="p-2 text-slate-400 hover:text-cyan-400 transition-colors"
                              >
                                {copiedAddress === wallet.wallet_id ? (
                                  <Check className="w-5 h-5 text-green-400" />
                                ) : (
                                  <Copy className="w-5 h-5" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 코인 추가 모달 */}
      {showAddCoinModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-slate-900 rounded-lg border border-cyan-500/30 shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-xl text-cyan-400 mb-4">코인 추가</h3>
              
              {availableCoins.length === 0 ? (
                <p className="text-slate-400 text-center py-8">
                  추가할 수 있는 코인이 없습니다
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {availableCoins.map(coin => (
                    <label
                      key={coin}
                      className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg border border-slate-700 hover:border-cyan-500/50 cursor-pointer transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCoins.includes(coin)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCoins([...selectedCoins, coin]);
                          } else {
                            setSelectedCoins(selectedCoins.filter(c => c !== coin));
                          }
                        }}
                        className="w-4 h-4 text-cyan-500 bg-slate-700 border-slate-600 rounded focus:ring-cyan-500"
                      />
                      <span className="text-slate-300">{coin}</span>
                    </label>
                  ))}
                </div>
              )}

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => setShowAddCoinModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-all"
                >
                  취소
                </button>
                <button
                  onClick={handleConfirmAddCoins}
                  disabled={selectedCoins.length === 0 || isAddingCoins}
                  className="flex-1 px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-all border border-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isAddingCoins ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      추가 중...
                    </>
                  ) : (
                    `추가 (${selectedCoins.length})`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 비밀번호 초기화 모달 */}
      {showPasswordReset && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-slate-900 rounded-lg border border-orange-500/30 shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-xl text-orange-400 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5" />
                임시 비밀번호
              </h3>
              
              <div className="space-y-4">
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-slate-950 px-3 py-2 rounded text-cyan-400 font-mono text-lg">
                      {generatedPassword}
                    </code>
                    <button
                      onClick={handleCopyPassword}
                      className="p-2 bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30 transition-all"
                      title="복사"
                    >
                      <Copy className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <p className="text-slate-400 text-sm text-center">
                  사용자에게 전달 후 모바일 앱에서 직접 변경할 수 있습니다
                </p>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    setShowPasswordReset(false);
                    setGeneratedPassword('');
                  }}
                  className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-all"
                >
                  취소
                </button>
                <button
                  onClick={async () => {
                    await handleResetPassword();
                    setShowPasswordReset(false);
                  }}
                  className="flex-1 px-4 py-2 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 transition-all border border-orange-500/50"
                >
                  적용
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 사용자 생성 모달 */}
      {showCreateUserModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-slate-900 rounded-lg border border-cyan-500/30 shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/20 border border-cyan-500/50 rounded-lg">
                    <UserPlus className="w-6 h-6 text-cyan-400" />
                  </div>
                  <h3 className="text-xl text-cyan-400">회원 추가</h3>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-slate-400 text-sm mb-2">
                    사용자명 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={createUserForm.username}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, username: e.target.value })}
                    placeholder="사용자명 입력"
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-slate-400 text-sm mb-2">
                    이메일 <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={createUserForm.email}
                      onChange={(e) => {
                        setCreateUserForm({ ...createUserForm, email: e.target.value });
                        // 디바운싱은 useEffect에서 처리
                        // 입력 중에는 체크 상태로 표시
                        if (e.target.value.trim()) {
                          setEmailValidation(prev => ({
                            ...prev,
                            isChecking: true,
                            message: '이메일 확인 중...'
                          }));
                        } else {
                          setEmailValidation({
                            isValid: false,
                            isAvailable: null,
                            isChecking: false,
                            message: ''
                          });
                        }
                      }}
                      placeholder="email@example.com"
                      className={`w-full px-4 py-2 bg-slate-800 border rounded-lg text-slate-300 focus:outline-none transition-colors ${
                        !createUserForm.email 
                          ? 'border-slate-700 focus:border-cyan-500'
                          : emailValidation.isChecking
                          ? 'border-yellow-500/50 focus:border-yellow-500'
                          : emailValidation.isAvailable === true
                          ? 'border-green-500/50 focus:border-green-500'
                          : emailValidation.isAvailable === false
                          ? 'border-red-500/50 focus:border-red-500'
                          : !emailValidation.isValid
                          ? 'border-red-500/50 focus:border-red-500'
                          : 'border-slate-700 focus:border-cyan-500'
                      }`}
                      required
                    />
                    {emailValidation.isChecking && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                      </div>
                    )}
                    {!emailValidation.isChecking && emailValidation.isAvailable === true && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Check className="w-4 h-4 text-green-400" />
                      </div>
                    )}
                  </div>
                  {emailValidation.message && (
                    <p className={`text-xs mt-1 ${
                      emailValidation.isChecking
                        ? 'text-yellow-400'
                        : emailValidation.isAvailable === true
                        ? 'text-green-400'
                        : emailValidation.isAvailable === false
                        ? 'text-red-400'
                        : !emailValidation.isValid
                        ? 'text-red-400'
                        : 'text-slate-400'
                    }`}>
                      {emailValidation.message}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-slate-400 text-sm mb-2">
                    비밀번호 <span className="text-red-400">*</span>
                    <span className="text-slate-500 ml-2">(최소 8자)</span>
                  </label>
                  <input
                    type="password"
                    value={createUserForm.password}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, password: e.target.value })}
                    placeholder="8자 이상 입력"
                    minLength={8}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-slate-400 text-sm mb-2">전화번호</label>
                  <input
                    type="text"
                    value={createUserForm.phoneNumber}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, phoneNumber: e.target.value })}
                    placeholder="010-0000-0000 (선택사항)"
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                
                <div>
                  <label className="block text-slate-400 text-sm mb-2">
                    소속 가맹점 <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={createUserForm.storeId}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, storeId: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500"
                    required
                  >
                    <option value="">가맹점을 선택하세요</option>
                    {stores.map(store => (
                      <option key={store.user_id} value={store.user_id}>{store.username}</option>
                    ))}
                  </select>
                  {stores.length === 0 && (
                    <p className="text-yellow-400 text-xs mt-1">⚠️ 먼저 가맹점을 생성해주세요</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    setShowCreateUserModal(false);
                    setEmailValidation({
                      isValid: false,
                      isAvailable: null,
                      isChecking: false,
                      message: ''
                    });
                  }}
                  disabled={isCreatingUser}
                  className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  취소
                </button>
                <button
                  onClick={handleCreateUser}
                  disabled={isCreatingUser || emailValidation.isAvailable !== true || !createUserForm.email}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg transition-all shadow-lg shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isCreatingUser ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      생성 중...
                    </>
                  ) : (
                    '생성'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}