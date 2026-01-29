import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2";
import walletRouter from "./wallet.tsx";
import transactionRouter from "./transaction.tsx";

// Deno Deploy 호환 bcrypt (Web Crypto API 사용)
const bcrypt = {
  async hash(password: string, saltRounds: number = 10): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    // bcrypt 형식으로 변환 (간단한 구현)
    return `$2b$${saltRounds.toString().padStart(2, '0')}$${hashHex}`;
  },
  
  async compare(password: string, hash: string): Promise<boolean> {
    // bcrypt 해시에서 실제 해시 부분 추출
    const parts = hash.split('$');
    if (parts.length !== 4) return false;
    
    const saltRounds = parseInt(parts[2]);
    const storedHash = parts[3];
    
    // 새로 해시 생성
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return storedHash === hashHex;
  }
};

const app = new Hono();

// Supabase client with service role key
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// =====================================================
// OAuth Token 관리 유틸리티
// =====================================================

interface OAuthToken {
  access_token: string;
  expires_at: string;
}

/**
 * OAuth 토큰 발급 (client_credentials grant)
 */
async function getOAuthToken(): Promise<string> {
  try {
    // 1. DB에서 기존 토큰 확인
    const { data: existingToken, error: fetchError } = await supabase
      .from('oauth_tokens')
      .select('access_token, expires_at')
      .eq('service_name', 'account_verification')
      .single();

    // 토큰이 있고 만료되지 않았으면 재사용
    if (existingToken && !fetchError) {
      const expiresAt = new Date(existingToken.expires_at);
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

      // 만료 1시간 전이면 재사용
      if (expiresAt > oneHourFromNow) {
        console.log('✅ Using existing OAuth token');
        return existingToken.access_token;
      }
    }

    // 2. 새 토큰 발급
    console.log('🔑 Requesting new OAuth token...');
    const clientId = Deno.env.get('code_client_id');
    const clientSecret = Deno.env.get('code_client_secret');
    const tokenEndpoint = Deno.env.get('code_token_endpoint');

    if (!clientId || !clientSecret || !tokenEndpoint) {
      console.error('❌ Missing OAuth credentials:', { 
        hasClientId: !!clientId, 
        hasClientSecret: !!clientSecret, 
        hasTokenEndpoint: !!tokenEndpoint 
      });
      throw new Error('OAuth credentials not configured');
    }

    console.log('📋 OAuth config:', { 
      clientId, 
      tokenEndpoint,
      clientSecretLength: clientSecret.length 
    });

    // Basic Auth 헤더 생성 (Java 예제와 동일)
    const basicAuth = btoa(`${clientId}:${clientSecret}`);

    console.log('🔐 Basic Auth header created');

    // Java 예제와 동일하게 scope=read 사용
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'read', // Java 예제: scope=read
    });

    console.log('📤 Token request params:', params.toString());

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    console.log('📥 Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token request failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        body: errorText
      });
      throw new Error(`Token request failed: ${tokenResponse.status} - ${errorText}`);
    }

    const responseText = await tokenResponse.text();
    console.log('📄 Raw response:', responseText);
    console.log('📄 Response first 100 chars:', responseText.substring(0, 100));

    // URL Decode (Java 예제: URLDecoder.decode(responseStr, "UTF-8"))
    let decodedText;
    try {
      // 응답이 URL 인코딩되어 있으면 디코딩
      if (responseText.includes('%')) {
        decodedText = decodeURIComponent(responseText);
        console.log('🔓 Decoded response:', decodedText);
      } else {
        // 인코딩되지 않은 경우 그대로 사용
        decodedText = responseText;
        console.log('📝 Response is not URL encoded, using as-is');
      }
    } catch (decodeError) {
      console.error('⚠️ Decode error, using raw response:', decodeError);
      decodedText = responseText;
    }

    let tokenData;
    try {
      tokenData = JSON.parse(decodedText);
      console.log('✅ OAuth token received:', { 
        hasAccessToken: !!tokenData.access_token,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type
      });
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      console.error('❌ Tried to parse:', decodedText.substring(0, 200));
      throw new Error(`Failed to parse token response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }

    // 3. DB에 저장 (7일 = 604800초)
    const expiresIn = tokenData.expires_in || 604800; // 기본 7일
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const { error: upsertError } = await supabase
      .from('oauth_tokens')
      .upsert({
        service_name: 'account_verification',
        access_token: tokenData.access_token,
        expires_at: expiresAt.toISOString(),
      }, {
        onConflict: 'service_name'
      });

    if (upsertError) {
      console.error('⚠️ Failed to save token:', upsertError);
      // 저장 실패해도 토큰은 반환 (일시적 사용 가능)
    } else {
      console.log('💾 Token saved to database');
    }

    return tokenData.access_token;

  } catch (error) {
    console.error('❌ OAuth token error:', error);
    throw error;
  }
}

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-User-Email", "X-User-Role", "X-User-Id"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoints (인증 불필요) - 먼저 정의
app.get("/health", (c) => {
  return c.json({ 
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "make-server-b6d5667f",
    version: "1.0.0"
  });
});

app.get("/make-server-b6d5667f/health", (c) => {
  return c.json({ 
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "make-server-b6d5667f",
    version: "1.0.0"
  });
});

// =====================================================
// Authentication API
// =====================================================

// POST /api/auth/login - 로그인
app.post("/make-server-b6d5667f/api/auth/login", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: 'email and password are required' }, 400);
    }

    // 사용자 조회 (password_hash 컬럼만 조회)
    const { data: userData, error } = await supabase
      .from('users')
      .select('user_id, email, username, password_hash, role, status, level, template_id, center_name, logo_url')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('Database error:', error);
      return c.json({ error: '로그인 중 오류가 발생했습니다' }, 500);
    }

    if (!userData) {
      return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' }, 401);
    }

    // 비밀번호 확인 (bcrypt 시 비교 또는 평문 비교)
    if (!userData.password_hash) {
      return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' }, 401);
    }

    // bcrypt 해시인지 평문인지 확인
    let isPasswordValid = false;
    
    if (userData.password_hash.startsWith('$2a$') || 
        userData.password_hash.startsWith('$2b$') || 
        userData.password_hash.startsWith('$2y$')) {
      // bcrypt 해시인 경우
      console.log('🔐 Comparing bcrypt hash...');
      isPasswordValid = await bcrypt.compare(password, userData.password_hash);
    } else {
      // 평문 비밀번호인 경우 (기존 사용자 하위 호환성)
      console.log('🔐 Comparing plain text password...');
      isPasswordValid = userData.password_hash === password;
    }
    
    if (!isPasswordValid) {
      console.log('❌ Password mismatch');
      return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' }, 401);
    }
    
    console.log('✅ Password verified successfully');

    // 계정 상태 확인
    if (userData.status !== 'active') {
      return c.json({ error: '관리자에게 문의하세요.' }, 403);
    }

    // last_login 업데이트
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('user_id', userData.user_id);

    // 비밀번호 제외하고 반환
    const { password_hash, ...userDataWithoutPassword } = userData;

    return c.json({ 
      success: true,
      user: userDataWithoutPassword
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: '로그인 처리 중 오류가 발생했습니다' }, 500);
  }
});

// POST /api/auth/change-password - 비밀번호 변경
app.post("/make-server-b6d5667f/api/auth/change-password", async (c) => {
  try {
    const body = await c.req.json();
    const { user_id, new_password } = body;

    if (!user_id || !new_password) {
      return c.json({ error: 'user_id and new_password are required' }, 400);
    }

    if (new_password.length < 8) {
      return c.json({ error: '비밀번호는 8자 이상이어야 합니다' }, 400);
    }

    // 비밀번호 해시화 (salt rounds 10)
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // 비밀번호 업데이트 (RLS 우회)
    const { error } = await supabase
      .from('users')
      .update({ 
        password_hash: hashedPassword,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user_id);

    if (error) {
      console.error('Password update error:', error);
      return c.json({ error: '비밀번호 변경 중 오류가 발생했습니다' }, 500);
    }

    return c.json({ 
      success: true,
      message: '비밀번호가 성공적으로 변경되었습니다'
    });
  } catch (error) {
    console.error('Change password error:', error);
    return c.json({ error: '비밀번호 변경 처리 중 오류가 발생했습니다' }, 500);
  }
});

// =====================================================
// Admin API
// =====================================================

// GET /api/admin/users - 필터링된 사용자 목록 조회
app.get("/make-server-b6d5667f/api/admin/users", async (c) => {
  try {
    const userEmail = c.req.header('X-User-Email');
    const userRole = c.req.header('X-User-Role');
    const userId = c.req.header('X-User-Id');

    console.log('📥 Admin users request:', { userEmail, userRole, userId });

    if (!userEmail || !userRole || !userId) {
      return c.json({ 
        success: false,
        error: 'Missing user credentials' 
      }, 401);
    }

    // 현재 사용자 정보 조회
    const { data: currentUser, error: userError } = await supabase
      .from('users')
      .select('user_id, email, role, level, referral_code')
      .eq('user_id', userId)
      .maybeSingle();

    if (userError || !currentUser) {
      console.error('❌ User lookup failed:', userError);
      return c.json({ 
        success: false,
        error: 'User not found' 
      }, 404);
    }

    console.log('👤 Current user:', currentUser);

    // 역할별 필터링 로직 (account_verifications와 조인)
    // parent 조인은 제거하고 별도로 조회 (Supabase 조인이 안정적이지 않음)
    let query = supabase
      .from('users')
      .select(`
        user_id, email, username, role, level, status, is_active, kyc_status, 
        parent_user_id, referral_code, created_at, last_login, phone,
        account_verifications(status)
      `)
      .order('created_at', { ascending: false });

    if (currentUser.role === 'master') {
      // 마스터: 모든 사용자
      console.log('🔓 Master role - fetching all users');
    } else if (currentUser.role === 'agency') {
      // 대리점: 자신이 생성한 센터 + 그 하위
      const { data: centers } = await supabase
        .from('users')
        .select('referral_code')
        .eq('parent_user_id', currentUser.user_id)
        .eq('role', 'center');
      
      const centerCodes = centers?.map(c => c.referral_code) || [];
      const allCodes = [currentUser.referral_code, ...centerCodes];
      
      query = query.or(`referral_code.in.(${allCodes.join(',')}),parent_user_id.eq.${currentUser.user_id}`);
      console.log('🏢 Agency role - filtering by codes:', allCodes);
    } else if (currentUser.role === 'center') {
      // 센터: 자신 + 직접 소속 가맹점 + 가맹점 소속 일반회원
      const { data: stores } = await supabase
        .from('users')
        .select('user_id, referral_code')
        .eq('parent_user_id', currentUser.user_id)
        .eq('role', 'store');
      
      const storeIds = stores?.map(s => s.user_id) || [];
      
      // 센터 본인 + 가맹점들 + 가맹점 소속 일반회원들
      const conditions = [
        `user_id.eq.${currentUser.user_id}`,
        `parent_user_id.eq.${currentUser.user_id}`
      ];
      
      if (storeIds.length > 0) {
        conditions.push(`parent_user_id.in.(${storeIds.join(',')})`);
      }
      
      query = query.or(conditions.join(','));
      console.log('🏪 Center role - filtering:', { storeIds: storeIds.length, conditions });
    } else if (currentUser.role === 'store') {
      // 가맹점: 자신 + 소속 일반회원
      query = query.or(`user_id.eq.${currentUser.user_id},parent_user_id.eq.${currentUser.user_id}`);
      console.log('🏬 Store role - filtering by parent_user_id');
    } else {
      // 일반 사용자: 자기 자신만
      query = query.eq('user_id', currentUser.user_id);
      console.log('👤 User role - self only');
    }

    const { data: users, error: fetchError } = await query;

    if (fetchError) {
      console.error('❌ Users fetch error:', fetchError);
      return c.json({ 
        success: false,
        error: fetchError.message 
      }, 500);
    }

    console.log('✅ Fetched users:', users?.length || 0);
    
    // ✅ parent_user_id로 parent 정보 조회 (조인 대신 별도 쿼리 사용)
    if (users && users.length > 0) {
      // parent_user_id를 가진 사용자들의 parent 정보 조회
      const usersWithParentId = users.filter(u => u.parent_user_id);
      
      if (usersWithParentId.length > 0) {
        console.log('👥 parent_user_id를 가진 사용자:', usersWithParentId.length, '명');
        
        // 고유한 parent_user_id 목록 추출
        const parentIds = [...new Set(usersWithParentId.map(u => u.parent_user_id))];
        console.log('🔍 조회할 parent ID 목록:', parentIds);
        
        // parent 정보 별도 조회
        const { data: parents, error: parentsError } = await supabase
          .from('users')
          .select('user_id, username')
          .in('user_id', parentIds);
        
        if (parentsError) {
          console.error('❌ Parent 조회 오류:', parentsError);
        } else if (parents) {
          console.log('✅ 조회된 parent 정보:', parents.length, '명');
          console.log('📋 Parent 목록:', parents.map(p => ({ id: p.user_id.substring(0, 8), username: p.username })));
          
          // parent 정보를 users 배열에 수동으로 추가
          const parentMap = new Map(parents.map(p => [p.user_id, p]));
          
          users.forEach(u => {
            if (u.parent_user_id) {
              const parentInfo = parentMap.get(u.parent_user_id);
              if (parentInfo) {
                u.parent = { username: parentInfo.username };
              } else {
                console.warn('⚠️ parent not found:', { 
                  user: u.username, 
                  parent_user_id: u.parent_user_id.substring(0, 8) 
                });
              }
            }
          });
          
          console.log('✅ Parent 정보 매핑 완료');
        }
      }
      
      // 🔍 디버깅: 최종 결과 샘플 확인
      const sample = users.slice(0, 3).map(u => ({
        username: u.username,
        role: u.role,
        parent_user_id: u.parent_user_id ? u.parent_user_id.substring(0, 8) + '...' : null,
        parent: u.parent
      }));
      console.log('👤 최종 사용자 샘플 (첫 3명):', JSON.stringify(sample, null, 2));
    }

    return c.json({ 
      success: true,
      users: users || []
    });

  } catch (error) {
    console.error('❌ Admin users error:', error);
    return c.json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});

// PUT /api/admin/users/:id/level - 사용자 등급 변경
app.put("/make-server-b6d5667f/api/admin/users/:id/level", async (c) => {
  try {
    const userId = c.req.param('id');
    const body = await c.req.json();
    const { level } = body;

    console.log('📥 Update user level request:', { userId, level });

    if (!userId || !level) {
      return c.json({ 
        success: false,
        error: '필수 정보가 누락되었습니다' 
      }, 400);
    }

    // 유효한 level 값 확인
    const validLevels = ['Basic', 'Standard', 'Premium', 'VIP'];
    if (!validLevels.includes(level)) {
      return c.json({ 
        success: false,
        error: '유효하지 않은 등급입니다' 
      }, 400);
    }

    // 사용자 등급 업데이트
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ level })
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Update level error:', updateError);
      return c.json({ 
        success: false,
        error: updateError.message 
      }, 500);
    }

    console.log('✅ Level updated successfully:', updatedUser);

    return c.json({ 
      success: true,
      user: updatedUser
    });

  } catch (error) {
    console.error('❌ Update level error:', error);
    return c.json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});

// =====================================================
// 지갑 생성 및 관리 API
// =====================================================
app.route("/make-server-b6d5667f/wallet", walletRouter);

// =====================================================
// 트랜잭션 전송 및 관리 API
// =====================================================
app.route("/make-server-b6d5667f/transaction", transactionRouter);

// =====================================================
// 계좌 인증 API
// =====================================================

// 은행 코드 매핑
const BANK_CODES: Record<string, string> = {
  '한국은행': '001',
  '산업은행': '002',
  'IBK기업은행': '003',
  'KB국민은행': '004',
  '수협은행': '007',
  '수출입은행': '008',
  'NH농협은행': '011',
  '지역농축협': '012',
  '우리은행': '020',
  '한국씨티은행': '027',
  '대구은행': '031',
  '부산은행': '032',
  '광주은행': '034',
  '제주은행': '035',
  '전북은행': '037',
  '경남은행': '039',
  '우리카드': '041',
  '하나카드': '044',
  '새마을금고': '045',
  '신협': '048',
  '저축은행': '050',
  '모건스탠리은행': '052',
  'HSBC은행': '054',
  '도이치은행': '055',
  '제이피모간체이스은행': '057',
  '미즈호은행': '058',
  '엠유에프지은행': '059',
  'BOA은행': '060',
  '비엔피파리바은행': '061',
  '중국공상은행': '062',
  '산림조합': '064',
  '대화은행': '065',
  '교보증권': '066',
  '중국건설은행': '067',
  '우체국': '071',
  '신한금융투자': '076',
  'KB증권': '077',
  '하나은행': '081',
  '신한은행': '088',
  'K뱅크': '089',
  '카카오뱅크': '090',
  '유안타증권': '093',
};

// POST /api/account-verification/request - 계좌 인증 요청
app.post("/make-server-b6d5667f/api/account-verification/request", async (c) => {
  try {
    const body = await c.req.json();
    const { user_id, bank_name, account_number, account_holder } = body;

    console.log('📥 Account verification request:', { user_id, bank_name, account_number, account_holder });

    if (!user_id || !bank_name || !account_number || !account_holder) {
      return c.json({ error: '필수 정보가 누락되었습니다', code: 'MISSING_FIELDS' }, 400);
    }

    // ✅ Biconomy 설정 확인 (활성화 여부 체크)
    console.log('🔍 Checking Biconomy settings...');
    const { data: biconomySettings, error: settingsError } = await supabase
      .from('system_settings')
      .select('biconomy_enabled')
      .eq('id', 1)
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('❌ Settings fetch error:', settingsError);
    }

    const isBiconomyEnabled = biconomySettings?.biconomy_enabled ?? false;
    console.log(`🔧 Biconomy status: ${isBiconomyEnabled ? 'ENABLED' : 'DISABLED'}`);

    // 계좌번호 하이픈 제거
    const cleanAccountNumber = account_number.replace(/-/g, '');

    // Biconomy 비활성화 시: 1원 입금 없이 바로 승인 대기 상태로 저장
    if (!isBiconomyEnabled) {
      console.log('⚠️ Biconomy is disabled, skipping 1won API call');
      
      // 1. DB에 바로 pending 상태로 저장
      const { data: verificationData, error: insertError } = await supabase
        .from('account_verifications')
        .insert({
          user_id: user_id,
          bank_name: bank_name,
          account_number: cleanAccountNumber,
          account_holder: account_holder,
          status: 'pending', // 바로 승인 대기 상태
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ DB insert error:', insertError);
        return c.json({ 
          error: '계좌 인증 요청 저장 실패', 
          code: 'DB_INSERT_ERROR',
          details: insertError.message 
        }, 500);
      }

      console.log('✅ Verification record inserted (pending):', verificationData.verification_id);

      // 2. 사용자에게 알림 생성
      console.log('🔔 Creating notification for user...');
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: user_id,
          type: 'account_verification',
          title: '계좌 인증 요청 완료',
          message: `계좌 인증 요청이 접수되었습니다.\n은행: ${bank_name}\n계좌번호: ${cleanAccountNumber}\n예금주: ${account_holder}\n\n관리자 승인 후 지갑이 활성화됩니다.`,
          data: {
            verification_id: verificationData.verification_id,
            bank_name: bank_name,
            account_number: cleanAccountNumber,
            account_holder: account_holder,
          },
          is_read: false,
        });

      if (notificationError) {
        console.error('❌ Notification creation error:', notificationError);
      } else {
        console.log('✅ Notification created successfully');
      }

      console.log('✅ Account verification request completed (manual approval mode)');

      return c.json({
        success: true,
        verification_id: verificationData.verification_id,
        message: '계좌 인증 요청이 접수되었습니다. 관리자 승인을 기다려주세요.',
        mode: 'manual', // 수동 승인 모드
      });
    }

    // ========== Biconomy 활성화 시: 기존 1원 입금 로직 실행 ==========
    console.log('✅ Biconomy is enabled, proceeding with 1won verification');

    // 은행 코드 확인
    const bankCode = BANK_CODES[bank_name];
    if (!bankCode) {
      return c.json({ error: '지원하지 않는 은행입니다', code: 'INVALID_BANK' }, 400);
    }

    // 1. account_verifications 테이블에 먼저 INSERT
    console.log('💾 Inserting verification record...');
    const { data: verificationData, error: insertError } = await supabase
      .from('account_verifications')
      .insert({
        user_id: user_id,
        bank_name: bank_name,
        account_number: cleanAccountNumber,
        account_holder: account_holder,
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ DB insert error:', insertError);
      return c.json({ 
        error: '계좌 인증 요청 저장 실패', 
        code: 'DB_INSERT_ERROR',
        details: insertError.message 
      }, 500);
    }

    console.log('✅ Verification record inserted:', verificationData.verification_id);

    // 2. 외부 1원 입금 API 호출
    const apiUrl = Deno.env.get('code_api_demo');
    if (!apiUrl) {
      console.error('❌ API URL not configured');
      return c.json({ error: 'API 설정이 올바르지 않습니다', code: 'API_URL_MISSING' }, 500);
    }

    const apiPayload = {
      account: cleanAccountNumber,
      organization: bankCode,
      inPrintType: "0", // 랜덤 숫자
    };

    console.log('🔑 Getting OAuth token...');
    let oauthToken;
    try {
      oauthToken = await getOAuthToken();
      console.log('✅ OAuth token obtained');
    } catch (oauthError) {
      console.error('❌ OAuth token error:', oauthError);
      console.log('⚠️ Falling back to manual approval mode');
      
      // OAuth 토큰 발급 실패 시 수동 승인 모드로 전환
      // 이미 DB에는 저장되었으므로 관리자가 수동으로 승인 가능
      const { error: updateStatusError } = await supabase
        .from('account_verifications')
        .update({ status: 'pending' })
        .eq('verification_id', verificationData.verification_id);
      
      if (updateStatusError) {
        console.error('❌ Status update error:', updateStatusError);
      }
      
      // 사용자에게 알림 생성
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: user_id,
          type: 'account_verification',
          title: '계좌 인증 요청 완료',
          message: `계좌 인증 요청이 접수되었습니다.\n은행: ${bank_name}\n계좌번호: ${cleanAccountNumber}\n예금주: ${account_holder}\n\n관리자 승인 후 지갑이 활성화됩니다.`,
          data: {
            verification_id: verificationData.verification_id,
            bank_name: bank_name,
            account_number: cleanAccountNumber,
            account_holder: account_holder,
          },
          is_read: false,
        });
      
      if (notificationError) {
        console.error('❌ Notification creation error:', notificationError);
      }
      
      return c.json({
        success: true,
        verification_id: verificationData.verification_id,
        message: '계좌 인증 요청이 접수되었습니다. 관리자 승인을 기다려주세요.',
        mode: 'manual', // 수동 승인 모드
      });
    }

    console.log('📞 Calling 1won API:', apiPayload);

    let apiResponse;
    try {
      apiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${oauthToken}`,
        },
        body: JSON.stringify(apiPayload),
      });
    } catch (fetchError) {
      console.error('❌ API fetch error:', fetchError);
      return c.json({ 
        error: '1원 입금 API 호출 실패', 
        code: 'API_FETCH_ERROR',
        details: fetchError instanceof Error ? fetchError.message : 'Unknown error'
      }, 500);
    }

    console.log('📥 1won API response status:', apiResponse.status);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('❌ API call failed:', apiResponse.status, errorText);
      return c.json({ 
        error: '1원 입금 요청 실패', 
        code: 'API_REQUEST_FAILED',
        status: apiResponse.status,
        details: errorText
      }, 500);
    }

    const apiResponseText = await apiResponse.text();
    console.log('📄 1won API raw response:', apiResponseText);
    console.log('📄 Response first 100 chars:', apiResponseText.substring(0, 100));

    // URL Decode (토큰 발급과 동일한 로직)
    let decodedApiText;
    try {
      // 응답이 URL 인코딩되어 있으면 디코딩
      if (apiResponseText.includes('%')) {
        decodedApiText = decodeURIComponent(apiResponseText);
        console.log('🔓 Decoded 1won API response:', decodedApiText);
      } else {
        // 인코딩되지 않은 경우 그대로 사용
        decodedApiText = apiResponseText;
        console.log('📝 1won API response is not URL encoded, using as-is');
      }
    } catch (decodeError) {
      console.error('⚠️ Decode error, using raw response:', decodeError);
      decodedApiText = apiResponseText;
    }

    let apiResult;
    try {
      apiResult = JSON.parse(decodedApiText);
      console.log('✅ 1won API response parsed:', { 
        hasAuthCode: !!apiResult.authCode,
        resultCode: apiResult.result?.code,
        resultMessage: apiResult.result?.message
      });
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      console.error('❌ Tried to parse:', decodedApiText.substring(0, 200));
      return c.json({ 
        error: '1원 입금 API 응답 파싱 실패', 
        code: 'API_PARSE_ERROR',
        details: parseError instanceof Error ? parseError.message : 'Unknown error'
      }, 500);
    }

    // 3. authCode를 DB에 저장하고 바로 pending 상태로 변경
    console.log('💾 Updating verification with authCode...');
    const { error: updateError } = await supabase
      .from('account_verifications')
      .update({
        verification_code: apiResult.authCode,
        status: 'pending', // 자동으로 승인 대기 상태로 변경
      })
      .eq('verification_id', verificationData.verification_id);

    if (updateError) {
      console.error('❌ DB update error:', updateError);
      return c.json({ 
        error: '인증 코드 저장 실패', 
        code: 'DB_UPDATE_ERROR',
        details: updateError.message 
      }, 500);
    }

    // 4. 사용자에게 알림 생성
    console.log('🔔 Creating notification for user...');
    const { error: notificationError } = await supabase
      .from('notifications')
      .insert({
        user_id: user_id,
        type: 'account_verification',
        title: '계좌 인증 요청 완료',
        message: `계좌 인증 요청이 접수되었습니다. 입금자명(인증번호): ${apiResult.authCode}\n관리자 승인 후 지갑이 활성화됩니다.`,
        data: {
          verification_id: verificationData.verification_id,
          auth_code: apiResult.authCode,
          bank_name: bank_name,
          account_number: cleanAccountNumber,
        },
        is_read: false,
      });

    if (notificationError) {
      console.error('❌ Notification creation error:', notificationError);
      // 알림 생성 실패는 치명적이지 않으므로 계속 진행
    } else {
      console.log('✅ Notification created successfully');
    }

    console.log('✅ Account verification request completed successfully');

    return c.json({
      success: true,
      verification_id: verificationData.verification_id,
      authCode: apiResult.authCode, // 디버깅용 (프로덕션에서는 제거)
      message: '계좌 인증이 자동으로 완료되었습니다. 관리자 승인을 기다려주세요.',
      mode: 'auto', // 자동 1원 인증 모드
    });

  } catch (error) {
    console.error('❌ Account verification request error:', error);
    console.error('❌ Error name:', error instanceof Error ? error.name : 'Unknown');
    console.error('❌ Error message:', error instanceof Error ? error.message : 'Unknown');
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'Unknown');
    return c.json({ 
      error: '계좌 인증 요청 처리 중 오류가 발생했습니다',
      code: 'INTERNAL_ERROR',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 500);
  }
});

// POST /api/account-verification/submit - 인증번호 검증 및 승인 요청
app.post("/make-server-b6d5667f/api/account-verification/submit", async (c) => {
  try {
    const body = await c.req.json();
    const { verification_id } = body;

    if (!verification_id) {
      return c.json({ error: 'verification_id가 필요합니다' }, 400);
    }

    // status를 pending으로 변경 (관리자 승인 대기)
    const { error } = await supabase
      .from('account_verifications')
      .update({
        status: 'pending',
      })
      .eq('verification_id', verification_id);

    if (error) {
      console.error('DB update error:', error);
      return c.json({ error: '승인 요청 처리 실패' }, 500);
    }

    return c.json({
      success: true,
      message: '관리자 승인을 요청했습니다.',
    });

  } catch (error) {
    console.error('Account verification submit error:', error);
    return c.json({ error: '승인 요청 처리 중 오류가 발생했습니다' }, 500);
  }
});

// =====================================================
// Vercel 도메인 관리 API
// =====================================================

// POST /api/vercel/add-domain - Vercel에 도메인 추가
app.post("/make-server-b6d5667f/api/vercel/add-domain", async (c) => {
  try {
    const body = await c.req.json();
    const { centerId, domain } = body;

    console.log('🌐 Vercel 도메인 추가 요청:', { centerId, domain });

    if (!centerId || !domain) {
      return c.json({ error: '센터 ID와 도메인이 필요합니다', code: 'MISSING_FIELDS' }, 400);
    }

    // 1. 센터 존재 확인
    const { data: center, error: centerError } = await supabase
      .from('users')
      .select('user_id, center_name')
      .eq('user_id', centerId)
      .eq('role', 'center')
      .maybeSingle();

    if (centerError || !center) {
      return c.json({ error: '센터를 찾을 수 없습니다', code: 'CENTER_NOT_FOUND' }, 404);
    }

    // 2. Vercel API 설정 (모든 가능한 환경변수 이름 시도)
    const vercelToken = Deno.env.get('VERCEL_TOKEN') || 
                        Deno.env.get('VITE_VERCEL_TOKEN') ||
                        Deno.env.get('VERCEL_API_TOKEN');
    const projectId = Deno.env.get('VERCEL_PROJECT_ID') || 
                      Deno.env.get('VITE_VERCEL_PROJECT_ID');

    // 디버깅: 사용 가능한 모든 환경변수 확인
    console.log('🔍 환경변수 확인:', {
      VERCEL_TOKEN: vercelToken ? '✅ 설정됨' : '❌ 없음',
      VERCEL_PROJECT_ID: projectId ? '✅ 설정됨' : '❌ 없음',
      allEnvKeys: Object.keys(Deno.env.toObject()).filter(k => k.includes('VERCEL'))
    });

    if (!vercelToken || !projectId) {
      console.error('❌ Vercel API 설정 누락');
      console.error('사용 가능한 VERCEL 관련 환경변수:', 
        Object.keys(Deno.env.toObject()).filter(k => k.includes('VERCEL')));
      return c.json({ 
        error: 'Vercel API 토큰 또는 프로젝트 ID가 설정되지 않았습니다', 
        code: 'VERCEL_CONFIG_MISSING',
        debug: {
          hasToken: !!vercelToken,
          hasProjectId: !!projectId,
          availableEnvs: Object.keys(Deno.env.toObject()).filter(k => k.includes('VERCEL'))
        }
      }, 500);
    }

    const apiUrl = `https://api.vercel.com/v9/projects/${projectId}/domains`;

    // 3. 주도메인 추가
    console.log('📍 주도메인 추가 중:', domain);
    const mainResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: domain
      })
    });

    const mainResult = await mainResponse.json();

    if (!mainResponse.ok && mainResponse.status !== 409) { // 409 = 이미 존재
      console.error('❌ 주도메인 추가 실패:', mainResult);
      return c.json({ 
        error: mainResult.error?.message || '도메인 추가 실패', 
        code: 'VERCEL_API_ERROR' 
      }, mainResponse.status);
    }

    console.log('✅ 주도메인 추가 성공');

    // 4. admin 서브도메인 추가
    const adminDomain = `admin.${domain}`;
    console.log('📍 Admin 서브도메인 추가 중:', adminDomain);
    
    const adminResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: adminDomain
      })
    });

    const adminResult = await adminResponse.json();

    if (!adminResponse.ok && adminResponse.status !== 409) {
      console.error('❌ Admin 서브도메인 추가 실패:', adminResult);
      return c.json({ 
        error: adminResult.error?.message || 'Admin 도메인 추가 실패', 
        code: 'VERCEL_API_ERROR' 
      }, adminResponse.status);
    }

    console.log('✅ Admin 서브도메인 추가 성공');

    return c.json({
      success: true,
      message: '도메인이 Vercel에 추가되었습니다',
      domains: [domain, adminDomain]
    });

  } catch (error) {
    console.error('Vercel domain add error:', error);
    return c.json({ error: '도메인 추가 중 오류가 발생했습니다', code: 'SERVER_ERROR' }, 500);
  }
});

// DELETE /api/vercel/remove-domain - Vercel에서 도메인 제거
app.delete("/make-server-b6d5667f/api/vercel/remove-domain", async (c) => {
  try {
    const body = await c.req.json();
    const { domain } = body;

    console.log('🗑️ Vercel 도메인 제거 요청:', domain);

    if (!domain) {
      return c.json({ error: '도메인이 필요합니다', code: 'MISSING_FIELDS' }, 400);
    }

    // Vercel API 설정
    const vercelToken = Deno.env.get('VERCEL_TOKEN');
    const projectId = Deno.env.get('VERCEL_PROJECT_ID');

    if (!vercelToken || !projectId) {
      console.error('❌ Vercel API 설정 누락');
      return c.json({ 
        error: 'Vercel API 토큰 또는 프로젝트 ID가 설정되지 않았습니다', 
        code: 'VERCEL_CONFIG_MISSING' 
      }, 500);
    }

    // 주도메인 삭제
    const mainApiUrl = `https://api.vercel.com/v9/projects/${projectId}/domains/${domain}`;
    await fetch(mainApiUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${vercelToken}`
      }
    });

    // admin 서브도메인 삭제
    const adminDomain = `admin.${domain}`;
    const adminApiUrl = `https://api.vercel.com/v9/projects/${projectId}/domains/${adminDomain}`;
    await fetch(adminApiUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${vercelToken}`
      }
    });

    console.log('✅ Vercel 도메인 제거 성공');

    return c.json({
      success: true,
      message: '도메인이 Vercel에서 제거되었습니다'
    });

  } catch (error) {
    console.error('Vercel domain remove error:', error);
    return c.json({ error: '도메인 제거 중 오류가 발생했습니다', code: 'SERVER_ERROR' }, 500);
  }
});

Deno.serve(app.fetch);