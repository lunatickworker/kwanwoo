import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../utils/supabase/client';
import { SUPABASE_CONFIG } from '../utils/config';
import bcrypt from 'bcryptjs';

interface User {
  id: string;
  email: string;
  username: string;
  role: 'master' | 'center' | 'agency' | 'store' | 'admin' | 'user';
  level?: string;
  templateId?: string; // 템플릿 ID 추가
  centerName?: string; // 센터 이름 추가
  logoUrl?: string | null; // 로고 URL 추가
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, isAdminPage: boolean) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuthSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await handleOAuthLogin(session.user);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('user');
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  // 로그인 후 백그라운드 동기화 (60초마다, 실패 시 지수 백오프)
  useEffect(() => {
    if (!user) return;

    let syncInterval: NodeJS.Timeout | null = null;
    let retryCount = 0;
    const maxRetry = 3;

    const startSync = (delayMs: number = 60000) => {
      syncInterval = setInterval(async () => {
        try {
          await refreshUser();
          retryCount = 0; // 성공 시 재시도 카운트 리셋
        } catch (err) {
          retryCount++;
          console.warn(`⚠️ Background sync failed (${retryCount}/${maxRetry}):`, err);
          
          // 3회 실패하면 동기화 중단 (캐시 사용)
          if (retryCount >= maxRetry && syncInterval) {
            clearInterval(syncInterval);
            console.log('🛑 Background sync stopped after 3 failures');
          }
        }
      }, delayMs);
    };

    startSync(60000); // 초기: 60초마다 동기화

    return () => {
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [user]);

  // 로그인 후 is_active 상태 실시간 모니터링 - 상태 변경 시 즉시 로그아웃
  useEffect(() => {
    if (!user) return;

    // 관리자만 모니터링 (center, agency, store)
    if (!['center', 'agency', 'store'].includes(user.role)) {
      return;
    }

    console.log(`🔐 [AuthContext] 관리자 상태 모니터링 시작 - User: ${user.id}`);

    // 실시간 구독: 사용자 상태 변경 감지
    const statusSub = supabase
      .channel(`user_status_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `user_id=eq.${user.id}`
        },
        (payload: any) => {
          const updatedData = payload.new;
          console.log('🔐 [AuthContext] 사용자 상태 변경 감지:', updatedData);

          // is_active가 false로 변경된 경우
          if (updatedData.is_active === false) {
            console.log('🔐 [AuthContext] 계정이 비활성화됨 - 즉시 로그아웃', updatedData.user_id);
            logout();
            // 선택적: 로그인 페이지로 리다이렉트
            window.location.hash = '#admin/login';
          }

          // status가 'inactive'로 변경된 경우
          if (updatedData.status === 'inactive' || updatedData.status === 'disabled') {
            console.log('🔐 [AuthContext] 계정 상태가 변경됨 - 즉시 로그아웃', updatedData);
            logout();
            window.location.hash = '#admin/login';
          }
        }
      )
      .subscribe();

    return () => {
      statusSub.unsubscribe();
    };
  }, [user]);

  const checkAuthSession = async () => {
    try {
      const sessionPromise = supabase.auth.getSession();
      
      const savedUser = localStorage.getItem('user');
      const savedUserTimestamp = localStorage.getItem('userTimestamp');
      
      // ✅ localStorage 데이터 검증 + 유효성 체크 (5분)
      let validatedUser = null;
      const CACHE_VALIDITY_MS = 5 * 60 * 1000; // 5분
      
      if (savedUser) {
        try {
          validatedUser = JSON.parse(savedUser);
          // 필수 필드 확인
          if (!validatedUser.id || !validatedUser.email || !validatedUser.role) {
            console.warn('⚠️ Invalid cached user data, clearing:', validatedUser);
            localStorage.removeItem('user');
            localStorage.removeItem('userTimestamp');
            validatedUser = null;
          }
        } catch (parseError) {
          console.warn('❌ Failed to parse cached user:', parseError);
          localStorage.removeItem('user');
          localStorage.removeItem('userTimestamp');
          validatedUser = null;
        }
      }
      
      // 캐시가 유효한지 확인 (5분 이내면 DB 조회 스킵)
      let useCache = false;
      if (validatedUser && savedUserTimestamp) {
        const cacheAge = Date.now() - parseInt(savedUserTimestamp, 10);
        if (cacheAge < CACHE_VALIDITY_MS) {
          console.log(`✅ 캐시 사용 (${Math.round(cacheAge / 1000)}초 경과)`);
          setUser(validatedUser);
          setIsLoading(false);
          useCache = true;
        }
      }
      
      // 캐시가 유효하면 DB 조회 스킵
      if (useCache) {
        return;
      }
      
      if (validatedUser) {
        try {
          // DB에서 최신 정보 확인 (타임아웃: 12초, 재시도: 2회)
          let dbUser = null;
          let dbError = null;
          
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              const result = await Promise.race([
                supabase
                  .from('users')
                  .select('user_id, email, username, role, level, template_id, center_name, logo_url, status, is_active')
                  .eq('user_id', validatedUser.id)
                  .maybeSingle(),
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('DB query timeout')), 12000) // 12초로 연장
                ) as any
              ]);
              
              dbUser = result.data;
              dbError = result.error;
              
              if (!dbError) {
                break; // 성공하면 재시도 중단
              }
            } catch (attemptError) {
              if (attempt < 2) {
                console.log(`⚠️ DB 조회 시도 ${attempt} 실패, 재시도 중...`);
                // 100ms 대기 후 재시도
                await new Promise(resolve => setTimeout(resolve, 100));
              } else {
                throw attemptError;
              }
            }
          }
          
          if (dbUser) {
            // 일반 회원 is_active 체크만 함 (관리자는 is_active 관계없이 로그인 허용)
            if (dbUser.role === 'user' && !dbUser.is_active) {
              // 승인이 취소된 경우 로그아웃
              localStorage.removeItem('user');
              localStorage.removeItem('userTimestamp');
              await supabase.auth.signOut();
              setIsLoading(false);
              return;
            }
            
            // 최신 정보로 업데이트
            const updatedUser: User = {
              id: dbUser.user_id,
              email: dbUser.email,
              username: dbUser.username,
              role: dbUser.role || 'user',
              level: dbUser.level,
              templateId: dbUser.template_id,
              centerName: dbUser.center_name,
              logoUrl: dbUser.logo_url,
            };
            
            setUser(updatedUser);
            localStorage.setItem('user', JSON.stringify(updatedUser));
            localStorage.setItem('userTimestamp', Date.now().toString()); // 타임스탠프 저장
          } else {
            // DB에 사용자가 없으면 로그아웃
            localStorage.removeItem('user');
            localStorage.removeItem('userTimestamp');
            await supabase.auth.signOut();
          }
          
          setIsLoading(false);
        } catch (error: any) {
          // 타임아웃 또는 네트워크 에러: localStorage의 사용자 정보로 진행
          const isTimeout = error?.message?.includes('timeout');
          console.warn(`⏱️ DB 조회 실패 (${isTimeout ? '타임아웃' : '네트워크 에러'}) - 캐시 사용:`, error?.message);
          console.log('📦 Using cached user:', validatedUser.email);
          setUser(validatedUser);
          localStorage.setItem('userTimestamp', Date.now().toString()); // 타임스탠프 갱신
          setIsLoading(false);
        }
      } else {
        // 캐시된 사용자 정보 없음 → 빠르게 진행
        setIsLoading(false);
      }

      const { data: { session } } = await sessionPromise;
      
      if (session?.user) {
        await handleOAuthLogin(session.user);
      }
    } catch (error) {
      console.error('Auth session check error:', error);
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = async (authUser: any) => {
    try {
      // 1. user_id로 먼저 확인 (Auth ID와 DB ID가 동일해야 함)
      let { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('user_id, email, username, role, level, template_id, center_name, logo_url, status, is_active')
        .eq('user_id', authUser.id)
        .maybeSingle();

      // 2. user_id로 없으면 email로 확인
      if (!existingUser && !fetchError) {
        const result = await supabase
          .from('users')
          .select('user_id, email, username, role, level, template_id, center_name, logo_url, status, is_active')
          .eq('email', authUser.email)
          .maybeSingle();
        
        existingUser = result.data;
        fetchError = result.error;
      }

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw new Error('사용자 정보 조회 실패');
      }

      // 3. 기존 사용자가 있으면 바로 로그인 처리
      if (existingUser) {
        if (existingUser.status !== 'active') {
          throw new Error('관리자에게 문의하세요.');
        }

        // is_active 체크는 일반 회원만 (관리자는 체크 안 함)
        if (existingUser.role === 'user' && !existingUser.is_active) {
          await supabase.auth.signOut();
          throw new Error('회원가입 승인 대기 중입니다. 관리자의 승인을 기다려주세요.');
        }

        const loggedInUser: User = {
          id: existingUser.user_id,
          email: existingUser.email,
          username: existingUser.username,
          role: existingUser.role || 'user',
          level: existingUser.level,
          templateId: existingUser.template_id,
          centerName: existingUser.center_name,
          logoUrl: existingUser.logo_url,
        };

        setUser(loggedInUser);
        localStorage.setItem('user', JSON.stringify(loggedInUser));
        return;
      }

      // 4. 신규 사용자 - users 테이블에 생성
      const metadataRole = authUser.user_metadata?.role;
      if (metadataRole && ['center', 'agency', 'store', 'admin', 'master'].includes(metadataRole)) {
        // 관리자 role인 경우 자동 삽입하지 않음 (센터 생성 API에서 처리)
        // ⏱️ 1초 딜레이 후 DB에서 조회 (센터 생성 API 완료 대기)
        try {
          await new Promise<void>((resolve) => {
            setTimeout(async () => {
              try {
                const { data: adminUser } = await supabase
                  .from('users')
                  .select('user_id, email, username, role, level, template_id, center_name, logo_url, status')
                  .eq('user_id', authUser.id)
                  .maybeSingle();
                
                if (adminUser) {
                  const loggedInUser: User = {
                    id: adminUser.user_id,
                    email: adminUser.email,
                    username: adminUser.username,
                    role: adminUser.role || 'user',
                    level: adminUser.level,
                    templateId: adminUser.template_id,
                    centerName: adminUser.center_name,
                    logoUrl: adminUser.logo_url,
                  };
                  
                  setUser(loggedInUser);
                  localStorage.setItem('user', JSON.stringify(loggedInUser));
                }
              } catch (error) {
                console.error('Admin user lookup failed:', error);
              }
              resolve();
            }, 1000);
          });
        } catch (error) {
          console.error('Admin user wait error:', error);
        }
        return;
      }
      
      const newUser = {
        user_id: authUser.id,
        email: authUser.email,
        username: authUser.user_metadata?.full_name || authUser.email.split('@')[0],
        role: 'user',
        status: 'active',
        is_active: false, // 일반 회원은 관리자 승인 필요
        referral_code: authUser.email.split('@')[0],
        created_at: new Date().toISOString(),
      };

      try {
        const { error: insertError } = await supabase
          .from('users')
          .insert(newUser);

        if (insertError) {
          if (insertError.code === '23505') {
            const { data: retryUser } = await supabase
              .from('users')
              .select('user_id, email, username, role, level, template_id, center_name, logo_url, status')
              .eq('user_id', authUser.id)
              .single();

            if (retryUser) {
              const loggedInUser: User = {
                id: retryUser.user_id,
                email: retryUser.email,
                username: retryUser.username,
                role: retryUser.role || 'user',
                level: retryUser.level,
                templateId: retryUser.template_id,
                centerName: retryUser.center_name,
                logoUrl: retryUser.logo_url,
              };

              setUser(loggedInUser);
              localStorage.setItem('user', JSON.stringify(loggedInUser));
              return;
            }
          }
          
          throw insertError;
        }

        const loggedInUser: User = {
          id: authUser.id,
          email: authUser.email,
          username: newUser.username,
          role: 'user',
        };

        setUser(loggedInUser);
        localStorage.setItem('user', JSON.stringify(loggedInUser));
        return;

      } catch (insertError: any) {
        if (insertError.code === '23505') {
          const { data: finalUser } = await supabase
            .from('users')
            .select('user_id, email, username, role, level, template_id, center_name, logo_url, status')
            .eq('user_id', authUser.id)
            .single();

          if (finalUser) {
            const loggedInUser: User = {
              id: finalUser.user_id,
              email: finalUser.email,
              username: finalUser.username,
              role: finalUser.role || 'user',
              level: finalUser.level,
              templateId: finalUser.template_id,
              centerName: finalUser.center_name,
              logoUrl: finalUser.logo_url,
            };

            setUser(loggedInUser);
            localStorage.setItem('user', JSON.stringify(loggedInUser));
            return;
          }
        }
        
        throw new Error('사용자 생성 실패');
      }

    } catch (error) {
      throw error;
    }
  };

  const login = async (email: string, password: string, isAdminPage: boolean = false): Promise<User> => {
    try {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
      const isFigmaEnv = hostname.includes('.figma.com') || hostname.includes('figma.site') || hostname.includes('fig.ma');
      
      // 항상 백엔드 API를 먼저 시도 (bcrypt 호환성)
      try {
        const backendUrl = 'https://mzoeeqmtvlnyonicycvg.supabase.co/functions/v1/make-server-b6d5667f';
        const response = await fetch(`${backendUrl}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16b2VlcW10dmxueW9uaWN5Y3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MjIyNzcsImV4cCI6MjA3ODQ5ODI3N30.oo7FsWjthtBtM-Xa1VFJieMGQ4mG__V8w7r9qGBPzaI`,
          },
          body: JSON.stringify({ email, password })
        });

        if (response.ok) {
          const { user: userData } = await response.json();

          // is_active 필드 확인 (백엔드 호환성)
          if (userData.is_active === undefined || userData.is_active === null) {
            console.warn('⚠️ is_active 필드 없음, 기본값 true 사용');
            userData.is_active = true;
          }

          // 일반 회원 is_active 체크
          if (userData.role === 'user' && !userData.is_active) {
            throw new Error('회원가입 승인 대기 중입니다. 관리자의 승인을 기다려주세요');
          }

          // 관리자(센터, 가맹점, 에이전시) is_active 체크
          if (['center', 'agency', 'store'].includes(userData.role) && !userData.is_active) {
            throw new Error('시스템 관리자에게 문의하세요');
          }

          const loggedInUser: User = {
            id: userData.user_id,
            email: userData.email,
            username: userData.username,
            role: userData.role || 'user',
            level: userData.level,
            templateId: userData.template_id,
            centerName: userData.center_name,
            logoUrl: userData.logo_url
          };

          if (isAdminPage && !['center', 'agency', 'store', 'admin', 'master'].includes(loggedInUser.role)) {
            throw new Error('관리자 권한이 필요합니다');
          }

          setUser(loggedInUser);
          localStorage.setItem('user', JSON.stringify(loggedInUser));
          localStorage.setItem('userTimestamp', Date.now().toString());
          return loggedInUser;
        }
      } catch (backendError) {
        console.log('Backend login failed, trying Supabase Auth...', backendError);
      }
      
      if (isFigmaEnv) {
        return await performDBPasswordLogin(email, password, isAdminPage);
      }

      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (authData.user && !authError) {
          const { data: userData } = await supabase
            .from('users')
            .select('user_id, email, username, role, level, template_id, center_name, logo_url, status, is_active')
            .eq('user_id', authData.user.id)
            .maybeSingle();

          if (userData) {
            // 일반 회원 is_active 체크
            if (userData.role === 'user' && !userData.is_active) {
              await supabase.auth.signOut();
              throw new Error('회원가입 승인 대기 중입니다. 관리자의 승인을 기다려주세요');
            }

            // 관리자(센터, 가맹점, 에이전시) is_active 체크
            if (['center', 'agency', 'store'].includes(userData.role) && !userData.is_active) {
              await supabase.auth.signOut();
              throw new Error('시스템 관리자에게 문의하세요');
            }

            const loggedInUser: User = {
              id: userData.user_id,
              email: userData.email,
              username: userData.username,
              role: userData.role || 'user',
              level: userData.level,
              templateId: userData.template_id,
              centerName: userData.center_name,
              logoUrl: userData.logo_url
            };

            if (isAdminPage && !['center', 'agency', 'store', 'admin', 'master'].includes(loggedInUser.role)) {
              await supabase.auth.signOut();
              throw new Error('관리자 권한이 필요합니다');
            }

            setUser(loggedInUser);
            localStorage.setItem('user', JSON.stringify(loggedInUser));
            localStorage.setItem('userTimestamp', Date.now().toString());
            return loggedInUser;
          }
        }
      } catch (authException) {
        // Auth 실패 - fallback으로 계속 진행
      }
      
      return await performDBPasswordLogin(email, password, isAdminPage);
      
    } catch (error: any) {
      throw error;
    }
  };

  const performDBPasswordLogin = async (email: string, password: string, isAdminPage: boolean): Promise<User> => {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('user_id, email, username, role, level, template_id, center_name, logo_url, password_hash, status, is_active')
      .eq('email', email)
      .maybeSingle();
    
    if (userError || !userData) {
      throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
    }
    
    // 일반 회원 is_active 체크
    if (userData.role === 'user' && !userData.is_active) {
      throw new Error('회원가입 승인 대기 중입니다. 관리자의 승인을 기다려주세요');
    }
    
    // 관리자(센터, 가맹점, 에이전시) is_active 체크
    if (['center', 'agency', 'store'].includes(userData.role) && !userData.is_active) {
      throw new Error('시스템 관리자에게 문의하세요');
    }
    
    if (!userData.password_hash) {
      throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
    }
    
    let isPasswordValid = false;
    
    try {
      if (userData.password_hash.startsWith('$2a$') || 
          userData.password_hash.startsWith('$2b$') || 
          userData.password_hash.startsWith('$2y$')) {
        isPasswordValid = await bcrypt.compare(password, userData.password_hash);
      } else {
        isPasswordValid = userData.password_hash === password;
      }
    } catch (bcryptError) {
      throw new Error('비밀번호 검증 중 오류가 발생했습니다');
    }
    
    if (!isPasswordValid) {
      throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
    }
    
    const loggedInUser: User = {
      id: userData.user_id,
      email: userData.email,
      username: userData.username,
      role: userData.role || 'user',
      level: userData.level,
      templateId: userData.template_id,
      centerName: userData.center_name,
      logoUrl: userData.logo_url
    };
    
    if (isAdminPage && !['center', 'agency', 'store', 'admin', 'master'].includes(loggedInUser.role)) {
      throw new Error('관리자 권한이 필요합니다');
    }
    
    setUser(loggedInUser);
    localStorage.setItem('user', JSON.stringify(loggedInUser));
    return loggedInUser;
  };

  const logout = () => {
    supabase.auth.signOut(); // Supabase Auth 로그아웃
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('userTimestamp'); // 타임스탠프도 제거
  };

  const refreshUser = async () => {
    if (!user) return;

    try {
      // 타임아웃: 5초 (백그라운드 동기화 - 빠르게 실패하고 캐시 유지)
      const { data, error } = await Promise.race([
        supabase
          .from('users')
          .select('user_id, email, username, role, level, template_id, center_name, logo_url')
          .eq('user_id', user.id)
          .single(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Background sync timeout')), 5000) // 5초로 단축
        ) as any
      ]);

      if (error) throw error;

      if (data) {
        const updatedUser: User = {
          id: data.user_id,
          email: data.email,
          username: data.username,
          role: data.role || 'user',
          level: data.level,
          templateId: data.template_id,
          centerName: data.center_name,
          logoUrl: data.logo_url
        };

        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
        localStorage.setItem('userTimestamp', Date.now().toString()); // 타임스탠프 갱신
      }
    } catch (error: any) {
      // 백그라운드 동기화 실패는 무시 (캐시된 사용자 정보 유지)
      // 에러를 던져서 호출 코드에서 재시도 가능하게 함
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}