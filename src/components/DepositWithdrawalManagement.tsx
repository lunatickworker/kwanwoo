import { ArrowDownCircle, ArrowUpCircle, CheckCircle, XCircle, Clock, Filter, Search, ChevronLeft, ChevronRight, Eye, DollarSign, ExternalLink, FileText, Coins as CoinsIcon, Landmark, Bell, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "../utils/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { SUPABASE_CONFIG } from "../utils/config";
import { toast } from "sonner@2.0.3";
import { getHierarchyUserIds } from "../utils/api/query-helpers";
import { getCenterOperationMode, sendProductionTransaction, generateDevTxHash } from "../utils/blockchain/centerModeHelper";
import { estimateGas } from "../utils/blockchain/transaction";
import { approveTransferRequest, approveCoinSale } from "../utils/depositApprovalHelper";

interface TransferRequest {
  request_id: string;
  store_id: string;
  amount: number;
  status: string;
  request_note: string | null;
  admin_note: string | null;
  created_at: string;
  approved_at: string | null;
  store_name?: string;
  store_email?: string;
}

interface Deposit {
  deposit_id: string;
  user_id: string;
  wallet_id: string;
  coin_type: string;
  amount: number;
  tx_hash: string;
  confirmations: number;
  required_confirmations: number;
  status: string;
  from_address: string | null;
  method: string;
  created_at: string;
  confirmed_at: string | null;
  username?: string;
  email?: string;
  viewed_by_store?: boolean;
  viewed_at?: string;
}

interface Withdrawal {
  withdrawal_id: string;
  user_id: string;
  wallet_id: string;
  coin_type: string;
  amount: number;
  fee: number;
  to_address: string;
  tx_hash: string | null;
  status: string;
  rejection_reason: string | null;
  approved_by: string | null;
  method: string;
  created_at: string;
  completed_at: string | null;
  username?: string;
  email?: string;
}

interface CoinSaleRequest {
  sale_id: string;
  store_id: string;
  center_id: string;
  coin_type: string;
  amount: number;
  krw_value: number;
  status: string;
  request_note: string | null;
  admin_note: string | null;
  approved_by: string | null;
  created_at: string;
  approved_at: string | null;
  store_name?: string;
  store_email?: string;
}

interface TransactionReceipt {
  txHash: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  blockNumber?: number;
  gasUsed?: string;
  effectiveGasPrice?: string;
  timestamp?: string;
  confirmations?: number;
}

type TabType = "transfer_requests" | "deposits" | "withdrawals" | "coin_sales";

export function DepositWithdrawalManagement() {
  const { user } = useAuth();
  const [transferRequests, setTransferRequests] = useState<TransferRequest[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [coinSales, setCoinSales] = useState<CoinSaleRequest[]>([]);
  
  // 가맹점 계정은 기본 탭을 "deposits"로 설정
  const initialTab = user?.role === 'store' ? 'deposits' : 'transfer_requests';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [selectedRequest, setSelectedRequest] = useState<TransferRequest | null>(null);
  const [selectedCoinSale, setSelectedCoinSale] = useState<CoinSaleRequest | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [gasSponsorEnabled, setGasSponsorEnabled] = useState(true); // 가스비 지원 여부
  
  // 가스비 추정 정보
  const [gasEstimate, setGasEstimate] = useState<{
    estimatedCost: string;
    token: string;
  } | null>(null);
  const [isEstimatingGas, setIsEstimatingGas] = useState(false);

  // TX 상세 조회
  const [selectedTxHash, setSelectedTxHash] = useState<string | null>(null);
  const [txDetail, setTxDetail] = useState<any>(null);
  const [isFetchingTxDetail, setIsFetchingTxDetail] = useState(false);
  const [operationMode, setOperationMode] = useState<'development' | 'production'>('development');

  // 거래 수수료 추정 (실제 거래 데이터 기반)
  const [transactionFee, setTransactionFee] = useState<{
    average_fee: number;
    min_fee: number;
    max_fee: number;
    transaction_count: number;
    can_estimate: boolean;
    warning?: string;
  } | null>(null);
  const [isEstimatingFee, setIsEstimatingFee] = useState(false);
  
  // Transaction Receipt 모달
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [currentReceipt, setCurrentReceipt] = useState<TransactionReceipt | null>(null);
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);

  // 코인 아이콘 매핑
  const [coinIcons, setCoinIcons] = useState<Record<string, string>>({});

  // 탭 전환 처리 (localStorage 연동)
  useEffect(() => {
    const targetTab = localStorage.getItem('admin_deposit_active_tab');
    if (targetTab && ['transfer_requests', 'deposits', 'withdrawals', 'coin_sales'].includes(targetTab)) {
      setActiveTab(targetTab as TabType);
      // 일회성이므로 삭제 (선택사항, 하지만 유지하는게 나을수도? 여기서는 삭제하여 새로고침시 기본값 로직과 충돌 방지)
      localStorage.removeItem('admin_deposit_active_tab');
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchData();
      fetchCoinIcons();

      // 가맹점 계정이 입금 탭을 확인하면 localStorage 업데이트
      if (user.role === 'store' && activeTab === 'deposits') {
        const lastViewedKey = `store_last_viewed_deposits_${user.id}`;
        localStorage.setItem(lastViewedKey, new Date().toISOString());
        console.log('✅ 가맹점 입금 내역 확인 완료:', new Date().toISOString());
      }

      // 트랜잭션 모니터 업데이트 이벤트 리스너
      const handleTransactionUpdate = (event: CustomEvent) => {
        console.log('🔄 트랜잭션 업데이트 감지 (관리자):', event.detail);
        fetchData(); // 데이터 새로고침
      };

      window.addEventListener('transaction-updated', handleTransactionUpdate as EventListener);

      // 실시간 업데이트
      const channel = supabase
        .channel('deposit-withdrawal-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'transfer_requests' },
          () => {
            if (user.role !== 'store') {
              fetchData();
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'deposits' },
          () => fetchData()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'withdrawals' },
          () => {
            if (user.role !== 'store') {
              fetchData();
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'store_coin_sales' },
          () => fetchData()
        )
        .subscribe();

      return () => {
        window.removeEventListener('transaction-updated', handleTransactionUpdate as EventListener);
        supabase.removeChannel(channel);
      };
    }
  }, [user]); // ✅ activeTab 제거 - 탭 변경이 데이터 fetch를 트리거하면 안 됨

  // 수수료 추정 (실제 거래 데이터 기반)
  const fetchTransactionFee = async (walletId: string) => {
    try {
      setIsEstimatingFee(true);

      // 지갑 주소 조회
      const { data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('address')
        .eq('wallet_id', walletId)
        .single();

      if (walletError || !walletData?.address) {
        console.error('❌ 지갑 주소 조회 실패:', walletError);
        setTransactionFee(null);
        return;
      }

      // Edge Function에서 수수료 추정
      const response = await fetch(
        `${SUPABASE_CONFIG.FUNCTIONS_BASE_URL}/make-server-b6d5667f/transaction/estimate-fee/${walletData.address}`
      );

      if (response.ok) {
        const feeData = await response.json();
        console.log('💰 수수료 추정 데이터:', feeData);
        
        if (feeData.fee_estimate) {
          setTransactionFee(feeData.fee_estimate);
        }
      } else {
        console.error('❌ 수수료 추정 실패:', response.statusText);
        setTransactionFee(null);
      }
    } catch (error) {
      console.error('❌ 수수료 조회 중 오류:', error);
      setTransactionFee(null);
    } finally {
      setIsEstimatingFee(false);
    }
  };

  // selectedRequest 변경 시 수수료 조회
  useEffect(() => {
    if (selectedRequest?.wallet_id) {
      fetchTransactionFee(selectedRequest.wallet_id);
    } else {
      setTransactionFee(null);
    }
  }, [selectedRequest?.wallet_id]);

  // TX 상세 조회
  const fetchTxDetail = async (txHash: string) => {
    if (!txHash) return;
    
    setIsFetchingTxDetail(true);
    try {
      // AuthContext의 user 정보로 인증 확인
      const isAuthenticated = !!user;
      const isDevelopmentTx = txHash.startsWith('dev_');
      
      console.log('🔍 TX 상세 조회 시작:', {
        txHash,
        isDevelopmentTx,
        isAuthenticated,
        userEmail: user?.email,
        timestamp: new Date().toISOString()
      });
      
      // 개발 TXID는 user 정보만으로 진행, 실제 TXID는 토큰 필요
      if (!isAuthenticated) {
        console.error('❌ 인증 필요함. 현재 user:', user);
        toast.error('로그인 후 사용해주세요');
        setIsFetchingTxDetail(false);
        return;
      }
      
      let authToken = '';
      
      // 실제 TXID인 경우 토큰 필요
      if (!isDevelopmentTx) {
        // 세션 갱신 시도
        const { data: { session } } = await supabase.auth.refreshSession();
        authToken = session?.access_token || '';
        
        // 토큰이 없으면 localStorage에서 가져오기
        if (!authToken) {
          console.warn('⚠️ Supabase 세션 없음. localStorage 확인 중...');
          const sessionData = localStorage.getItem('sb-session') || localStorage.getItem('supabase.auth.token');
          if (sessionData) {
            try {
              const parsed = JSON.parse(sessionData);
              authToken = parsed.access_token || parsed.token;
            } catch (e) {
              console.warn('⚠️ localStorage 파싱 실패');
            }
          }
        }
        
        if (!authToken) {
          console.error('❌ 실제 TXID 조회에 토큰이 필요함');
          toast.error('인증 정보가 만료되었습니다. 다시 로그인해주세요');
          setIsFetchingTxDetail(false);
          return;
        }
      }

      const backendUrl = 'https://mzoeeqmtvlnyonicycvg.supabase.co/functions/v1/make-server-b6d5667f';
      const requestUrl = `${backendUrl}/transaction/detail/${txHash}`;
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      // 실제 TXID인 경우 Authorization 헤더 추가
      if (!isDevelopmentTx && authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      console.log('📤 API 요청:', {
        url: requestUrl,
        method: 'GET',
        isDevelopmentTx,
        hasAuthHeader: !isDevelopmentTx
      });

      const response = await fetch(requestUrl, { headers });

      console.log('📥 API 응답:', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type')
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ 응답 데이터:', data);
        if (data.success) {
          setTxDetail(data.transaction);
          setSelectedTxHash(txHash);
          toast.success('거래 정보를 불러왔습니다');
        } else {
          console.error('❌ API 성공 응답이지만 success=false:', data);
          toast.error('거래 정보를 찾을 수 없습니다');
        }
      } else if (response.status === 401) {
        const errorData = await response.json();
        console.error('❌ 401 Unauthorized:', errorData);
        toast.error('인증이 만료되었습니다. 다시 로그인해주세요');
      } else {
        const errorData = await response.json();
        console.error('❌ API 오류:', { status: response.status, error: errorData });
        toast.error('거래 상세 정보 조회 실패');
      }
    } catch (error) {
      console.error('TX 상세 조회 오류:', error);
      toast.error('거래 상세 조회 중 오류가 발생했습니다');
    } finally {
      setIsFetchingTxDetail(false);
    }
  };

  // 데이터 로드
  const fetchData = async () => {
    if (!user || !user.role) return;

    console.log('📊 Fetching deposit/withdrawal data for user:', user.id, 'role:', user.role);

    try {
      // 계층 구조에 따라 하위 사용자 ID 조회
      const allowedUserIds = await getHierarchyUserIds(user.id, user.role);

      console.log('✅ Allowed user IDs:', allowedUserIds.length, allowedUserIds);

      // Transfer Requests
      let transferQuery = supabase
        .from('transfer_requests')
        .select(`
          *,
          users!transfer_requests_user_id_fkey(username, email)
        `);

      if (user.role !== 'master') {
        transferQuery = transferQuery.in('user_id', allowedUserIds);
      }

      const { data: transferData } = await transferQuery.order('created_at', { ascending: false });

      if (transferData) {
        setTransferRequests(transferData.map((item: any) => ({
          ...item,
          username: item.users?.username,
          email: item.users?.email
        })));
      }

      // Deposits
      let depositQuery = supabase
        .from('deposits')
        .select(`
          *,
          users!deposits_user_id_fkey(username, email)
        `);

      if (user.role !== 'master') {
        depositQuery = depositQuery.in('user_id', allowedUserIds);
      }

      const { data: depositData } = await depositQuery.order('created_at', { ascending: false });

      if (depositData) {
        setDeposits(depositData.map((item: any) => ({
          ...item,
          username: item.users?.username,
          email: item.users?.email
        })));

        // 가맹점이 입금 탭을 볼 때 자동으로 viewed_by_store = true 처리
        if (user.role === 'store' && activeTab === 'deposits') {
          const unviewedDepositIds = depositData
            .filter((d: any) => d.viewed_by_store === false)
            .map((d: any) => d.deposit_id);

          if (unviewedDepositIds.length > 0) {
            console.log('✅ 미확인 입금을 확인 처리:', unviewedDepositIds.length, unviewedDepositIds);
            
            const { data: updatedData, error: updateError } = await supabase
              .from('deposits')
              .update({ 
                viewed_by_store: true, 
                viewed_at: new Date().toISOString() 
              })
              .in('deposit_id', unviewedDepositIds)
              .select();

            if (updateError) {
              console.error('❌ viewed_by_store 업데이트 실패:', updateError);
            } else {
              console.log('✅ viewed_by_store 업데이트 성공:', updatedData?.length);
              
              // Header의 알림 배지를 즉시 업데이트하기 위해 커스텀 이벤트 발생
              window.dispatchEvent(new CustomEvent('deposits-viewed'));
            }
          }
        }
      }

      // Withdrawals
      let withdrawalQuery = supabase
        .from('withdrawals')
        .select(`
          *,
          users!withdrawals_user_id_fkey(username, email)
        `);

      if (user.role !== 'master') {
        withdrawalQuery = withdrawalQuery.in('user_id', allowedUserIds);
      }

      const { data: withdrawalData } = await withdrawalQuery.order('created_at', { ascending: false });

      if (withdrawalData) {
        setWithdrawals(withdrawalData.map((item: any) => ({
          ...item,
          username: item.users?.username,
          email: item.users?.email
        })));
      }

      // Coin Sales (Store -> Center)
      let salesQuery = supabase
        .from('store_coin_sales')
        .select(`
          *,
          users!store_coin_sales_store_id_fkey(username, email)
        `);

      // 센터는 자신에게 들어온 요청 + 하위 가맹점 요청 조회 가능
      // 마스터는 전체
      if (user.role === 'center') {
        salesQuery = salesQuery.eq('center_id', user.id);
      } else if (user.role === 'store') {
        salesQuery = salesQuery.eq('store_id', user.id);
      } else if (user.role !== 'master') {
        // Agency 등은 하위 store_id로 필터링
        salesQuery = salesQuery.in('store_id', allowedUserIds);
      }

      const { data: salesData } = await salesQuery.order('created_at', { ascending: false });

      if (salesData) {
        setCoinSales(salesData.map((item: any) => ({
          ...item,
          store_name: item.users?.username,
          store_email: item.users?.email
        })));
      }

      console.log('📊 Data loaded:', {
        transfers: transferData?.length || 0,
        deposits: depositData?.length || 0,
        withdrawals: withdrawalData?.length || 0,
        coinSales: salesData?.length || 0
      });

    } catch (error) {
      console.error('❌ Error fetching data:', error);
      toast.error('데이터를 가져오는데 실패했습니다');
    }
  };

  const fetchCoinIcons = async () => {
    try {
      const { data: coinData } = await supabase
        .from('supported_tokens')
        .select('symbol, icon_url');

      if (coinData) {
        const icons: Record<string, string> = {};
        coinData.forEach((coin: { symbol: string, icon_url: string }) => {
          icons[coin.symbol] = coin.icon_url;
        });
        setCoinIcons(icons);
      }
    } catch (error) {
      console.error('❌ Error fetching coin icons:', error);
      toast.error('코인 아이콘을 가져오는데 실패했습니다');
    }
  };

  // 코인 구매 요청 승인 (User -> Center)
  const handleApproveRequest = async (request: TransferRequest) => {
    if (!adminNote.trim()) {
      toast.error('관리자 메모를 입력해주세요');
      return;
    }

    if (!user?.id) {
      toast.error('로그인 정보를 찾을 수 없습니다');
      return;
    }

    setIsProcessing(true);

    try {
      // 1. 사용자의 가스비 지원 여부 업데이트
      const { error: updateError } = await supabase
        .from('users')
        .update({ gas_sponsor_enabled: gasSponsorEnabled })
        .eq('user_id', request.user_id);

      if (updateError) {
        console.error('❌ 가스비 지원 설정 업데이트 실패:', updateError);
        toast.error('가스비 지원 설정 업데이트에 실패했습니다');
        setIsProcessing(false);
        return;
      }

      console.log('✅ 가스비 지원 설정 업데이트:', {
        userId: request.user_id,
        gasSponsorEnabled
      });

      // 2. 승인 처리 (TRX 위임 옵션 포함)
      const result = await approveTransferRequest({
        request: {
          request_id: request.request_id,
          user_id: request.user_id,
          wallet_id: request.wallet_id,
          coin_type: request.coin_type,
          amount: request.amount
        },
        adminNote,
        adminId: user.id,
        shouldDelegateTRX: gasSponsorEnabled
      });

      if (result.success) {
        toast.success(`승인되었습니다. 가스비 지원: ${gasSponsorEnabled ? '활성화 (TRX 위임됨)' : '비활성화'}`);
        setSelectedRequest(null);
        setAdminNote('');
        setGasEstimate(null);
        setGasSponsorEnabled(true); // 기본값으로 리셋
        fetchData();
      } else {
        toast.error(result.error || '승인 처리에 실패했습니다');
      }
    } catch (error: any) {
      console.error('❌ 승인 오류:', error);
      toast.error(error.message || '승인 처리 중 오류가 발생했습니다');
    } finally {
      setIsProcessing(false);
    }
  };

  // 코인 판매 요청 승인 (Store -> Center)
  const handleApproveCoinSaleRequest = async (sale: CoinSaleRequest) => {
    if (!adminNote.trim()) {
      toast.error('관리자 메모를 입력해주세요');
      return;
    }

    if (!user?.id) {
      toast.error('로그인 정보를 찾을 수 없습니다');
      return;
    }

    setIsProcessing(true);

    try {
      const result = await approveCoinSale({
        sale,
        adminId: user.id,
        adminNote,
        gasSponsorEnabled
      });

      if (result.success) {
        setSelectedCoinSale(null);
        setAdminNote('');
        setGasSponsorEnabled(true); // 기본값으로 리셋
        fetchData();
      } else {
        toast.error(result.error || '승인 처리에 실패했습니다');
      }
    } catch (error: any) {
      console.error('❌ 승인 오류:', error);
      toast.error(error.message || '승인 처리 중 오류가 발생했습니다');
    } finally {
      setIsProcessing(false);
    }
  };

  // 코인 판매 요청 거절
  const handleRejectCoinSale = async (sale: CoinSaleRequest) => {
    if (!adminNote.trim()) {
      toast.error('거절 사유(메모)를 입력해주세요');
      return;
    }

    setIsProcessing(true);

    try {
      const { error } = await supabase
        .from('store_coin_sales')
        .update({
          status: 'rejected',
          admin_note: adminNote,
          approved_by: user?.id,
          approved_at: new Date().toISOString() // 거절 시각으로 사용
        })
        .eq('sale_id', sale.sale_id);

      if (error) throw error;

      toast.success('판매 요청이 거절되었습니다');
      setSelectedCoinSale(null);
      setAdminNote('');
      fetchData();
    } catch (error: any) {
      console.error('❌ 거절 오류:', error);
      toast.error('거절 처리에 실패했습니다');
    } finally {
      setIsProcessing(false);
    }
  };

  // 네트워크 타입 판단 (TRON vs EVM)
  const isTronNetwork = (coinType: string): boolean => {
    return coinType.includes('TRX') || coinType.includes('TRC') || coinType.includes('USDT');
  };

  // 센터 운영 모드 확인 및 가스비 추정 (EVM 네트워크만)
  const checkModeAndEstimateGas = async (request: TransferRequest) => {
    try {
      if (!user?.id) return;
      
      // TRON 네트워크는 가스비 추정 불필요 (수수료에서 표시)
      if (isTronNetwork(request.coin_type)) {
        console.log('🔶 TRON 네트워크 감지: 거래 수수료 사용');
        setIsEstimatingGas(false);
        
        // TRON의 경우: 관리자의 TRX 잔액 확인
        try {
          const { data: adminWallet } = await supabase
            .from('wallets')
            .select('balance')
            .eq('user_id', user.id)
            .eq('coin_type', 'TRX')
            .single();
          
          if (adminWallet) {
            console.log(`💰 관리자 TRX 잔액: ${adminWallet.balance} TRX`);
            // gasEstimate에 관리자 잔액 정보 추가
            setGasEstimate({
              estimatedCost: adminWallet.balance.toFixed(6),
              token: 'TRX',
              isAdminBalance: true
            });
          }
        } catch (error) {
          console.error('❌ 관리자 TRX 잔액 조회 실패:', error);
        }
        return;
      }
      
      setIsEstimatingGas(true);
      setGasEstimate(null);
      
      // 1. 센터 운영 모드 확인
      const mode = await getCenterOperationMode(user.id);
      setOperationMode(mode);
      console.log('🔧 센터 운영 모드:', mode);
      
      // 2. 프로덕션 모드일 때만 가스비 추정
      if (mode === 'production') {
        // 코인 정보 조회
        const { data: coinData } = await supabase
          .from('supported_tokens')
          .select('contract_address, decimals, rpc_url, chain_id, network')
          .eq('symbol', request.coin_type)
          .single();
        
        if (coinData) {
          // 사용자 지갑 주소 조회
          const { data: userWalletData } = await supabase
            .from('wallets')
            .select('address')
            .eq('wallet_id', request.wallet_id)
            .single();
          
          if (userWalletData) {
            // 가스비 추정
            const estimate = await estimateGas({
              toAddress: userWalletData.address,
              tokenAddress: coinData.contract_address,
              amount: request.amount.toString(),
              decimals: coinData.decimals || 18,
              rpcUrl: coinData.rpc_url,
              chainId: coinData.chain_id
            });
            
            if (estimate) {
              let gasToken = '';
              if (coinData.symbol.includes('USDT') || coinData.symbol.includes('ETH')) {
                gasToken = 'ETH';
              } else if (coinData.symbol.includes('KRWQ') || coinData.symbol.includes('MATIC')) {
                gasToken = 'MATIC';
              } else if (coinData.symbol.includes('TRX')) {
                gasToken = 'TRX';
              } else {
                gasToken = 'ETH';
              }

              setGasEstimate({
                estimatedCost: estimate,
                token: gasToken
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('가스비 추정 오류:', error);
    } finally {
      setIsEstimatingGas(false);
    }
  };

  // 기존 입출금 거절 로직
  const handleRejectRequest = async (request: TransferRequest) => {
    if (!adminNote.trim()) {
      toast.error('관리자 메모를 입력해주세요');
      return;
    }

    setIsProcessing(true);

    try {
      const { error } = await supabase
        .from('transfer_requests')
        .update({
          status: 'rejected',
          admin_note: adminNote,
          approved_at: new Date().toISOString()
        })
        .eq('request_id', request.request_id);

      if (error) throw error;

      toast.success('요청이 거절되었습니다');
      setSelectedRequest(null);
      setAdminNote('');
      fetchData();
    } catch (error: any) {
      console.error('Error rejecting request:', error);
      toast.error('요청 거절에 실패했습니다');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'confirmed':
      case 'approved':
        return 'text-green-400 bg-green-400/10 border-green-400/20';
      case 'pending':
        return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'failed':
      case 'rejected':
        return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'processing':
        return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      default:
        return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    }
  };

  const filteredData = () => {
    let data: any[] = [];
    if (activeTab === 'transfer_requests') data = transferRequests;
    else if (activeTab === 'deposits') data = deposits;
    else if (activeTab === 'withdrawals') data = withdrawals;
    else if (activeTab === 'coin_sales') data = coinSales;

    return data.filter(item => {
      const matchesSearch = 
        item.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.tx_hash?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item as any).store_name?.toLowerCase().includes(searchTerm.toLowerCase()) || // Coin Sales
        (item as any).store_email?.toLowerCase().includes(searchTerm.toLowerCase()); // Coin Sales
      
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  };

  const currentData = filteredData().slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredData().length / itemsPerPage);

  const formatCoinAmount = (amount: number, symbol: string) => {
    return (
      <div className="flex items-center gap-2">
        {coinIcons[symbol] ? (
          <img src={coinIcons[symbol]} alt={symbol} className="w-5 h-5 rounded-full" />
        ) : (
          <CoinsIcon className="w-5 h-5 text-slate-400" />
        )}
        <span className="font-medium text-white">
          {amount.toLocaleString(undefined, { maximumFractionDigits: 8 })}
        </span>
        <span className="text-slate-400 text-sm">{symbol}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">입출금 관리</h2>
          <p className="text-slate-400">사용자 입금, 출금 및 코인 판매 요청을 관리합니다.</p>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex flex-wrap gap-2 border-b border-slate-700 pb-1">
        {/* 센터/에이전시만 "코인 구매 요청" 탭 표시 */}
        {user?.role !== 'store' && (
          <button
            onClick={() => setActiveTab('transfer_requests')}
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
              activeTab === 'transfer_requests'
                ? 'bg-cyan-500/10 text-cyan-400 border-b-2 border-cyan-500'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <ArrowDownCircle className="w-4 h-4" />
              <span>코인 구매 요청</span>
              {transferRequests.filter(r => r.status === 'pending').length > 0 && (
                <span className="bg-cyan-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {transferRequests.filter(r => r.status === 'pending').length}
                </span>
              )}
            </div>
          </button>
        )}
        <button
          onClick={() => setActiveTab('deposits')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'deposits'
              ? 'bg-cyan-500/10 text-cyan-400 border-b-2 border-cyan-500'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <ArrowDownCircle className="w-4 h-4" />
            <span>입금 내역</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('withdrawals')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'withdrawals'
              ? 'bg-cyan-500/10 text-cyan-400 border-b-2 border-cyan-500'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4" />
            <span>출금 내역</span>
          </div>
        </button>
        {/* 센터/에이전시만 "가맹점 판매 요청" 탭 표시 */}
        {user?.role !== 'store' && (
          <button
            onClick={() => setActiveTab('coin_sales')}
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
              activeTab === 'coin_sales'
                ? 'bg-cyan-500/10 text-cyan-400 border-b-2 border-cyan-500'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4" />
              <span>가맹점 판매 요청</span>
              {coinSales.filter(r => r.status === 'pending').length > 0 && (
                <span className="bg-cyan-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {coinSales.filter(r => r.status === 'pending').length}
                </span>
              )}
            </div>
          </button>
        )}
      </div>

      {/* 필터 및 검색 */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={activeTab === 'coin_sales' ? "가맹점명, 이메일 검색..." : "사용자명, 이메일, TX Hash 검색..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg text-white px-4 py-2 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">모든 상태</option>
            <option value="pending">대기중</option>
            <option value="approved">승인됨</option>
            <option value="rejected">거절됨</option>
            <option value="confirmed">확인됨</option>
            <option value="completed">완료됨</option>
          </select>
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  {activeTab === 'coin_sales' ? '요청 일시' : '날짜'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  {activeTab === 'coin_sales' ? '가맹점' : '사용자'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  {activeTab === 'coin_sales' ? '판매 수량' : '수량'}
                </th>
                {activeTab === 'coin_sales' && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    원화 환산
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">상태</th>
                {(activeTab === 'transfer_requests' || activeTab === 'coin_sales') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">메모</th>
                )}
                {activeTab !== 'transfer_requests' && activeTab !== 'coin_sales' && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">TX Hash</th>
                )}
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {currentData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    데이터가 없습니다
                  </td>
                </tr>
              ) : (
                currentData.map((item: any) => (
                  <tr key={item.id || item.request_id || item.deposit_id || item.withdrawal_id || item.sale_id} className="hover:bg-slate-700/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      <div className="flex flex-col">
                        <span>{new Date(item.created_at).toLocaleDateString()}</span>
                        <span className="text-xs text-slate-500">
                          {new Date(item.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-white">
                          {activeTab === 'coin_sales' ? item.store_name : item.username}
                        </span>
                        <span className="text-xs text-slate-400">
                          {activeTab === 'coin_sales' ? item.store_email : item.email}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {formatCoinAmount(item.amount, item.coin_type)}
                    </td>
                    {activeTab === 'coin_sales' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                        {item.krw_value ? `₩${item.krw_value.toLocaleString()}` : '-'}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(item.status)}`}>
                        {item.status === 'pending' ? '대기중' :
                         item.status === 'approved' ? '승인됨' :
                         item.status === 'rejected' ? '거절됨' :
                         item.status === 'confirmed' ? '확인됨' :
                         item.status === 'completed' ? '완료됨' : item.status}
                      </span>
                    </td>
                    {(activeTab === 'transfer_requests' || activeTab === 'coin_sales') && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300 max-w-xs truncate">
                        {item.user_note || item.request_note || '-'}
                      </td>
                    )}
                    {activeTab !== 'transfer_requests' && activeTab !== 'coin_sales' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-cyan-400 font-mono">
                        {item.tx_hash ? (
                           <div className="flex items-center gap-1">
                             <span className="truncate max-w-[100px]">{item.tx_hash}</span>
                             <button
                               onClick={() => {
                                 fetchTxDetail(item.tx_hash);
                               }}
                               disabled={isFetchingTxDetail}
                               className="p-1 hover:bg-slate-700 rounded disabled:opacity-50"
                               title="거래 상세 정보 조회"
                             >
                               <ExternalLink className="w-3 h-3" />
                             </button>
                           </div>
                        ) : '-'}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {item.status === 'pending' && activeTab === 'transfer_requests' && (
                        <button
                          onClick={() => {
                            setSelectedRequest(item);
                            checkModeAndEstimateGas(item);
                          }}
                          className="text-cyan-400 hover:text-cyan-300"
                        >
                          처리하기
                        </button>
                      )}
                      {item.status === 'pending' && activeTab === 'coin_sales' && (
                        <button
                          onClick={() => {
                            setSelectedCoinSale(item);
                            checkModeAndEstimateGas(item);
                          }}
                          className="text-cyan-400 hover:text-cyan-300"
                        >
                          처리하기
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between">
          <div className="text-sm text-slate-400">
            총 {filteredData().length}개 중 {(currentPage - 1) * itemsPerPage + 1}-
            {Math.min(currentPage * itemsPerPage, filteredData().length)} 표시
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-slate-700 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-slate-700 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>
      </div>

      {/* 코인 구매 승인 모달 */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">코인 구매 승인 처리</h3>
            
            <div className="space-y-4">
              <div className="bg-slate-800 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">신청자</span>
                  <span className="text-white">{selectedRequest.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">코인</span>
                  <span className="text-cyan-400 font-medium">{selectedRequest.coin_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">수량</span>
                  <span className="text-white font-medium">{selectedRequest.amount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">신청 메모</span>
                  <span className="text-slate-300">{selectedRequest.user_note || '-'}</span>
                </div>
              </div>

              {/* 가스비 추정 결과 (EVM 네트워크만) */}
              {!isTronNetwork(selectedRequest.coin_type) && (
                <>
                  {isEstimatingGas ? (
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-400 flex items-center gap-2">
                       <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                       가스비 계산 중...
                    </div>
                  ) : gasEstimate ? (
                    <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm space-y-1">
                       <div className="text-green-400 font-medium flex items-center gap-2">
                         <CheckCircle className="w-4 h-4" />
                         전송 가능 (예상 가스비: {gasEstimate.estimatedCost} {gasEstimate.token})
                       </div>
                       <div className="text-slate-400 text-xs">
                         운영 모드: {operationMode === 'production' ? '프로덕션 (실제 전송)' : '개발 (가짜 전송)'}
                       </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-700/50 rounded-lg text-sm text-slate-400">
                      가스비 정보를 불러올 수 없습니다.
                    </div>
                  )}
                </>
              )}

              {/* 거래 수수료 추정 (TRON 네트워크만) */}
              {isTronNetwork(selectedRequest.coin_type) && (
                <>
                  {isEstimatingFee ? (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-400 flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                      수수료 계산 중...
                    </div>
                  ) : transactionFee ? (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm space-y-1">
                      {transactionFee.warning && (
                        <div className="text-yellow-400 font-medium flex items-center gap-2 mb-2">
                          <Bell className="w-4 h-4" />
                          {transactionFee.warning}
                        </div>
                      )}
                      <div className="text-amber-400 font-medium">
                        평균 수수료: {transactionFee.average_fee.toFixed(6)} TRX
                      </div>
                      <div className="text-slate-400 text-xs grid grid-cols-2 gap-2 mt-2">
                        <div>최소: {transactionFee.min_fee.toFixed(6)} TRX</div>
                        <div>최대: {transactionFee.max_fee.toFixed(6)} TRX</div>
                      </div>
                      {!transactionFee.can_estimate && (
                        <div className="text-yellow-300 text-xs mt-2 p-2 bg-yellow-500/20 rounded">
                          ⚠️ 거래 이력이 5건 미만이므로 정확한 수수료 추정이 어려울 수 있습니다.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-700/50 rounded-lg text-sm text-slate-400">
                      ℹ️ 충분한 거래 이력이 없어 수수료를 계산할 수 없습니다. (최소 5건 이상 필요)
                    </div>
                  )}

                  {/* 관리자 TRX 잔액 확인 */}
                  {gasEstimate && gasEstimate.isAdminBalance && (
                    <div className={`p-3 border rounded-lg text-sm space-y-1 ${
                      parseFloat(gasEstimate.estimatedCost) >= (transactionFee?.average_fee || 0.001)
                        ? 'bg-green-500/10 border-green-500/20'
                        : 'bg-red-500/10 border-red-500/20'
                    }`}>
                      <div className={`font-medium flex items-center gap-2 ${
                        parseFloat(gasEstimate.estimatedCost) >= (transactionFee?.average_fee || 0.001)
                          ? 'text-green-400'
                          : 'text-red-400'
                      }`}>
                        {parseFloat(gasEstimate.estimatedCost) >= (transactionFee?.average_fee || 0.001) ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <AlertCircle className="w-4 h-4" />
                        )}
                        관리자 TRX 잔액: {gasEstimate.estimatedCost} TRX
                      </div>
                      {transactionFee && (
                        <div className="text-slate-400 text-xs">
                          예상 수수료: {transactionFee.average_fee.toFixed(6)} TRX
                        </div>
                      )}
                      {parseFloat(gasEstimate.estimatedCost) < (transactionFee?.average_fee || 0.001) && (
                        <div className="text-red-300 text-xs mt-2 p-2 bg-red-500/20 rounded">
                          ❌ TRX 부족: 전송할 수 없습니다. 관리자는 추가 TRX가 필요합니다.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  관리자 메모 (승인/거절 사유)
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="w-full h-24 bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-cyan-500"
                  placeholder="메모를 입력하세요..."
                />
              </div>

              {/* 가스비 지원 설정 */}
              <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-white mb-1">가스비 지원 (자동 출금)</h4>
                    <p className="text-xs text-slate-400">
                      활성화 시 해당 사용자는 자동 출금이 가능합니다. 비활성화 시 출금이 제한됩니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGasSponsorEnabled(!gasSponsorEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                      gasSponsorEnabled ? 'bg-cyan-500' : 'bg-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        gasSponsorEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <div className="mt-2 text-xs">
                  <span className={`font-medium ${gasSponsorEnabled ? 'text-green-400' : 'text-red-400'}`}>
                    {gasSponsorEnabled ? '✓ 활성화됨 (자동 출금 가능)' : '✗ 비활성화됨 (자동 출금 불가)'}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => handleRejectRequest(selectedRequest)}
                  disabled={isProcessing}
                  className="flex-1 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg font-medium transition-colors"
                >
                  거절
                </button>
                <button
                  onClick={() => handleApproveRequest(selectedRequest)}
                  disabled={isProcessing}
                  className="flex-1 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      처리중...
                    </>
                  ) : (
                    '승인'
                  )}
                </button>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="w-full py-2 text-slate-400 hover:text-white transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 코인 판매 승인 모달 */}
      {selectedCoinSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">가맹점 판매 요청 승인</h3>
            
            <div className="space-y-4">
              <div className="bg-slate-800 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">가맹점</span>
                  <span className="text-white">{selectedCoinSale.store_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">코인</span>
                  <span className="text-cyan-400 font-medium">{selectedCoinSale.coin_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">수량</span>
                  <span className="text-white font-medium">{selectedCoinSale.amount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">원화 환산</span>
                  <span className="text-white font-medium">
                     {selectedCoinSale.krw_value ? `₩${selectedCoinSale.krw_value.toLocaleString()}` : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">신청 메모</span>
                  <span className="text-slate-300">{selectedCoinSale.request_note || '-'}</span>
                </div>
              </div>

              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-400">
                <p className="font-semibold mb-1">⚠️ 주의사항</p>
                <p>승인 시 가맹점 지갑에서 코인이 차감되고, 센터 지갑으로 이동됩니다. 해당 금액을 가맹점에게 정산해주셨는지 확인하세요.</p>
              </div>

              {/* 관리자 TRX 잔액 확인 */}
              {gasEstimate && gasEstimate.isAdminBalance && (
                <div className={`p-3 border rounded-lg text-sm space-y-1 ${
                  parseFloat(gasEstimate.estimatedCost) >= (transactionFee?.average_fee || 0.001)
                    ? 'bg-green-500/10 border-green-500/20'
                    : 'bg-red-500/10 border-red-500/20'
                }`}>
                  <div className={`font-medium flex items-center gap-2 ${
                    parseFloat(gasEstimate.estimatedCost) >= (transactionFee?.average_fee || 0.001)
                      ? 'text-green-400'
                      : 'text-red-400'
                  }`}>
                    {parseFloat(gasEstimate.estimatedCost) >= (transactionFee?.average_fee || 0.001) ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                    관리자 TRX 잔액: {gasEstimate.estimatedCost} TRX
                  </div>
                  {transactionFee && (
                    <div className="text-slate-400 text-xs">
                      예상 수수료: {transactionFee.average_fee.toFixed(6)} TRX
                    </div>
                  )}
                  {parseFloat(gasEstimate.estimatedCost) < (transactionFee?.average_fee || 0.001) && (
                    <div className="text-red-300 text-xs mt-2 p-2 bg-red-500/20 rounded">
                      ❌ TRX 부족: 위임할 수 없습니다. 관리자는 추가 TRX가 필요합니다.
                    </div>
                  )}
                </div>
              )}

              {/* 가스비 지원 설정 */}
              <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-white mb-1">TRX 위임 (가스비 지원)</h4>
                    <p className="text-xs text-slate-400">
                      활성화 시 센터의 TRX 자원을 가맹점에게 위임하여 거래 수수료를 지원합니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGasSponsorEnabled(!gasSponsorEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                      gasSponsorEnabled ? 'bg-cyan-500' : 'bg-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        gasSponsorEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <div className="mt-2 text-xs">
                  <span className={`font-medium ${gasSponsorEnabled ? 'text-green-400' : 'text-red-400'}`}>
                    {gasSponsorEnabled ? '✓ 활성화됨 (TRX 위임 가능)' : '✗ 비활성화됨 (위임 안함)'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  관리자 메모 (필수)
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="w-full h-24 bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-cyan-500"
                  placeholder="정산 관련 메모를 입력하세요..."
                />
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => handleRejectCoinSale(selectedCoinSale)}
                  disabled={isProcessing}
                  className="flex-1 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg font-medium transition-colors"
                >
                  거절
                </button>
                <button
                  onClick={() => handleApproveCoinSaleRequest(selectedCoinSale)}
                  disabled={isProcessing}
                  className="flex-1 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      처리중...
                    </>
                  ) : (
                    '승인 및 정산'
                  )}
                </button>
              </div>
              <button
                onClick={() => setSelectedCoinSale(null)}
                className="w-full py-2 text-slate-400 hover:text-white transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TX 상세 조회 모달 */}
      {selectedTxHash && txDetail && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-96 overflow-y-auto">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ExternalLink className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-xl font-bold text-white">거래 상세 정보</h3>
                  {txDetail.development_mode && (
                    <p className="text-xs text-yellow-400 mt-1">⚠️ {txDetail.development_mode}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedTxHash(null);
                  setTxDetail(null);
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* 거래 해시 */}
              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm mb-1">거래 ID (Hash)</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-cyan-400 font-mono text-sm break-all">{txDetail.hash}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(txDetail.hash);
                      toast.success('복사되었습니다');
                    }}
                    className="p-2 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-white"
                    title="클립보드에 복사"
                  >
                    📋
                  </button>
                </div>
              </div>

              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <p className="text-slate-400 text-sm mb-1">상태</p>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    txDetail.status === 'success' 
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {txDetail.status === 'success' ? '✓ 성공' : '✗ 실패'}
                  </span>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-4">
                  <p className="text-slate-400 text-sm mb-1">확인 상태</p>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    txDetail.confirmed 
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  }`}>
                    {txDetail.confirmed ? '✓ 확인됨' : '⏳ 대기 중'}
                  </span>
                </div>
              </div>

              {/* 금액 및 수수료 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <p className="text-slate-400 text-sm mb-1">금액</p>
                  <p className="text-white font-bold text-lg">{parseFloat(txDetail.amount).toFixed(6)} TRX</p>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-4">
                  <p className="text-slate-400 text-sm mb-1">수수료</p>
                  <p className="text-white font-bold text-lg">{parseFloat(txDetail.fee).toFixed(6)} TRX</p>
                </div>
              </div>

              {/* 주소 정보 */}
              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm mb-2">발신자</p>
                <code className="text-slate-300 font-mono text-sm break-all">{txDetail.from}</code>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm mb-2">수신자</p>
                <code className="text-slate-300 font-mono text-sm break-all">{txDetail.to}</code>
              </div>

              {/* 기타 정보 */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <p className="text-slate-400 mb-1">블록</p>
                  <p className="text-white font-mono">{txDetail.block}</p>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-4">
                  <p className="text-slate-400 mb-1">타임스탬프</p>
                  <p className="text-white text-xs">{new Date(txDetail.timestamp).toLocaleString('ko-KR')}</p>
                </div>
              </div>

              {/* TronScan 링크 */}
              <div className="flex gap-2 pt-2">
                <a
                  href={txDetail.tx_detail_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-4 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-400 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  TronScan에서 보기
                </a>

                <button
                  onClick={() => {
                    setSelectedTxHash(null);
                    setTxDetail(null);
                  }}
                  className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}