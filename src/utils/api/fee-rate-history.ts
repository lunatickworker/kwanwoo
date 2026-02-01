import { supabase } from '../supabase/client';

/**
 * 수수료율 변경 이력 기록
 */
export async function recordFeeRateChange({
  centerId,
  oldRate = null,
  newRate,
  changedBy = 'system'
}: {
  centerId: string;
  oldRate?: number | null;
  newRate: number;
  changedBy?: string;
}) {
  try {
    // metadata JSONB 컬럼에 수수료율 변경 이력 저장
    const { data: centerData, error: fetchError } = await supabase
      .from('users')
      .select('metadata')
      .eq('user_id', centerId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const currentMetadata = centerData?.metadata || {};
    const feeRateHistory = currentMetadata.fee_rate_history || [];

    // 새 이력 추가
    const newHistory = {
      old_rate: oldRate,
      new_rate: newRate,
      changed_at: new Date().toISOString(),
      changed_by: changedBy
    };

    feeRateHistory.push(newHistory);

    // metadata 업데이트
    const { error: updateError } = await supabase
      .from('users')
      .update({
        metadata: {
          ...currentMetadata,
          fee_rate_history: feeRateHistory
        }
      })
      .eq('user_id', centerId);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error: any) {
    console.error('수수료율 변경 이력 기록 실패:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 수수료율 변경 이력 조회
 */
export async function getFeeRateHistory(centerId: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('metadata')
      .eq('user_id', centerId)
      .single();

    if (error) throw error;

    const feeRateHistory = data?.metadata?.fee_rate_history || [];
    
    // 변경자 정보 추가
    if (feeRateHistory.length > 0) {
      // 모든 변경자 ID 수집
      const changedByIds = new Set<string>();
      feeRateHistory.forEach((history: any) => {
        if (history.changed_by && history.changed_by !== 'system') {
          changedByIds.add(history.changed_by);
        }
      });

      // 변경자 정보 일괄 조회
      if (changedByIds.size > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('user_id, username, center_name, role')
          .in('user_id', Array.from(changedByIds));

        if (!usersError && usersData) {
          // 변경자 ID -> 이름 매핑 생성
          const userMap = new Map<string, string>();
          usersData.forEach(u => {
            const displayName = u.center_name || u.username || u.user_id.slice(0, 8);
            userMap.set(u.user_id, displayName);
          });

          // 각 히스토리 항목에 변경자 이름 추가
          feeRateHistory.forEach((item: any) => {
            if (item.changed_by === 'system') {
              item.changed_by_name = '시스템';
            } else {
              item.changed_by_name = userMap.get(item.changed_by) || item.changed_by.slice(0, 8);
            }
          });
        }
      } else {
        // 모두 시스템 변경인 경우
        feeRateHistory.forEach((item: any) => {
          item.changed_by_name = '시스템';
        });
      }
    }
    
    return { success: true, history: feeRateHistory };
  } catch (error: any) {
    console.error('수수료율 변경 이력 조회 실패:', error);
    return { success: false, error: error.message, history: [] };
  }
}

/**
 * 특정 일자의 수수료율 조회 (정산 시 사용)
 */
export async function getFeeRateAtDate(centerId: string, targetDate: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('fee_rate, metadata')
      .eq('user_id', centerId)
      .single();

    if (error) throw error;

    const currentRate = data.fee_rate || 3.0;
    const feeRateHistory = data.metadata?.fee_rate_history || [];

    // 변경 이력이 없으면 현재 수수료율 반환
    if (feeRateHistory.length === 0) {
      return { success: true, rate: currentRate };
    }

    // 대상 일자 이전의 가장 최근 수수료율 찾기
    const targetDateTime = new Date(targetDate).getTime();
    let applicableRate = currentRate;

    for (let i = feeRateHistory.length - 1; i >= 0; i--) {
      const historyItem = feeRateHistory[i];
      const changeDateTime = new Date(historyItem.changed_at).getTime();

      if (changeDateTime <= targetDateTime) {
        applicableRate = historyItem.new_rate;
        break;
      }
    }

    return { success: true, rate: applicableRate };
  } catch (error: any) {
    console.error('수수료율 조회 실패:', error);
    return { success: false, error: error.message, rate: 3.0 };
  }
}