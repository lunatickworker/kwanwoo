import { useState, useEffect } from "react";
import { Building2, AlertTriangle } from "lucide-react";
import { NeonCard } from "../NeonCard";
import { supabase } from "../../utils/supabase/client";
import { toast } from "sonner@2.0.3";

interface Center {
  id: string;
  name: string;
  operation_mode: 'development' | 'production';
  email?: string;
  username?: string;
}

export function CenterOperationModeSettings() {
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCenters();
  }, []);

  const loadCenters = async () => {
    try {
      setLoading(true);

      // users 테이블에서 role='center'인 사용자들 조회
      const { data: centersData, error } = await supabase
        .from('users')
        .select('user_id, username, email, center_name, metadata')
        .eq('role', 'center')
        .order('username');

      if (error) throw error;

      if (centersData && centersData.length > 0) {
        // 각 센터의 operation_mode 확인
        const centersWithMode = centersData.map((center) => {
          const metadata = center.metadata || {};
          return {
            id: center.user_id,
            name: center.center_name || center.username,
            username: center.username,
            email: center.email,
            operation_mode: (metadata.operation_mode as 'development' | 'production') || 'development',
          };
        });

        setCenters(centersWithMode);
      } else {
        setCenters([]);
      }
    } catch (error: any) {
      console.error('센터 목록 로드 실패:', error);
      toast.error('센터 목록을 불러오는데 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = async (centerId: string, newMode: 'development' | 'production') => {
    try {
      setSaving(true);

      // users 테이블의 metadata에 operation_mode 저장
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('metadata')
        .eq('user_id', centerId)
        .single();

      if (fetchError) throw fetchError;

      const updatedMetadata = {
        ...(userData?.metadata || {}),
        operation_mode: newMode
      };

      const { error } = await supabase
        .from('users')
        .update({ metadata: updatedMetadata })
        .eq('user_id', centerId);

      if (error) throw error;

      // 로컬 상태 업데이트
      setCenters(centers.map(c => 
        c.id === centerId ? { ...c, operation_mode: newMode } : c
      ));

      toast.success(`${newMode === 'production' ? '프로덕션' : '개발'} 모드로 변경되었습니다`);
    } catch (error: any) {
      console.error('모드 변경 실패:', error);
      toast.error('모드 변경에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-cyan-400 mb-2 flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          센터별 운영 모드 설정
        </h3>
        <p className="text-slate-400 text-sm">
          각 센터의 개발/프로덕션 모드를 설정합니다
        </p>
      </div>

      {/* Centers List */}
      <div className="space-y-4">
        {centers.length === 0 ? (
          <NeonCard>
            <div className="text-center py-12">
              <Building2 className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg mb-2">등록된 센터가 없습니다</p>
              <p className="text-slate-500 text-sm mb-4">
                센터를 먼저 생성해주세요
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
              >
                새로고침
              </button>
            </div>
          </NeonCard>
        ) : (
          centers.map((center) => (
            <NeonCard key={center.id}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="text-white font-medium mb-1">{center.name}</h4>
                  <p className="text-slate-400 text-sm">센터 ID: {center.id}</p>
                </div>

                <div className="flex items-center gap-3">
                  {/* Mode Toggle */}
                  <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-1">
                    <button
                      onClick={() => handleModeChange(center.id, 'development')}
                      disabled={saving}
                      className={`px-3 py-1.5 rounded text-sm transition-colors ${
                        center.operation_mode === 'development'
                          ? 'bg-blue-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      개발 모드
                    </button>
                    <button
                      onClick={() => handleModeChange(center.id, 'production')}
                      disabled={saving}
                      className={`px-3 py-1.5 rounded text-sm transition-colors ${
                        center.operation_mode === 'production'
                          ? 'bg-green-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      프로덕션 모드
                    </button>
                  </div>
                </div>
              </div>

              {/* Dev Mode Info */}
              {center.operation_mode === 'development' && (
                <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm">
                  <p className="text-blue-400">
                    개발 모드: 관리자 잔액 무한 지급, 가짜 txHash 생성
                  </p>
                </div>
              )}

              {/* Production Mode Info */}
              {center.operation_mode === 'production' && (
                <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm">
                  <p className="text-green-400">
                    프로덕션 모드: wallets 테이블의 실제 지갑에서 코인 차감
                  </p>
                </div>
              )}
            </NeonCard>
          ))
        )}
      </div>
    </div>
  );
}