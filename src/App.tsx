import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { toast, Toaster } from "sonner@2.0.3";
import { UserApp } from "./user/App";
import { AdminApp } from "./components/AdminApp";
import { MasterApp } from "./components/MasterApp";
import { Login } from "./components/Login";
import {
  getTenantInfo,
  getDomainType,
  isRoleAllowedForDomain,
  redirectToCorrectDomain,
} from "./utils/domain";
import { startPriceUpdateService } from "./utils/priceUpdater";
import { TransactionMonitor } from "./components/TransactionMonitor";
import { checkDBHealth } from "./utils/db-health-check";
import "./utils/debug-users";
import "./utils/fix-template-id"; // ✅ 템플릿 ID 수동 수정 유틸리티 로드

// 라우팅 타입 정의
type Route ="admin"

// Tenant 정보 인터페이스
interface TenantContext {
  centerId: string;
  centerName: string;
  domain: string;
  logoUrl: string | null;
  templateId: string;
  designTheme: any;
}

// 404 Not Found 페이지
function NotFoundPage() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-cyan-400 mb-4">
          404 - 페이지를 찾을 수 없습니다
        </h1>
        <p className="text-slate-400">
          유효하지 않은 도메인이거나 접근 권한이 없습니다.
        </p>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();
  const [currentRoute, setCurrentRoute] =
    useState<Route>("user");
  const [tenantInfo, setTenantInfo] =
    useState<TenantContext | null>(null);
  const [domainType, setDomainType] = useState<
    "main" | "admin" | null
  >(null);
  const [domainLoading, setDomainLoading] = useState(true);

  // 도메인 기반 Tenant 정보 로드
  useEffect(() => {
    async function loadTenantInfo() {
      try {
        // 현재 도메인의 Tenant 정보 조회 (백그라운드)
        const tenant = await getTenantInfo();
        const type = await getDomainType();

        setTenantInfo(tenant);
        setDomainType(type);
        setDomainLoading(false); // 로딩 완료

        // 🔥 admin 서브도메인이면 자동으로 /#admin으로 리디렉션
        // 단, 이미 hash가 있는 경우는 건드리지 않음
        if (type === "admin" && !window.location.hash) {
          window.location.hash = "#admin/login";
        }
      } catch (error) {
        console.error("[App] Tenant 정보 로드 실패:", error);
        setDomainLoading(false); // 에러 발생해도 로딩 해제
      }
    }

    // 도메인 로딩은 즉시 완료로 설정 (블로킹 방지)
    setDomainLoading(false);

    // 백그라운드에서 Tenant 정보 로드
    loadTenantInfo();
  }, []);

  // ============================================
  // 라우팅 로직 (간단 버전)
  // ============================================
  useEffect(() => {
    if (isLoading) return;

    const hash = window.location.hash.slice(1);

    // ==========================================
    // 1. Hash 라우팅 (우선순위 1)
    // ==========================================

    // #master 경로
    if (hash.startsWith("master")) {
      if (user?.role === "master") {
        setCurrentRoute("master");
      } else {
        setCurrentRoute("admin-login");
      }
      return;
    }

    // #admin/login 경로
    if (hash === "admin/login") {
      setCurrentRoute("admin-login");
      return;
    }

    // #admin 경로 (센터/에이전시/가맹점 관리)
    if (hash.startsWith("admin")) {
      if (
        user &&
        ["center", "agency", "store", "admin"].includes(
          user.role,
        )
      ) {
        setCurrentRoute("admin");
      } else {
        setCurrentRoute("admin-login");
      }
      return;
    }

    // ==========================================
    // 2. Role 기반 라우팅 (hash 없을 때)
    // ==========================================

    if (!user) {
      setCurrentRoute("user");
      return;
    }

    // Master
    if (user.role === "master") {
      window.location.hash = "#master";
      setCurrentRoute("master");
      return;
    }

    // 센터/에이전시/가맹점/admin
    if (
      ["center", "agency", "store", "admin"].includes(user.role)
    ) {
      window.location.hash = "#admin";
      setCurrentRoute("admin");
      return;
    }

    // 일반 회원
    if (user.role === "user") {
      setCurrentRoute("user");
      return;
    }

    // 기타
    setCurrentRoute("not-found");
  }, [user, isLoading]);

  // Hash 변경 감지
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);

      // #master
      if (hash.startsWith("master")) {
        if (user?.role === "master") {
          setCurrentRoute("master");
        } else {
          setCurrentRoute("admin-login");
        }
      }
      // #admin/login
      else if (hash === "admin/login") {
        setCurrentRoute("admin-login");
      }
      // #admin
      else if (hash.startsWith("admin")) {
        if (
          user &&
          ["center", "agency", "store", "admin"].includes(
            user.role,
          )
        ) {
          setCurrentRoute("admin");
        } else {
          setCurrentRoute("admin-login");
        }
      }
      // 기본
      else {
        if (user?.role === "user" || !user) {
          setCurrentRoute("user");
        }
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () =>
      window.removeEventListener(
        "hashchange",
        handleHashChange,
      );
  }, [user]);

  // 로딩 중
  if (isLoading || domainLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4">
        <div className="text-cyan-400 text-lg">Loading...</div>
        <div className="text-slate-500 text-sm">
          {isLoading && '사용자 정보 확인 중...'}
          {domainLoading && '도메인 설정 확인 중...'}
        </div>
        <div className="text-slate-600 text-xs">
          (캐시 삭제 후에도 계속 나타나면 DB 연결 확인)
        </div>
      </div>
    );
  }

  // 라우팅 렌더링
  if (currentRoute === "not-found") {
    return <NotFoundPage />;
  }

  if (currentRoute === "admin-login") {
    return <Login onLoginSuccess={() => {}} />;
  }

  // Admin 페이지 (center, agency, store, admin 역할)
  if (currentRoute === "admin") {
    if (
      !user ||
      !["admin", "agency", "center", "store"].includes(
        user.role,
      )
    ) {
      setCurrentRoute("admin-login");
      window.location.hash = "#admin/login";
      return null;
    }
    return <AdminApp />;
  }

  // 센터 관리자 페이지
  if (currentRoute === "center") {
    if (!user || user.role !== "center") {
      setCurrentRoute("admin-login");
      return null;
    }
    // TODO: CenterDashboard 컴포넌트 구현 필요
    // 현재는 기존 AdminApp 사용
    return <AdminApp />;
  }

  // 가맹점 페이지
  if (currentRoute === "store") {
    if (!user || user.role !== "store") {
      setCurrentRoute("admin-login");
      return null;
    }
    // TODO: StoreDashboard 컴포넌트 구현 필요
    // 현재는 기존 AdminApp 사용 (Phase 2에서 구현)
    return <AdminApp />;
  }

  // 마스터 페이지
  if (currentRoute === "master") {
    if (!user || user.role !== "master") {
      setCurrentRoute("admin-login");
      return null;
    }
    return <MasterApp />;
  }

  // 기본은 사용자 앱 (회원)
  return <UserApp />;
}

function App() {
  // 🚀 가격 업데이트 서비스 시작 (10분마다)
  useEffect(() => {
    console.log("🚀 Initializing price update service...");
    const stopService = startPriceUpdateService(10); // 10분마다 업데이트

    return () => {
      stopService(); // 컴포넌트 언마운트 시 정지
    };
  }, []);

  return (
    <AuthProvider>
      <AppContent />
      <TransactionMonitor />
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "rgb(15 23 42)",
            color: "rgb(148 163 184)",
            border: "1px solid rgba(6, 182, 212, 0.3)",
            boxShadow: "0 0 15px rgba(6, 182, 212, 0.2)",
          },
        }}
      />
    </AuthProvider>
  );
}

export default App;