import { Capacitor } from '@capacitor/core';
import { LocalNotifications, LocalNotificationSchema } from '@capacitor/local-notifications';
import { GameConfig } from '../../game-configs';
import { t } from '../utils/i18n';

/**
 * Genera un identificador numérico entero estable de 32 bits derivado de gameId y weekday.
 * Garantiza que sea determinista, positivo y sin colisiones entre diferentes juegos y días de sorteo.
 */
function getDeterministicNotificationId(gameId: string, weekdayDatalotto: number): number {
  let hash = 0;
  const str = `datalotto_${gameId}_day_${weekdayDatalotto}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0; // Conversión a entero de 32 bits
  }
  // Asegurar entero positivo en rango seguro para NotificationManager de Android
  return Math.abs(hash) % 2147483647 || 1;
}

/**
 * Sincroniza las notificaciones locales periódicas programadas en plataformas nativas (Android/iOS con Capacitor).
 * 
 * En entorno Web/PWA estándar, esta función se ignora por completo (Capacitor.isNativePlatform() === false)
 * y la app utiliza el fallback existente `checkAndTriggerDrawNotifications`.
 *
 * @param config Configuración de notificaciones guardada (enabled, games, hour, etc.)
 * @param games Diccionario de configuraciones de juegos (GAMES)
 */
export async function syncNativeNotifications(
  config: { enabled?: boolean; games?: Record<string, boolean>; hour?: string },
  games: Record<string, GameConfig>
): Promise<void> {
  // 1. Si no estamos en plataforma nativa (web/PWA), no hacer nada y retornar.
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    // 2a. Pedir permisos con LocalNotifications.requestPermissions()
    const permStatus = await LocalNotifications.requestPermissions();
    if (permStatus.display !== 'granted') {
      console.warn('[NotificationScheduler] Permiso de notificaciones no concedido:', permStatus.display);
      return;
    }

    // 2c. Cancelar TODAS las notificaciones previamente programadas por esta app
    const pending = await LocalNotifications.getPending();
    if (pending && pending.notifications && pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map(n => ({ id: n.id }))
      });
    }

    // 2d. Si config.enabled es false -> dejar todo cancelado y salir
    if (!config.enabled) {
      console.info('[NotificationScheduler] Notificaciones desactivadas; todas canceladas.');
      return;
    }

    // Parsear hora configurada (formato "HH:MM", por defecto "09:00")
    const hourStr = (config.hour && config.hour.includes(':')) ? config.hour : '09:00';
    const [hStr, mStr] = hourStr.split(':');
    const hour = parseInt(hStr, 10) || 9;
    const minute = parseInt(mStr, 10) || 0;

    const notificationsToSchedule: LocalNotificationSchema[] = [];

    // 2e. Para cada juego activado y cada día de sorteo
    const userGames = config.games || {};
    for (const [gameId, isEnabled] of Object.entries(userGames)) {
      if (!isEnabled) continue;
      const game = games[gameId];
      if (!game || !Array.isArray(game.drawDays) || game.drawDays.length === 0) continue;

      for (const weekdayDatalotto of game.drawDays) {
        // ⚠️ IMPORTANTE sobre el mapeo de weekday:
        // Capacitor Local Notifications usa 1=Domingo...7=Sábado en su API nativa,
        // mientras que game-configs.ts de DataLotto usa 0=Domingo...6=Sábado.
        // Se convierte explícitamente: weekday_capacitor = weekday_datalotto + 1
        const weekdayCapacitor = weekdayDatalotto + 1;
        const notifId = getDeterministicNotificationId(gameId, weekdayDatalotto);

        const gameName = game.fullName || game.name || gameId;
        const gameLine = `• ${game.flag ? game.flag + ' ' : ''}${gameName}`;

        const notifTitle = `🗓️ ${game.name || gameName}`;
        const notifBody = t('notif.cuerpoSorteosHoy', { lines: gameLine });

        notificationsToSchedule.push({
          id: notifId,
          title: notifTitle,
          body: notifBody,
          schedule: {
            on: {
              weekday: weekdayCapacitor as 1 | 2 | 3 | 4 | 5 | 6 | 7,
              hour,
              minute
            },
            every: 'week'
          }
        });
      }
    }

    if (notificationsToSchedule.length > 0) {
      await LocalNotifications.schedule({
        notifications: notificationsToSchedule
      });
      console.info(`[NotificationScheduler] ${notificationsToSchedule.length} notificaciones semanales programadas a las ${hourStr}.`);
    }
  } catch (err) {
    console.error('[NotificationScheduler] Error al sincronizar notificaciones nativas:', err);
  }
}
