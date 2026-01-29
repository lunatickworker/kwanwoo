import { supabase } from "./supabase/client";
import { getDateRange } from "./depositHelpers";

export interface SettlementStats {
  total_deposit: number;
  total_withdrawal: number;
  transaction_count: number;
}

export interface CenterWithHierarchy {
  center_id: string;
  center_name: string;
  fee_rate: number;
  child_user_ids: string[];
}

/**
 * 특정 상위 노드(에이전시, 센터, 가맹점)의 모든 하위 사용자 ID 조회
 */
export async function getChildUserIds(parentId: string): Promise<string[]> {
  const userIds = [parentId];
  
  try {
    // 1단계: 직접 하위
    const { data: firstLevel } = await supabase
      .from('users')
      .select('user_id')
      .eq('parent_user_id', parentId);
    
    if (firstLevel && firstLevel.length > 0) {
      const firstLevelIds = firstLevel.map(u => u.user_id);
      userIds.push(...firstLevelIds);
      
      // 2단계: 하위의 하위 (센터 -> 가맹점 -> 회원)
      const { data: secondLevel } = await supabase
        .from('users')
        .select('user_id')
        .in('parent_user_id', firstLevelIds);
      
      if (secondLevel && secondLevel.length > 0) {
        userIds.push(...secondLevel.map(u => u.user_id));
      }
    }
  } catch (error) {
    console.error('getChildUserIds failed:', error);
  }
  
  return [...new Set(userIds)];
}

/**
 * 모든 센터의 계층 구조를 한 번에 조회 (최적화)
 */
export async function getAllCentersWithHierarchy(): Promise<CenterWithHierarchy[]> {
  try {
    // 1. 모든 활성 센터 조회
    const { data: centers } = await supabase
      .from('users')
      .select('user_id, center_name, username, fee_rate')
      .eq('role', 'center')
      .eq('is_active', true);

    if (!centers || centers.length === 0) return [];

    const centerIds = centers.map(c => c.user_id);

    // 2. 첫 번째 레벨 하위 유저 조회 (가맹점)
    const { data: firstLevel } = await supabase
      .from('users')
      .select('user_id, parent_user_id')
      .in('parent_user_id', centerIds);

    const firstLevelIds = (firstLevel || []).map(u => u.user_id);

    // 3. 두 번째 레벨 하위 유저 조회 (회원)
    let secondLevel: any[] = [];
    if (firstLevelIds.length > 0) {
      const { data } = await supabase
        .from('users')
        .select('user_id, parent_user_id')
        .in('parent_user_id', firstLevelIds);
      secondLevel = data || [];
    }

    // 4. 센터별로 하위 유저 ID 그룹핑
    const centerHierarchy = centers.map(center => {
      const directChildren = (firstLevel || [])
        .filter(c => c.parent_user_id === center.user_id)
        .map(c => c.user_id);

      const grandChildren = secondLevel
        .filter(c => directChildren.includes(c.parent_user_id || ''))
        .map(c => c.user_id);

      return {
        center_id: center.user_id,
        center_name: center.center_name || center.username,
        fee_rate: center.fee_rate || 3.0,
        child_user_ids: [center.user_id, ...directChildren, ...grandChildren]
      };
    });

    return centerHierarchy;
  } catch (error) {
    console.error('getAllCentersWithHierarchy failed:', error);
    return [];
  }
}

/**
 * 모든 입출금 데이터를 한 번에 가져와서 유저별로 그룹핑 (최적화)
 */
export async function getBatchSettlementStats(
  centersWithHierarchy: CenterWithHierarchy[],
  startDate: string,
  endDate: string
): Promise<Map<string, SettlementStats>> {
  try {
    // 모든 관련 유저 ID 수집
    const allUserIds = Array.from(
      new Set(centersWithHierarchy.flatMap(c => c.child_user_ids))
    );

    // 병렬로 입금/출금 데이터 조회
    const [depositsResult, withdrawalsResult] = await Promise.all([
      supabase
        .from('deposits')
        .select('user_id, amount')
        .in('user_id', allUserIds)
        .eq('status', 'confirmed')
        .gte('created_at', startDate)
        .lte('created_at', endDate),
      supabase
        .from('withdrawals')
        .select('user_id, amount')
        .in('user_id', allUserIds)
        .in('status', ['completed', 'processing'])
        .gte('created_at', startDate)
        .lte('created_at', endDate)
    ]);

    // 유저별로 그룹핑
    const userStats = new Map<string, { deposits: number; withdrawals: number; count: number }>();

    (depositsResult.data || []).forEach(d => {
      const current = userStats.get(d.user_id) || { deposits: 0, withdrawals: 0, count: 0 };
      current.deposits += Number(d.amount);
      current.count += 1;
      userStats.set(d.user_id, current);
    });

    (withdrawalsResult.data || []).forEach(w => {
      const current = userStats.get(w.user_id) || { deposits: 0, withdrawals: 0, count: 0 };
      current.withdrawals += Number(w.amount);
      current.count += 1;
      userStats.set(w.user_id, current);
    });

    // 센터별로 집계
    const centerStats = new Map<string, SettlementStats>();

    centersWithHierarchy.forEach(center => {
      let total_deposit = 0;
      let total_withdrawal = 0;
      let transaction_count = 0;

      center.child_user_ids.forEach(userId => {
        const stats = userStats.get(userId);
        if (stats) {
          total_deposit += stats.deposits;
          total_withdrawal += stats.withdrawals;
          transaction_count += stats.count;
        }
      });

      centerStats.set(center.center_id, {
        total_deposit,
        total_withdrawal,
        transaction_count
      });
    });

    return centerStats;
  } catch (error) {
    console.error('getBatchSettlementStats failed:', error);
    return new Map();
  }
}

/**
 * 센터의 모든 가맹점 계층 구조를 한 번에 조회 (센터용 최적화)
 */
export async function getStoresWithHierarchy(centerId: string): Promise<CenterWithHierarchy[]> {
  try {
    // 1. 센터의 모든 활성 가맹점 조회
    const { data: stores } = await supabase
      .from('users')
      .select('user_id, center_name, username, fee_rate')
      .eq('role', 'store')
      .eq('parent_user_id', centerId)
      .eq('is_active', true);

    if (!stores || stores.length === 0) return [];

    const storeIds = stores.map(s => s.user_id);

    // 2. 모든 가맹점의 회원을 한 번에 조회
    const { data: members } = await supabase
      .from('users')
      .select('user_id, parent_user_id')
      .in('parent_user_id', storeIds);

    // 3. 가맹점별로 하위 유저 ID 그룹핑
    const storeHierarchy = stores.map(store => {
      const storeMembers = (members || [])
        .filter(m => m.parent_user_id === store.user_id)
        .map(m => m.user_id);

      return {
        center_id: store.user_id,
        center_name: store.center_name || store.username,
        fee_rate: store.fee_rate || 2.5,
        child_user_ids: [store.user_id, ...storeMembers]
      };
    });

    return storeHierarchy;
  } catch (error) {
    console.error('getStoresWithHierarchy failed:', error);
    return [];
  }
}

/**
 * 여러 날짜 범위의 데이터를 한 번에 조회하여 날짜별로 그룹핑 (센터용 최적화)
 */
export async function getBatchDailyStats(
  storesWithHierarchy: CenterWithHierarchy[],
  dateRanges: Array<{ date: string; start: string; end: string }>
): Promise<Map<string, SettlementStats>> {
  try {
    // 전체 날짜 범위 계산
    const allDates = dateRanges.map(d => ({ start: d.start, end: d.end }));
    const overallStart = allDates[0].start;
    const overallEnd = allDates[allDates.length - 1].end;

    // 모든 관련 유저 ID 수집
    const allUserIds = Array.from(
      new Set(storesWithHierarchy.flatMap(s => s.child_user_ids))
    );

    // 병렬로 전체 기간의 입금/출금 데이터 조회
    const [depositsResult, withdrawalsResult] = await Promise.all([
      supabase
        .from('deposits')
        .select('user_id, amount, created_at')
        .in('user_id', allUserIds)
        .eq('status', 'confirmed')
        .gte('created_at', overallStart)
        .lte('created_at', overallEnd),
      supabase
        .from('withdrawals')
        .select('user_id, amount, created_at')
        .in('user_id', allUserIds)
        .in('status', ['completed', 'processing'])
        .gte('created_at', overallStart)
        .lte('created_at', overallEnd)
    ]);

    // 날짜별 통계 맵
    const dailyStats = new Map<string, SettlementStats>();

    dateRanges.forEach(({ date, start, end }) => {
      let total_deposit = 0;
      let total_withdrawal = 0;
      let transaction_count = 0;

      // 해당 날짜 범위의 입금 집계
      (depositsResult.data || []).forEach(d => {
        if (d.created_at >= start && d.created_at <= end) {
          total_deposit += Number(d.amount);
          transaction_count += 1;
        }
      });

      // 해당 날짜 범위의 출금 집계
      (withdrawalsResult.data || []).forEach(w => {
        if (w.created_at >= start && w.created_at <= end) {
          total_withdrawal += Number(w.amount);
          transaction_count += 1;
        }
      });

      dailyStats.set(date, {
        total_deposit,
        total_withdrawal,
        transaction_count
      });
    });

    return dailyStats;
  } catch (error) {
    console.error('getBatchDailyStats failed:', error);
    return new Map();
  }
}

/**
 * 특정 날짜 범위의 입출금 데이터 집계 (기존 함수 - 하위 호환성 유지)
 */
export async function getSettlementStats(
  userIds: string[],
  startDate: string,
  endDate: string
): Promise<SettlementStats> {
  try {
    // 1. 입금 집계
    const { data: deposits } = await supabase
      .from('deposits')
      .select('amount')
      .in('user_id', userIds)
      .eq('status', 'confirmed')
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    const total_deposit = deposits?.reduce((sum, d) => sum + Number(d.amount), 0) || 0;

    // 2. 출금 집계
    const { data: withdrawals } = await supabase
      .from('withdrawals')
      .select('amount')
      .in('user_id', userIds)
      .in('status', ['completed', 'processing'])
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    const total_withdrawal = withdrawals?.reduce((sum, w) => sum + Number(w.amount), 0) || 0;

    const transaction_count = (deposits?.length || 0) + (withdrawals?.length || 0);

    return {
      total_deposit,
      total_withdrawal,
      transaction_count
    };
  } catch (error) {
    console.error('getSettlementStats failed:', error);
    return { total_deposit: 0, total_withdrawal: 0, transaction_count: 0 };
  }
}