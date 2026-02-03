import { useState, useEffect } from 'react';
import { Activity, Mail, Lock, LogIn, Eye, EyeOff, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { supabase } from '../../utils/supabase/client';
import { checkEmailAvailability } from '../../utils/api/check-email';

export function MobileLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [signUpData, setSignUpData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    referralCode: ''  // 추천인 코드 추가
  });
  const [signUpErrors, setSignUpErrors] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    referralCode: ''
  });
  const [referrerInfo, setReferrerInfo] = useState<{
    name: string;
    role: string;
    email: string;
  } | null>(null);
  const [isCheckingReferral, setIsCheckingReferral] = useState(false);
  const { login } = useAuth();

  // 컴포넌트 마운트 시 저장된 이메일 불러오기
  useEffect(() => {
    const savedRememberMe = localStorage.getItem('rememberMe');
    const savedEmail = localStorage.getItem('savedEmail');
    
    if (savedRememberMe === 'true' && savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setEmailError(false);
    setPasswordError(false);

    try {
      const result = await login(email, password);
      
      // 관리자는 사용자 페이지 로그인 불가
      if (result && result.role === 'admin') {
        toast.error('관리자는 사용자 페이지에 로그인할 수 없습니다', {
          position: 'top-center',
          duration: 3000,
        });
        setIsLoading(false);
        return;
      }
      
      // 로그인 유지 체크 시 localStorage에 저장
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
        localStorage.setItem('savedEmail', email);
      } else {
        localStorage.removeItem('rememberMe');
        localStorage.removeItem('savedEmail');
      }
      
      // toast.success('로그인 성공! 환영합니다 🎉', {
      //   position: 'top-center',
      // });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '로그인에 실패했습니다';
      
      // 에러 타입에 따라 필드 에러 표시
      if (errorMessage.includes('이메일')) {
        setEmailError(true);
      } else if (errorMessage.includes('비밀번호')) {
        setPasswordError(true);
      } else {
        setEmailError(true);
        setPasswordError(true);
      }
      
      // 토스트 메시지 표시
      toast.error(errorMessage, {
        position: 'top-center',
        duration: 3000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsGoogleLoading(true);
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });

      if (error) throw error;
      
      // OAuth는 리다이렉트되므로 로딩 상태 유지
      toast.success('Google 로그인 페이지로 이동합니다...', {
        position: 'top-center'
      });
    } catch (error) {
      console.error('Google 로그인 오류:', error);
      toast.error(error instanceof Error ? error.message : 'Google 로그인 실패', {
        position: 'top-center'
      });
      setIsGoogleLoading(false);
    }
  };

  // 추천인 코드 실시간 검증
  const checkReferralCode = async (code: string) => {
    if (!code.trim()) {
      setReferrerInfo(null);
      return;
    }

    setIsCheckingReferral(true);
    try {
      const { data: referrer, error } = await supabase
        .from('users')
        .select('user_id, role, tenant_id, center_name, username, email')
        .eq('referral_code', code.toLowerCase())
        .in('role', ['center', 'store'])
        .single();

      if (error || !referrer) {
        setReferrerInfo(null);
        setSignUpErrors(prev => ({ ...prev, referralCode: '유효하지 않은 추천인 코드입니다' }));
      } else {
        const roleName = referrer.role === 'center' ? '센터' : '가맹점';
        setReferrerInfo({
          name: referrer.center_name || referrer.username,
          role: roleName,
          email: referrer.email
        });
        setSignUpErrors(prev => ({ ...prev, referralCode: '' }));
      }
    } catch (error) {
      console.error('추천인 코드 확인 오류:', error);
      setReferrerInfo(null);
    } finally {
      setIsCheckingReferral(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    // 오류 초기화
    setSignUpErrors({
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      referralCode: ''
    });

    // 필드별 유효성 검사
    let hasError = false;
    const errors: any = {};

    // 사용자명 검증
    if (!signUpData.username.trim()) {
      errors.username = '사용자명을 입력해주세요';
      hasError = true;
    } else if (signUpData.username.length < 2) {
      errors.username = '사용자명은 2자 이상이어야 합니다';
      hasError = true;
    }

    // 이메일 검증
    if (!signUpData.email.trim()) {
      errors.email = '이메일을 입력해주세요';
      hasError = true;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(signUpData.email)) {
        errors.email = '올바른 이메일 형식이 아닙니다';
        hasError = true;
      }
    }

    // 비밀번호 검증
    if (!signUpData.password) {
      errors.password = '비밀번호를 입력해주세요';
      hasError = true;
    } else if (signUpData.password.length < 8) {
      errors.password = '비밀번호는 8자 이상이어야 합니다';
      hasError = true;
    }

    // 비밀번호 확인 검증
    if (!signUpData.confirmPassword) {
      errors.confirmPassword = '비밀번호 확인을 입력해주세요';
      hasError = true;
    } else if (signUpData.password !== signUpData.confirmPassword) {
      errors.confirmPassword = '비밀번호가 일치하지 않습니다';
      hasError = true;
    }

    // 추천인 코드 검증 (필수)
    if (!signUpData.referralCode.trim()) {
      errors.referralCode = '추천인 코드를 입력해주세요';
      hasError = true;
    }

    if (hasError) {
      setSignUpErrors(errors);
      toast.error('입력 정보를 확인해주세요', {
        duration: 3000,
        position: 'top-center',
      });
      return;
    }

    try {
      setIsLoading(true);

      // 이메일 중복 체크
      const isEmailAvailable = await checkEmailAvailability(signUpData.email);
      console.log('✅ 이메일 사용 가능 여부:', isEmailAvailable);
      
      if (!isEmailAvailable) {
        console.log('❌ 이메일 중복 - 회원가입 중단');
        setSignUpErrors({ ...errors, email: '이미 사용 중인 이메일입니다' });
        toast.error('이미 사용 중인 이메일입니다', {
          duration: 3000,
          position: 'top-center',
          icon: '❌'
        });
        return;
      }
      
      console.log('✅ 이메일 사용 가능 - 회원가입 진행');

      // 추천인 코드 검증 (필수)
      let parentUserId = null;
      let tenantId = null;
      
      const { data: referrer, error: referralError } = await supabase
        .from('users')
        .select('user_id, role, tenant_id, center_name, username, email')
        .eq('referral_code', signUpData.referralCode.toLowerCase())
        .in('role', ['center', 'store'])
        .single();

      if (referralError || !referrer) {
        setSignUpErrors({ ...errors, referralCode: '유효하지 않은 추천인 코드입니다' });
        toast.error('유효하지 않은 추천인 코드입니다', {
          duration: 3000,
          position: 'top-center',
          icon: '⚠️'
        });
        setIsLoading(false);
        return;
      }

      parentUserId = referrer.user_id;
      tenantId = referrer.tenant_id || referrer.user_id;  // tenant_id가 없으면 본인 ID 사용
      
      toast.success(`${referrer.center_name || referrer.username}님의 추천으로 가입합니다 🎉`, {
        duration: 3000,
        position: 'top-center',
      });

      // 1. Supabase Auth에 계정 생성
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: signUpData.email,
        password: signUpData.password,
        options: {
          data: {
            role: 'user',
            username: signUpData.username,
          }
        }
      });

      // Auth 실패해도 계속 진행 (DB 로그인 가능하도록)
      const userId = authData?.user?.id || crypto.randomUUID();
      
      if (authError) {
        console.log('⚠️ Auth 생성 실패 - DB 전용 계정으로 생성:', authError.message);
      }

      // 2. password를 bcrypt hash로 변환 (DB 로그인용)
      const bcrypt = (await import('bcryptjs')).default;
      const passwordHash = await bcrypt.hash(signUpData.password, 10);

      // 3. users 테이블에 사용자 정보 저장 (UPSERT)
      // 일반 회원의 referral_code는 본인의 고유 코드 (이메일 @ 앞부분)
      const referralCode = signUpData.email.split('@')[0].toLowerCase();
      
      const { error: dbError } = await supabase
        .from('users')
        .upsert({
          user_id: userId, // Auth에서 생성된 UUID 또는 새로 생성한 UUID
          email: signUpData.email,
          username: signUpData.username,
          password_hash: passwordHash,  // DB 로그인을 위해 저장
          referral_code: referralCode,  // 본인의 고유 초대 코드 (이메일 @ 앞부분)
          role: 'user',
          level: 'Basic',
          parent_user_id: parentUserId,  // 추천인 UUID (나를 초대한 사람)
          tenant_id: tenantId,            // 소속 센터 UUID
          status: 'active',               // status는 active/suspended/blocked만 허용
          is_active: false,               // 승인 대기 (관리자 활성화 필요)
          kyc_status: 'pending',
        }, {
          onConflict: 'user_id'  // user_id 충돌 시 업데이트
        });

      if (dbError) {
        console.error('DB Error:', dbError);
        throw new Error('데이터베이스 저장 중 오류가 발생했습니다');
      }

      toast.success('회원가입이 완료되었습니다! 로그인해주세요 🎉', {
        duration: 4000,
        position: 'top-center',
      });
      setShowSignUp(false);
      setSignUpData({ username: '', email: '', password: '', confirmPassword: '', referralCode: '' });
      setSignUpErrors({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        referralCode: ''
      });
      
      // 회원가입한 이메일을 로그인 폼에 자동 입력
      setEmail(signUpData.email);
    } catch (error: any) {
      console.error('Sign up error:', error);
      toast.error(error.message || '회원가입 중 오류가 발생했습니다', {
        duration: 4000,
        position: 'top-center',
        icon: '❌'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center p-6">
        {/* Logo Section */}
        <div className="text-center mb-10 animate-fade-in">
          <div 
            className="relative inline-block mb-5"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 to-purple-500 rounded-2xl blur-lg opacity-40 animate-pulse"></div>
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center shadow-xl">
              <Activity className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl text-white mb-1.5 tracking-tight">
            GMS Wallet
          </h1>
          <p className="text-slate-400 text-sm flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>안전하고 쉬운 암호화폐 관리</span>
          </p>
        </div>

        {/* Login Card */}
        <div className="w-full max-w-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Input */}
            <div className="space-y-1.5">
              <label className="block text-slate-300 text-xs pl-0.5">이메일</label>
              <div className="relative">
                <Mail className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 z-10 transition-colors ${
                  emailError ? 'text-red-400' : 'text-slate-500'
                }`} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError(false);
                  }}
                  className={`w-full bg-slate-900/60 border rounded-xl pl-11 pr-4 py-3.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:bg-slate-900/80 transition-all ${
                    emailError 
                      ? 'border-red-500/50 focus:border-red-500/70' 
                      : 'border-slate-700/50 focus:border-cyan-500/40'
                  }`}
                  placeholder="이메일을 입력하세요"
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="block text-slate-300 text-xs pl-0.5">비밀번호</label>
              <div className="relative">
                <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 z-10 transition-colors ${
                  passwordError ? 'text-red-400' : 'text-slate-500'
                }`} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(false);
                  }}
                  className={`w-full bg-slate-900/60 border rounded-xl pl-11 pr-11 py-3.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:bg-slate-900/80 transition-all ${
                    passwordError 
                      ? 'border-red-500/50 focus:border-red-500/70' 
                      : 'border-slate-700/50 focus:border-cyan-500/40'
                  }`}
                  placeholder="비밀번호를 입력하세요"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-cyan-400 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4.5 h-4.5" />
                  ) : (
                    <Eye className="w-4.5 h-4.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center text-xs pt-0.5">
              <label className="flex items-center gap-2 text-slate-400 cursor-pointer hover:text-slate-300 transition-colors">
                <input 
                  type="checkbox" 
                  className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/20 focus:ring-offset-0" 
                  checked={rememberMe} 
                  onChange={(e) => setRememberMe(e.target.checked)} 
                />
                <span>로그인 유지</span>
              </label>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-slate-900/50 border border-cyan-500 text-cyan-400 py-3.5 rounded-xl hover:bg-cyan-500/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium mt-6 active:scale-[0.99]"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>로그인 중...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>로그인</span>
                </>
              )}
            </button>
          </form>

          {/* Google Login Button */}
          <button
            type="button"
            disabled={isGoogleLoading}
            onClick={handleGoogleLogin}
            className="w-full bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 py-3.5 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-sm font-medium mt-3 active:scale-[0.99] shadow-sm"
          >
            {isGoogleLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-700 border-t-transparent rounded-full animate-spin"></div>
                <span>로그인 중...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Google로 계속하기</span>
              </>
            )}
          </button>

          {/* Sign Up Link */}
          <div className="mt-6 text-center">
            <p className="text-slate-400 text-xs">
              계정이 없으신가요?{' '}
              <button className="text-cyan-400 hover:text-cyan-300 transition-colors font-medium" onClick={() => setShowSignUp(true)}>
                회원가입
              </button>
            </p>
          </div>

          {/* Security Badge */}
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500">
            <div className="w-2 h-2 rounded-full bg-green-400/50 animate-pulse"></div>
            <span>256-bit SSL 보안 연결</span>
          </div>
        </div>
      </div>

      {/* Sign Up Modal */}
      {showSignUp && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center p-6 animate-fade-in overflow-y-auto"
          onClick={() => setShowSignUp(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 w-full max-w-sm shadow-2xl my-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg text-white">회원가입</h2>
              <button
                onClick={() => setShowSignUp(false)}
                className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <label className="block text-slate-300 text-xs mb-1.5">사용자명</label>
                <input
                  type="text"
                  value={signUpData.username}
                  onChange={(e) => setSignUpData({ ...signUpData, username: e.target.value })}
                  className={`w-full bg-slate-800/60 border rounded-xl px-4 py-3.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:bg-slate-800/80 transition-all ${
                    signUpErrors.username 
                      ? 'border-red-500/70 focus:border-red-500' 
                      : 'border-slate-700/50 focus:border-cyan-500/40'
                  }`}
                  placeholder="사용자명을 입력하세요"
                  required
                />
                {signUpErrors.username && (
                  <p className="text-red-400 text-xs mt-1 pl-0.5 flex items-center gap-1">
                    <span>⚠️</span>
                    <span>{signUpErrors.username}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-slate-300 text-xs mb-1.5">이메일</label>
                <div className="relative">
                  <Mail className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 z-10 transition-colors ${
                    signUpErrors.email ? 'text-red-400' : 'text-slate-500'
                  }`} />
                  <input
                    type="email"
                    value={signUpData.email}
                    onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })}
                    className={`w-full bg-slate-800/60 border rounded-xl pl-11 pr-4 py-3.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:bg-slate-800/80 transition-all ${
                      signUpErrors.email 
                        ? 'border-red-500/70 focus:border-red-500' 
                        : 'border-slate-700/50 focus:border-cyan-500/40'
                    }`}
                    placeholder="이메일을 입력하세요"
                    required
                  />
                </div>
                {signUpErrors.email && (
                  <p className="text-red-400 text-xs mt-1 pl-0.5 flex items-center gap-1">
                    <span>⚠️</span>
                    <span>{signUpErrors.email}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-slate-300 text-xs mb-1.5">비밀번호</label>
                <div className="relative">
                  <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 z-10 transition-colors ${
                    signUpErrors.password ? 'text-red-400' : 'text-slate-500'
                  }`} />
                  <input
                    type="password"
                    value={signUpData.password}
                    onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })}
                    className={`w-full bg-slate-800/60 border rounded-xl pl-11 pr-4 py-3.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:bg-slate-800/80 transition-all ${
                      signUpErrors.password 
                        ? 'border-red-500/70 focus:border-red-500' 
                        : 'border-slate-700/50 focus:border-cyan-500/40'
                    }`}
                    placeholder="비밀번호 (8자 이상)"
                    required
                  />
                </div>
                {signUpErrors.password && (
                  <p className="text-red-400 text-xs mt-1 pl-0.5 flex items-center gap-1">
                    <span>⚠️</span>
                    <span>{signUpErrors.password}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-slate-300 text-xs mb-1.5">비밀번호 확인</label>
                <div className="relative">
                  <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 z-10 transition-colors ${
                    signUpErrors.confirmPassword ? 'text-red-400' : 'text-slate-500'
                  }`} />
                  <input
                    type="password"
                    value={signUpData.confirmPassword}
                    onChange={(e) => setSignUpData({ ...signUpData, confirmPassword: e.target.value })}
                    className={`w-full bg-slate-800/60 border rounded-xl pl-11 pr-4 py-3.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:bg-slate-800/80 transition-all ${
                      signUpErrors.confirmPassword 
                        ? 'border-red-500/70 focus:border-red-500' 
                        : 'border-slate-700/50 focus:border-cyan-500/40'
                    }`}
                    placeholder="비밀번호 확인"
                    required
                  />
                </div>
                {signUpErrors.confirmPassword && (
                  <p className="text-red-400 text-xs mt-1 pl-0.5 flex items-center gap-1">
                    <span>⚠️</span>
                    <span>{signUpErrors.confirmPassword}</span>
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-slate-300 text-xs mb-1.5">
                  추천인코드
                </label>
                <div className="relative">
                  <Users className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 z-10 transition-colors ${
                    signUpErrors.referralCode ? 'text-red-400' : 'text-slate-500'
                  }`} />
                  <input
                    type="text"
                    value={signUpData.referralCode}
                    onChange={(e) => {
                      setSignUpData({ ...signUpData, referralCode: e.target.value });
                      checkReferralCode(e.target.value);
                    }}
                    className={`w-full bg-slate-800/60 border rounded-xl pl-11 pr-4 py-3.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:bg-slate-800/80 transition-all ${
                      signUpErrors.referralCode 
                        ? 'border-red-500/70 focus:border-red-500' 
                        : 'border-slate-700/50 focus:border-cyan-500/40'
                    }`}
                    placeholder="추천인코드 입력"
                    required
                  />
                </div>
                {signUpErrors.referralCode && (
                  <p className="text-red-400 text-xs mt-1 pl-0.5 flex items-center gap-1">
                    <span>⚠️</span>
                    <span>{signUpErrors.referralCode}</span>
                  </p>
                )}
                {isCheckingReferral && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-400 bg-slate-800/40 rounded-lg px-3 py-2">
                    <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                    <span>추천인 코드 확인 중...</span>
                  </div>
                )}
                {!isCheckingReferral && referrerInfo && (
                  <div className="mt-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <span className="text-lg mt-0.5">✓</span>
                      <div className="flex-1">
                        <p className="text-cyan-400 text-xs mb-0.5">
                          소속 확인됨
                        </p>
                        <p className="text-white text-sm">
                          {referrerInfo.name}
                        </p>
                        <p className="text-slate-400 text-xs mt-0.5">
                          {referrerInfo.role}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {!isCheckingReferral && !referrerInfo && !signUpErrors.referralCode && signUpData.referralCode && (
                  <p className="text-slate-500 text-xs mt-1 pl-0.5">
                    추천코드는 관리자에게 문의하세요
                  </p>
                )}
              </div>
              
              <button
                type="submit"
                className="w-full bg-slate-900/50 border border-cyan-500 text-cyan-400 py-3.5 rounded-xl hover:bg-cyan-500/10 transition-all duration-200 text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.99] mt-2"
              >
                회원가입
              </button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }

        /* Touch feedback */
        button:active {
          transform: scale(0.98);
        }

        /* Smooth transitions */
        * {
          -webkit-tap-highlight-color: transparent;
        }

        /* Custom checkbox */
        input[type="checkbox"]:checked {
          background-image: url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e");
        }
      `}</style>
    </div>
  );
}