import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase/client';
import { Notification } from '../utils/supabase/types';
import { toast } from 'sonner@2.0.3';

interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearNotification: (id: string) => void;
}

export function useNotifications(userId: string | undefined, isAdmin: boolean = false): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Supabase에서 알림 불러오기
  useEffect(() => {
    if (!userId) {
      console.log('🔔 useNotifications - userId is null');
      return;
    }
    
    console.log('🔔 useNotifications - Fetching notifications for userId:', userId);

    const fetchNotifications = async () => {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) {
          console.error('❌ Failed to fetch notifications:', error);
          return;
        }

        if (data) {
          console.log('✅ Fetched notifications:', data.length, 'items');
          // DB 형식을 Notification 타입으로 변환
          const formattedNotifications: Notification[] = data.map(n => ({
            id: n.notification_id,
            user_id: n.user_id,
            type: n.type as Notification['type'],
            title: n.title,
            message: n.message,
            read: n.is_read,
            created_at: n.created_at,
            data: n.data,
          }));
          setNotifications(formattedNotifications);
          console.log('✅ Notifications set:', formattedNotifications.length);
        } else {
          console.log('ℹ️ No notification data');
        }
      } catch (err) {
        console.error('❌ Exception fetching notifications:', err);
      }
    };

    fetchNotifications();

    // 실시간 구독: 새 알림 감지
    const notificationChannel = supabase
      .channel(`notifications_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload: any) => {
          console.log('🔔 Notification change detected:', payload);
          fetchNotifications();
          
          // 새 알림이면 소리 재생
          if (payload.eventType === 'INSERT') {
            try {
              const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHGS57OihUhELTKXh8bllHAU2jdXzzn0pBSl+zPLaizsIGGK37OihUhEMUKjj8bllHAU2jdXzzn0pBSh+zPLaizsIG2G37OihUhEMUKjj8bllHAU1jdXzzn0pBSh+zPLaizsIG2G37OihUxELT6jj8rllHAU1jdXzzn0pBSh+zPLaizsIG2G37OihUxELT6jj8rllHAU1jdXzzn0pBSh+zPLaizsIG2G37OihUxELT6jj8rllHAU1jdXzzn0pBSh+zPLaizsIG2G37OihUxELT6jj8rllHAU1jdXzzn0pBSh+zPLaizsIG2G37OihUxELT6jj8rllHAU1jdXzzn0pBSh+zPLaizsIG2G37OihUxELT6jj8rllHAU1jdXzzn0pBSh+zPLaizsIG2G37OihUxELT6jj8rllHAU1jdXzzn0pBSh+zPLaizsIG2G37OihUxELT6jj8rllHAU1jdXzzn0pBSh+zPLaizsIG2G37OihUxELT6jj8rllHAU1jdXzzn0pBSh+zPLaizsIG2G37OihUxELT6jj8rllHAU1jdXzzn0pBSh+zPLaizsIG2G37OihU');
              audio.volume = 0.2;
              audio.play().catch(() => {}); 
            } catch (e) {
              // 알림음 재생 실패해도 무시
            }
          }
        }
      )
      .subscribe();

    return () => {
      notificationChannel.unsubscribe();
    };
  }, [userId]);

  // 관리자 실시간 구독 (기존 로직 유지)
  useEffect(() => {
    if (!userId || !isAdmin) return;

    const channels: any[] = [];

    // 1. 새 회원가입 감지
    const signupChannel = supabase
      .channel('admin-signups')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'users' },
        async (payload: any) => {
          // DB에 알림 생성
          await supabase.from('notifications').insert({
            user_id: userId,
            type: 'signup',
            title: '새 회원 가입',
            message: `${payload.new.username || payload.new.email}님이 가입했습니다.`,
            is_read: false,
            data: payload.new,
          });
        }
      )
      .subscribe();
    channels.push(signupChannel);

    // 2. 계좌 인증 요청 감지
    const verificationChannel = supabase
      .channel('admin-verifications')
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'account_verifications',
          filter: 'status=eq.pending'
        },
        async (payload: any) => {
          // DB에 알림 생성
          await supabase.from('notifications').insert({
            user_id: userId,
            type: 'verification_request',
            title: '1원 인증 요청',
            message: `새로운 계좌 인증 요청이 있습니다.`,
            is_read: false,
            data: payload.new,
          });
        }
      )
      .subscribe();
    channels.push(verificationChannel);

    return () => {
      channels.forEach(channel => channel.unsubscribe());
    };
  }, [userId, isAdmin]);

  // 읽음 표시
  const markAsRead = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('notification_id', id);

    if (error) {
      console.error('Failed to mark as read:', error);
      return;
    }

    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  // 전체 읽음 표시
  const markAllAsRead = useCallback(async () => {
    if (!userId) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      console.error('Failed to mark all as read:', error);
      return;
    }

    setNotifications(prev => 
      prev.map(n => ({ ...n, read: true }))
    );
  }, [userId]);

  // 알림 삭제
  const clearNotification = useCallback((id: string) => {
    supabase
      .from('notifications')
      .delete()
      .eq('notification_id', id)
      .then(({ error }) => {
        if (error) {
          console.error('Failed to delete notification:', error);
          return;
        }
        
        setNotifications(prev => prev.filter(n => n.id !== id));
      });
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotification,
  };
}
