import { ChevronRight, User, LogOut, CheckCircle, Crown, Bell, BellOff, MessageCircle, Lock, X } from 'lucide-react';
import { Screen } from '../App';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner@2.0.3';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../utils/supabase/client';
import { getGasPolicyForUser, getGasPolicyDescription, type GasPaymentConfig } from '../../utils/biconomy/gasPolicy';
import { getBiconomySettings } from '../../utils/systemSettings';

interface SettingsProps {
  onNavigate: (screen: Screen) => void;
}

export function Settings({ onNavigate }: SettingsProps) {
  const { user, logout } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [userLevel, setUserLevel] = useState<string>('Basic');
  const [gasPolicy, setGasPolicy] = useState<GasPaymentConfig | null>(null);
  const [isLoadingNotification, setIsLoadingNotification] = useState(false);
  const [isBiconomyEnabled, setIsBiconomyEnabled] = useState(false);
  
  // 비밀번호 변경
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // 사용자 레벨 및 가스비 정책 로드
  useEffect(() => {
    const loadUserData = async () => {
      if (!user) return;
      
      try {
        // AuthContext의 user.level 사용
        setUserLevel(user.level || 'Basic');

        // 가스비 정책 로드
        const policy = await getGasPolicyForUser(user.id);
        setGasPolicy(policy);

        // Biconomy 설정 확인
        const biconomySettings = await getBiconomySettings();
        setIsBiconomyEnabled(biconomySettings?.enabled ?? false);
      } catch (error) {
        console.error('User data load error:', error);
      }
    };

    loadUserData();

    // 실시간 가스비 정책 업데이트 구독
    const policySubscription = supabase
      .channel('gas_policy_changes_settings')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gas_sponsorship_policies'
        },
        async (payload) => {
          console.log('Gas policy updated:', payload);
          const policy = await getGasPolicyForUser(user.id);
          setGasPolicy(policy);
          toast.success('가스비 정책이 업데이트되었습니다');
        }
      )
      .subscribe();

    return () => {
      policySubscription.unsubscribe();
    };
  }, [user]);

  // AuthContext의 user.level 변경 감지
  useEffect(() => {
    if (user?.level) {
      setUserLevel(user.level);
    }
  }, [user?.level]);

  // 알림 설정 로드
  useEffect(() => {
    const savedNotification = localStorage.getItem('notifications_enabled');
    if (savedNotification !== null) {
      setNotificationsEnabled(savedNotification === 'true');
    }
  }, []);

  const handleLogout = () => {
    logout();
    toast.success('로그아웃되었습니다');
  };

  const handleToggleNotifications = async () => {
    setIsLoadingNotification(true);
    try {
      const newValue = !notificationsEnabled;
      setNotificationsEnabled(newValue);
      localStorage.setItem('notifications_enabled', String(newValue));
      
      if (newValue) {
        toast.success('알림이 활성화되었습니다');
      } else {
        toast.success('알림이 비활성화되었습니다');
      }
    } catch (error) {
      toast.error('설정 변경에 실패했습니다');
    } finally {
      setIsLoadingNotification(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user) return;

    if (newPassword.length < 8) {
      toast.error('비밀번호는 8자 이상이어야 합니다');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('비밀번호가 일치하지 않습니다');
      return;
    }

    setIsChangingPassword(true);
    try {
      // Backend API로 비밀번호 변경 처리 (RLS 우회)
      const backendUrl = 'https://mzoeeqmtvlnyonicycvg.supabase.co/functions/v1/make-server-b6d5667f';
      const response = await fetch(`${backendUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16b2VlcW10dmxueW9uaWN5Y3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MjIyNzcsImV4cCI6MjA3ODQ5ODI3N30.oo7FsWjthtBtM-Xa1VFJieMGQ4mG__V8w7r9qGBPzaI`,
        },
        body: JSON.stringify({ 
          user_id: user.id,
          new_password: newPassword 
        })
      });

      console.log('Response status:', response.status);
      const responseText = await response.text();
      console.log('Response text:', responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        throw new Error('서버 응답을 처리할 수 없습니다');
      }

      if (!response.ok) {
        throw new Error(data.error || '비밀번호 변경에 실패했습니다');
      }

      toast.success('비밀번호가 변경되었습니다 🎉');
      setShowPasswordChange(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Password change error:', error);
      toast.error(error.message || '비밀번호 변경에 실패했습니다');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const getLevelBadgeStyle = (level: string) => {
    switch (level) {
      case 'VIP':
        return {
          bg: 'rgba(234, 179, 8, 0.1)',
          border: 'rgba(234, 179, 8, 0.3)',
          text: 'rgb(234, 179, 8)',
          icon: 'text-yellow-400'
        };
      case 'Premium':
        return {
          bg: 'rgba(168, 85, 247, 0.1)',
          border: 'rgba(168, 85, 247, 0.3)',
          text: 'rgb(168, 85, 247)',
          icon: 'text-purple-400'
        };
      case 'Standard':
        return {
          bg: 'rgba(6, 182, 212, 0.1)',
          border: 'rgba(6, 182, 212, 0.3)',
          text: 'rgb(6, 182, 212)',
          icon: 'text-cyan-400'
        };
      default:
        return {
          bg: 'rgba(148, 163, 184, 0.1)',
          border: 'rgba(148, 163, 184, 0.3)',
          text: 'rgb(148, 163, 184)',
          icon: 'text-slate-400'
        };
    }
  };

  const levelStyle = getLevelBadgeStyle(userLevel);

  // 가스비 정책 텍스트 가져오기
  const getGasBenefitText = () => {
    if (!gasPolicy) return '로딩 중...';
    return getGasPolicyDescription(gasPolicy);
  };

  // 가스비 지원 상태 가져오기
  const getGasSupportStatus = () => {
    if (!gasPolicy) return { text: '로딩 중...', color: 'text-slate-400' };
    
    if (gasPolicy.sponsor) {
      return { text: '✓ 전액 지원', color: 'text-green-400' };
    }
    
    if (gasPolicy.maxUserPayment && parseFloat(gasPolicy.maxUserPayment) < 999) {
      return { text: '⚡ 분할 지원', color: 'text-yellow-400' };
    }
    
    return { text: '✗ 지원 불가', color: 'text-slate-400' };
  };

  return (
    <div className="space-y-6 pb-20">
      <button 
        onClick={() => onNavigate('home')} 
        className="lg:hidden flex items-center gap-2 text-cyan-400 hover:text-cyan-300"
        style={{ filter: 'drop-shadow(0 0 3px rgba(6, 182, 212, 0.5))' }}
      >
        <ChevronRight className="w-4 h-4 rotate-180" />
        <span>뒤로</span>
      </button>

      {/* PC 제목 */}
      <div className="hidden lg:block">
        <h2 className="text-white text-2xl">설정</h2>
        <p className="text-slate-400 text-sm">계정 정보 및 설정</p>
      </div>

      {/* 프로필 섹션 */}
      <div className="text-center py-6">
        <div 
          className="w-20 h-20 rounded-full bg-slate-800 border-2 border-cyan-500 flex items-center justify-center mx-auto mb-4"
          style={{ boxShadow: '0 0 20px rgba(6, 182, 212, 0.6), inset 0 0 20px rgba(6, 182, 212, 0.2)' }}
        >
          <User className="w-10 h-10 text-cyan-400" style={{ filter: 'drop-shadow(0 0 5px rgba(6, 182, 212, 1))' }} />
        </div>
        <div className="text-white text-xl mb-1">{user?.username}</div>
        <div className="flex items-center justify-center gap-2">
          <div className="text-slate-400 text-sm">{user?.email}</div>
          <div className="group relative">
            <Lock className="w-3.5 h-3.5 text-slate-500" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              이메일은 변경할 수 없습니다
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></div>
            </div>
          </div>
        </div>
        <p className="text-slate-500 text-xs mt-1">※ 이메일은 계정 식별자로 사용되어 변경이 불가능합니다</p>
        
        {/* 1원 계좌인증 상태 배지 */}
        <div className="flex items-center justify-center gap-2 mt-3">
          {user?.account_verified && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm" style={{
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              borderWidth: '1px',
              borderColor: 'rgba(34, 197, 94, 0.3)',
              color: 'rgb(34, 197, 94)'
            }}>
              <CheckCircle className="w-4 h-4" />
              인증완료
            </div>
          )}
          
          {/* 회원 등급 배지 */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm" style={{
            backgroundColor: levelStyle.bg,
            borderWidth: '1px',
            borderColor: levelStyle.border,
            color: levelStyle.text
          }}>
            <Crown className={`w-4 h-4 ${levelStyle.icon}`} />
            {userLevel}
          </div>
        </div>
      </div>

      {/* 회원 혜택 카드 */}
      <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
            <Crown className={`w-5 h-5 ${levelStyle.icon}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-white">내 혜택</h3>
            <p className="text-purple-300 text-sm">{getGasBenefitText()}</p>
          </div>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">회원 등급</span>
            <span className="text-white">{userLevel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">출금 가스비</span>
            <span className={getGasSupportStatus().color}>{getGasSupportStatus().text}</span>
          </div>
        </div>
      </div>

      {/* 계정 관리 섹션 */}
      <div className="space-y-3">
        {/* 계좌 인증 버튼 - 항상 표시 (Biconomy 활성화 여부와 무관) */}
        <button
          onClick={() => onNavigate('account-verification')}
          className="w-full bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30 rounded-xl p-4 hover:border-cyan-500/50 transition-all text-left"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <div className="text-white font-medium">1원 계좌인증</div>
                <div className="text-slate-400 text-sm">
                  {isBiconomyEnabled ? '계좌 1원 입금 인증' : 'KYC 대신 인증 절차를 따릅니다'}
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </div>
        </button>

        <button
          onClick={() => setShowPasswordChange(true)}
          className="w-full bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/30 rounded-xl p-4 hover:border-orange-500/50 transition-all text-left"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                <Lock className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h3 className="text-white">비밀번호 변경</h3>
                <p className="text-slate-400 text-sm">새로운 비밀번호로 변경</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-orange-400" />
          </div>
        </button>
      </div>

      {/* 앱 설정 */}
      <div className="bg-slate-800/50 border border-cyan-500/30 rounded-xl p-4" style={{ boxShadow: '0 0 10px rgba(6, 182, 212, 0.1)' }}>
        <div className="text-slate-300 mb-3">앱 설정</div>
        <div className="space-y-3">
          {/* 알림 토글 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {notificationsEnabled ? (
                <Bell className="w-5 h-5 text-cyan-400" />
              ) : (
                <BellOff className="w-5 h-5 text-slate-500" />
              )}
              <span className="text-slate-300">알림</span>
            </div>
            <button
              onClick={handleToggleNotifications}
              disabled={isLoadingNotification}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                notificationsEnabled ? 'bg-cyan-500' : 'bg-slate-600'
              } ${isLoadingNotification ? 'opacity-50' : ''}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* 고객센터 */}
      <div className="bg-slate-800/50 border border-cyan-500/30 rounded-xl overflow-hidden" style={{ boxShadow: '0 0 10px rgba(6, 182, 212, 0.1)' }}>
        <div className="p-4 pb-2">
          <div className="text-slate-300">고객 지원</div>
        </div>
        <button 
          onClick={() => onNavigate('support')}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700/30 transition-colors border-t border-slate-700/50"
        >
          <div className="flex items-center gap-3">
            <MessageCircle className="w-5 h-5 text-cyan-400" />
            <span className="text-slate-300">실시간 문의</span>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* 버전 정보 */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">앱 버전</span>
          <span className="text-slate-300">1.0.0</span>
        </div>
      </div>

      {/* 로그아웃 버튼 */}
      <button
        onClick={handleLogout}
        className="w-full bg-red-500/20 border border-red-500/50 text-red-400 py-4 rounded-xl hover:bg-red-500/30 transition-all flex items-center justify-center gap-2"
        style={{ boxShadow: '0 0 10px rgba(239, 68, 68, 0.3)' }}
      >
        <LogOut className="w-5 h-5" />
        <span>로그아웃</span>
      </button>

      {/* 비밀번호 변경 모달 */}
      {showPasswordChange && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-orange-500/30 rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg text-white">비밀번호 변경</h2>
              <button
                onClick={() => {
                  setShowPasswordChange(false);
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-slate-300 text-sm mb-2">새 비밀번호</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500/40 focus:bg-slate-800/80 transition-all"
                  placeholder="새 비밀번호 (8자 이상)"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-sm mb-2">비밀번호 확인</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-orange-500/40 focus:bg-slate-800/80 transition-all"
                  placeholder="비밀번호 확인"
                />
              </div>

              <button
                onClick={handleChangePassword}
                disabled={isChangingPassword || !newPassword || !confirmPassword}
                className="w-full bg-orange-500/20 border border-orange-500/50 text-orange-400 py-3 rounded-xl hover:bg-orange-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isChangingPassword ? (
                  <>
                    <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
                    <span>변경 중...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>변경하기</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}