import { useState, useEffect } from 'react';
import { ArrowLeft, Send, CheckCircle, Clock, XCircle, Info, Wallet, AlertCircle } from 'lucide-react';
import { Screen } from '../App';
import { supabase } from '../../utils/supabase/client';
import { useAuth } from '../../contexts/AuthContext';
import { getBiconomySettings } from '../../utils/systemSettings';
import { toast } from 'sonner';

// Supabase URL and Anon Key (hardcoded as per client.ts)
const SUPABASE_URL = 'https://mzoeeqmtvlnyonicycvg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16b2VlcW10dmxueW9uaWN5Y3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MjIyNzcsImV4cCI6MjA3ODQ5ODI3N30.oo7FsWjthtBtM-Xa1VFJieMGQ4mG__V8w7r9qGBPzaI';

interface AccountVerificationProps {
  onNavigate: (screen: Screen) => void;
}

interface VerificationRequest {
  verification_id: string;
  user_id: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  verification_code?: string;
  status?: 'pending' | 'verified' | 'rejected' | null;
  smart_account_address?: string;
  created_at: string;
  verified_at?: string;
  rejection_reason?: string;
}

export function AccountVerification({ onNavigate }: AccountVerificationProps) {
  const { user } = useAuth();
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [userInputCode, setUserInputCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<VerificationRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [codeVerified, setCodeVerified] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [isBiconomyEnabled, setIsBiconomyEnabled] = useState(false);

  // 기존 인증 상태 확인
  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getBiconomySettings();
      setIsBiconomyEnabled(settings?.enabled ?? false);
    };
    
    loadSettings();
    fetchVerificationStatus();

    // 실시간 업데이트 구독
    const channel = supabase
      .channel('user_verification_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'account_verifications',
          filter: `user_id=eq.${user?.id}`
        },
        (payload) => {
          console.log('Verification status changed:', payload);
          fetchVerificationStatus();
          
          // 관리자가 승인/거부했을 때 알림
          if ((payload.new as any)?.status === 'verified') {
            toast.success('1원 계좌인증이 승인되었습니다! 지갑이 활성화되었습니다.');
          } else if ((payload.new as any)?.status === 'rejected') {
            toast.error('1원 계좌인증이 거부되었습니다.');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchVerificationStatus = async () => {
    if (!user) return;

    // 관리자 계정(master, center, agency, store, admin)은 자동으로 인증 완료 상태로 설정
    if (['master', 'center', 'agency', 'store', 'admin'].includes(user.role)) {
      setVerificationStatus({
        verification_id: '',
        user_id: user.id,
        bank_name: '-',
        account_number: '-',
        account_holder: '-',
        status: 'verified',
        smart_account_address: '-',
        created_at: new Date().toISOString(),
        verified_at: new Date().toISOString(),
      });
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('account_verifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setVerificationStatus(data);
        // 이미 pending이면 검증 완료 상태
        if (data.status === 'pending') {
          setCodeVerified(true);
        }
      }
    } catch (error: any) {
      console.error('Verification status fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!bankName || !accountNumber || !accountHolder) {
      toast.error('모든 필수 정보를 입력해주세요');
      return;
    }

    // 계좌번호 형식 검증
    if (!/^\d{10,14}$/.test(accountNumber.replace(/-/g, ''))) {
      toast.error('올바른 계좌번호 형식이 아닙니다');
      return;
    }

    // 중복 제출 방지
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Edge Function 호출
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/make-server-b6d5667f/api/account-verification/request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            user_id: user?.id,
            bank_name: bankName,
            account_number: accountNumber,
            account_holder: accountHolder,
          }),
        }
      );

      console.log('🔍 Response Status:', response.status);
      console.log('🔍 Response OK:', response.ok);
      console.log('🔍 Response Headers:', Object.fromEntries(response.headers.entries()));

      const result = await response.json();
      console.log('🔍 Response Body:', result);

      if (!response.ok) {
        console.error('❌ ❌ Error Code:', result.code || 'UNKNOWN');
        console.error('❌ ❌ Error Message:', result.error || 'Unknown error');
        console.error('❌ ❌ Full Error Object:', result);
        
        // OAuth 토큰 오류는 무시하고 성공 처리 (백엔드에서 이미 DB에 저장됨)
        if (result.code === 'OAUTH_TOKEN_ERROR') {
          console.log('⚠️ OAuth 오류 무시, 관리자 수동 승인 모드로 진행');
          toast.success('승인 요청이 완료되었습니다');
          toast.info('관리자 검토를 기다려주세요', { duration: 5000 });
          
          // 상태 새로고침
          await fetchVerificationStatus();
          return;
        }
        
        throw new Error(result.error || '1원 계좌인증 요청 실패');
      }

      // 임시 시나리오: API에서 받은 authCode를 표시 (디버깅용)
      if (result.authCode) {
        toast.success(`승인 요청 완료! (인증코드: ${result.authCode})`);
        toast.info('관리자 검토를 기다려주세요', { duration: 5000 });
      } else {
        toast.success('승인 요청이 완료되었습니다');
        toast.info('관리자 검토를 기다려주세요', { duration: 5000 });
      }
      
      // 상태 새로고침
      await fetchVerificationStatus();
      
    } catch (error: any) {
      console.error('❌ ❌ Verification submit error:', error);
      console.error('❌ ❌ Error name:', error.name);
      console.error('❌ ❌ Error message:', error.message);
      console.error('❌ ❌ Error stack:', error.stack);
      toast.error(error.message || '신청 중 오류가 발생했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 인증번호 입력 시 즉시 검증
  useEffect(() => {
    if (!verificationStatus || !verificationStatus.verification_code) return;
    if (!userInputCode.trim()) {
      setCodeVerified(false);
      setCodeError('');
      return;
    }

    // 즉시 검증
    if (userInputCode.trim() === verificationStatus.verification_code) {
      setCodeVerified(true);
      setCodeError('');
    } else {
      setCodeVerified(false);
      setCodeError('코드가 일치하지 않습니다');
    }
  }, [userInputCode, verificationStatus]);

  // 승인 요청 제출
  const handleSubmitCode = async () => {
    if (!verificationStatus || !codeVerified) {
      toast.error('인증번호를 확인해주세요');
      return;
    }

    setIsSubmitting(true);

    try {
      // Edge Function 호출
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/make-server-b6d5667f/api/account-verification/submit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            verification_id: verificationStatus.verification_id,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '승인 요청 실패');
      }

      toast.success('관리자 승인을 요청했습니다');
      
      // 상태 새로고침
      await fetchVerificationStatus();
      setUserInputCode('');

    } catch (error: any) {
      console.error('Code submit error:', error);
      toast.error(error.message || '승인 요청 중 오류가 발생했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 border border-green-500/30">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-green-400">인증 완료</span>
          </div>
        );
      case 'pending':
        return (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500/20 border border-yellow-500/30">
            <Clock className="w-5 h-5 text-yellow-400" />
            <span className="text-yellow-400">검토 중</span>
          </div>
        );
      case 'rejected':
        return (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30">
            <XCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">거부됨</span>
          </div>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-400">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => onNavigate('settings')}
          className="lg:hidden w-10 h-10 rounded-full bg-slate-800/50 border border-cyan-500/30 flex items-center justify-center hover:bg-cyan-500/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-cyan-400" />
        </button>
        <div>
          <h1 className="text-white text-xl lg:text-2xl">1원 계좌인증</h1>
          <p className="text-slate-400 text-sm">KYC 대신 1원 계좌인증으로 간편하게</p>
        </div>
      </div>

      {/* 인증 상태 카드 */}
      {verificationStatus && (
        <div className="relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/30 to-purple-500/30 rounded-2xl blur"></div>
          <div className="relative bg-slate-800/90 border border-cyan-500/50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white">인증 상태</h3>
              {getStatusBadge(verificationStatus.status || 'pending')}
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">은행</span>
                <span className="text-white">{verificationStatus.bank_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">계좌번호</span>
                <span className="text-white">{verificationStatus.account_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">예금주</span>
                <span className="text-white">{verificationStatus.account_holder}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">신청일</span>
                <span className="text-white">
                  {new Date(verificationStatus.created_at).toLocaleDateString('ko-KR')}
                </span>
              </div>

              {verificationStatus.status === 'verified' && verificationStatus.smart_account_address && (
                <>
                  <div className="pt-3 border-t border-slate-700/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="w-4 h-4 text-cyan-400" />
                      <span className="text-cyan-400 text-sm">{isBiconomyEnabled ? 'Smart Account' : '지갑 주소'}</span>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-3">
                      <p className="text-slate-300 text-xs break-all font-mono">
                        {verificationStatus.smart_account_address}
                      </p>
                    </div>
                  </div>
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                    <p className="text-green-400 text-sm">
                      ✅ {isBiconomyEnabled ? '코인 지갑이 자동으로 생성되었습니다!' : '계좌 인증이 완료되었습니다!'}
                    </p>
                  </div>
                </>
              )}

              {verificationStatus.status === 'rejected' && verificationStatus.rejection_reason && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-red-400 text-sm mb-1">거부 사유:</p>
                  <p className="text-slate-300 text-sm">{verificationStatus.rejection_reason}</p>
                </div>
              )}

              {verificationStatus.status === 'pending' && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <p className="text-yellow-400 text-sm">
                    ⏳ 관리자 검토 중입니다. 잠시만 기다려주세요.
                  </p>
                  {verificationStatus.verification_code && (
                    <p className="text-slate-400 text-xs mt-2">
                      인증코드: {verificationStatus.verification_code} (참고용)
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 신규 신청 또는 재신청 */}
      {(!verificationStatus || verificationStatus.status === 'rejected') && (
        <>
          {/* 입력 폼 */}
          <div className="space-y-4">
            {/* 은행 선택 */}
            <div>
              <label className="block text-slate-300 mb-3">은행 선택</label>
              <select
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full bg-slate-800/50 border border-cyan-500/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                style={{
                  colorScheme: 'dark'
                }}
              >
                <option value="" className="bg-slate-800 text-slate-400">은행을 선택하세요</option>
                <option value="한국은행" className="bg-slate-800 text-white">한국은행</option>
                <option value="산업은행" className="bg-slate-800 text-white">산업은행</option>
                <option value="IBK기업은행" className="bg-slate-800 text-white">IBK기업은행</option>
                <option value="KB국민은행" className="bg-slate-800 text-white">KB국민은행</option>
                <option value="수협은행" className="bg-slate-800 text-white">수협은행</option>
                <option value="수출입은행" className="bg-slate-800 text-white">수출입은행</option>
                <option value="NH농협은행" className="bg-slate-800 text-white">NH농협은행</option>
                <option value="지역농축협" className="bg-slate-800 text-white">지역농축협</option>
                <option value="우리은행" className="bg-slate-800 text-white">우리은행</option>
                <option value="한국씨티은행" className="bg-slate-800 text-white">한국씨티은행</option>
                <option value="대구은행" className="bg-slate-800 text-white">대구은행</option>
                <option value="부산은행" className="bg-slate-800 text-white">부산은행</option>
                <option value="광주은행" className="bg-slate-800 text-white">광주은행</option>
                <option value="제주은행" className="bg-slate-800 text-white">제주은행</option>
                <option value="전북은행" className="bg-slate-800 text-white">전북은행</option>
                <option value="경남은행" className="bg-slate-800 text-white">경남은행</option>
                <option value="우리카드" className="bg-slate-800 text-white">우리카드</option>
                <option value="하나카드" className="bg-slate-800 text-white">하나카드</option>
                <option value="새마을금고" className="bg-slate-800 text-white">새마을금고</option>
                <option value="신협" className="bg-slate-800 text-white">신협</option>
                <option value="저축은행" className="bg-slate-800 text-white">저축은행</option>
                <option value="모건스탠리은행" className="bg-slate-800 text-white">모건스탠리은행</option>
                <option value="HSBC은행" className="bg-slate-800 text-white">HSBC은행</option>
                <option value="도이치은행" className="bg-slate-800 text-white">도이치은행</option>
                <option value="제이피모간체이스은행" className="bg-slate-800 text-white">제이피모간체이스은행</option>
                <option value="미즈호은행" className="bg-slate-800 text-white">미즈호은행</option>
                <option value="엠유에프지은행" className="bg-slate-800 text-white">엠유에프지은행</option>
                <option value="BOA은행" className="bg-slate-800 text-white">BOA은행</option>
                <option value="비엔피파리바은행" className="bg-slate-800 text-white">비엔피파리바은행</option>
                <option value="중국공상은행" className="bg-slate-800 text-white">중국공상은행</option>
                <option value="산림조합" className="bg-slate-800 text-white">산림조합</option>
                <option value="대화은행" className="bg-slate-800 text-white">대화은행</option>
                <option value="교보증권" className="bg-slate-800 text-white">교보증권</option>
                <option value="중국건설은행" className="bg-slate-800 text-white">중국건설은행</option>
                <option value="우체국" className="bg-slate-800 text-white">우체국</option>
                <option value="신한금융투자" className="bg-slate-800 text-white">신한금융투자</option>
                <option value="KB증권" className="bg-slate-800 text-white">KB증권</option>
                <option value="하나은행" className="bg-slate-800 text-white">하나은행</option>
                <option value="신한은행" className="bg-slate-800 text-white">신한은행</option>
                <option value="K뱅크" className="bg-slate-800 text-white">K뱅크</option>
                <option value="카카오뱅크" className="bg-slate-800 text-white">카카오뱅크</option>
                <option value="유안타증권" className="bg-slate-800 text-white">유안타증권</option>
              </select>
            </div>

            {/* 계좌번호 */}
            <div>
              <label className="block text-slate-300 mb-3">계좌번호</label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="123-456-789012"
                className="w-full bg-slate-800/50 border border-cyan-500/30 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            {/* 예금주명 */}
            <div>
              <label className="block text-slate-300 mb-3">예금주명</label>
              <input
                type="text"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                placeholder="홍길동"
                className="w-full bg-slate-800/50 border border-cyan-500/30 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          {/* 신청 버튼 */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !bankName || !accountNumber || !accountHolder}
            className="w-full bg-slate-800/50 border-2 border-cyan-500/50 text-cyan-400 py-5 rounded-2xl flex items-center justify-center gap-2 hover:bg-cyan-500/10 hover:border-cyan-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            <Send className="w-6 h-6" />
            {isSubmitting ? '신청 중...' : verificationStatus?.status === 'rejected' ? '재신청하기' : '인증 신청'}
          </button>

          {/* 절차 안내 */}
          <div className="relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 rounded-xl blur"></div>
            <div className="relative bg-slate-800/50 border border-purple-500/30 rounded-xl p-4">
              <h4 className="text-purple-400 mb-3">인증 절차 (임시 테스트 버전)</h4>
              <ol className="space-y-2 text-slate-300 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 shrink-0">1.</span>
                  <span>계좌 정보를 입력하고 신청</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 shrink-0">2.</span>
                  <span>테스트 API에서 인증코드 자동 생성 및 검증</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 shrink-0">3.</span>
                  <span className="text-yellow-400">승인 요청 상태로 자동 변경됨 (코드 입력 불필요)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 shrink-0">4.</span>
                  <span>관리자가 계좌 확인 후 승인</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 shrink-0">5.</span>
                  <span className="text-cyan-400">{isBiconomyEnabled ? 'Smart Account 자동 생성 및 지갑 활성화 ✨' : '계좌 인증 완료 및 서비스 활성화 ✨'}</span>
                </li>
              </ol>
              <div className="mt-3 pt-3 border-t border-purple-500/30">
                <p className="text-purple-400 text-xs">
                  💡 프로덕션에서는 실제 1원 입금 후 통장 확인 절차가 필요합니다.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 코드 제출 폼 - pending 상태에서는 표시하지 않음 (임시 시나리오) */}
      {/* 이미 자동으로 승인 대기 상태이므로 추가 입력 불필요 */}

      {/* 코드 입력 폼 - status가 없을 때 (인증 요청 직후) - 더 이상 사용되지 않음 */}
    </div>
  );
}