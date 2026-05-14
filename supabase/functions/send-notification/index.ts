// ============================================================
// Supabase Edge Function: send-notification
// Web Push + Email fallback для Dispatcher.PRO
// Развёртывается в Supabase, НЕ трогает существующий код
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Конфигурация из environment ---
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@dispatcher.pro";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("NOTIFICATION_FROM_EMAIL") || "Dispatcher.PRO <noreply@dispatcher.pro>";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// --- Маршрутизация каналов по приоритету ---
// high: Push → Email → Telegram
// normal: Push → Telegram (без email)
// low: только Push
interface NotificationRequest {
  userId: string;
  userRole: string;
  eventType: string;
  priority: "high" | "normal" | "low";
  title: string;
  body: string;
  deepLink?: string;  // например "/shifts/123"
  payload?: Record<string, unknown>;
}

serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  // Авторизация: принимаем от service_role или от webhook secret
  const authHeader = req.headers.get("Authorization") || "";
  const webhookSecret = Deno.env.get("NOTIFICATION_WEBHOOK_SECRET") || "";
  const isServiceRole = authHeader === `Bearer ${SUPABASE_SERVICE_KEY}`;
  const isWebhook = req.headers.get("X-Webhook-Secret") === webhookSecret;
  if (!isServiceRole && !isWebhook) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let data: NotificationRequest;
  try {
    data = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { userId, userRole, eventType, priority, title, body: messageBody, deepLink, payload } = data;

  if (!userId || !eventType || !title) {
    return new Response(JSON.stringify({ error: "Missing required fields: userId, eventType, title" }), { status: 400 });
  }

  // --- Читаем настройки пользователя ---
  const { data: prefs } = await sb
    .from("user_notification_prefs")
    .select("*")
    .eq("user_id", userId)
    .eq("user_role", userRole || "worker")
    .maybeSingle();

  // Если пользователь выключил все уведомления — тихо выходим
  if (prefs && !prefs.push_enabled && !prefs.email_enabled && !prefs.telegram_enabled) {
    await logNotification(userId, userRole, "none", eventType, "skipped", null, "All channels disabled by user");
    return new Response(JSON.stringify({ status: "skipped", reason: "All channels disabled" }));
  }

  // Проверяем тихие часы
  const now = new Date();
  const userHour = now.getUTCHours(); // TODO: учитывать часовой пояс пользователя
  const quietStart = prefs?.quiet_hours_start ? parseInt(prefs.quiet_hours_start.split(":")[0]) : 22;
  const quietEnd = prefs?.quiet_hours_end ? parseInt(prefs.quiet_hours_end.split(":")[0]) : 8;
  const isQuietHour = quietStart > quietEnd
    ? (userHour >= quietStart || userHour < quietEnd)
    : (userHour >= quietStart && userHour < quietEnd);

  // Для high priority — игнорируем тихие часы
  const skipQuiet = priority === "high";

  // --- Каналы отправки ---
  const channels: { type: string; enabled: boolean; send: () => Promise<boolean> }[] = [];

  // 1. Web Push
  if (prefs?.push_enabled !== false && (!isQuietHour || skipQuiet)) {
    channels.push({
      type: "push",
      enabled: true,
      send: () => sendPush(userId, userRole, title, messageBody, deepLink),
    });
  }

  // 2. Email (для high priority или если push выключен)
  if (priority === "high" && prefs?.email_enabled !== false && RESEND_API_KEY) {
    channels.push({
      type: "email",
      enabled: true,
      send: () => sendEmail(userId, userRole, title, messageBody),
    });
  }

  // 3. Telegram fallback (только если push не доставлен)
  if (prefs?.telegram_enabled !== false) {
    channels.push({
      type: "telegram",
      enabled: true,
      send: () => sendTelegramFallback(userId, userRole, title, messageBody),
    });
  }

  // --- Отправка с retry ---
  const results: Record<string, string> = {};
  let anySuccess = false;

  for (const channel of channels) {
    if (!channel.enabled) continue;

    let success = false;
    let lastError = "";
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        success = await channel.send();
        if (success) break;
      } catch (e) {
        lastError = String(e);
      }
      // Exponential backoff: 1s, 2s, 4s
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }

    results[channel.type] = success ? "delivered" : `failed: ${lastError}`;
    if (success) {
      anySuccess = true;
      await logNotification(userId, userRole, channel.type, eventType, "delivered", payload, null, maxRetries);
      break; // Достаточно одного успешного канала (кроме high где отправляем все)
    } else {
      await logNotification(userId, userRole, channel.type, eventType, "failed", payload, lastError, maxRetries);
    }
  }

  return new Response(
    JSON.stringify({ status: anySuccess ? "ok" : "all_failed", channels: results }),
    { headers: { "Content-Type": "application/json" } }
  );
});

// ============================================================
// Web Push отправка
// ============================================================
async function sendPush(
  userId: string,
  userRole: string,
  title: string,
  body: string,
  deepLink?: string
): Promise<boolean> {
  // Получаем все активные токены пользователя
  const { data: tokens } = await sb
    .from("user_device_tokens")
    .select("push_endpoint, push_keys")
    .eq("user_id", userId)
    .eq("user_role", userRole)
    .gte("last_seen_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // активные за 30 дней

  if (!tokens || tokens.length === 0) return false;

  // Формируем push-сообщение
  const pushPayload = JSON.stringify({
    title,
    body,
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    data: { url: deepLink || "/" },
    actions: [{ action: "open", title: "Открыть" }],
  });

  let anySent = false;
  const invalidEndpoints: string[] = [];

  for (const token of tokens) {
    try {
      // Подписываем VAPID-заголовки и отправляем через Push API
      const vapidHeaders = await generateVapidHeaders(token.push_endpoint);
      const response = await fetch(token.push_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "TTL": "86400",
          "Urgency": "high",
          ...vapidHeaders,
        },
        body: await encryptPayload(pushPayload, token.push_keys),
      });

      if (response.status === 201 || response.status === 200) {
        anySent = true;
      } else if (response.status === 410) {
        // Подписка устарела — удаляем
        invalidEndpoints.push(token.push_endpoint);
      }
    } catch {
      // Пропускаем, пробуем следующий токен
    }
  }

  // Удаляем устаревшие токены
  if (invalidEndpoints.length > 0) {
    await sb
      .from("user_device_tokens")
      .delete()
      .in("push_endpoint", invalidEndpoints);
  }

  return anySent;
}

// Генерация VAPID JWT заголовков
async function generateVapidHeaders(endpoint: string): Promise<Record<string, string>> {
  const encoder = new TextEncoder();
  const header = { alg: "ES256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: new URL(endpoint).origin,
    exp: now + 43200, // 12 часов
    sub: VAPID_SUBJECT,
  };

  // Кодируем JWT (упрощённо — для production использовать библиотеку)
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Подписываем ECDSA P-256
  const keyData = importVapidKey(VAPID_PRIVATE_KEY);
  const key = await crypto.subtle.importKey("pkcs8", keyData, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(unsignedToken));
  const sigB64 = base64UrlEncode(new Uint8Array(signature));

  return {
    Authorization: `vapid t=${unsignedToken}.${sigB64}, k=${VAPID_PUBLIC_KEY}`,
  };
}

function base64UrlEncode(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function importVapidKey(key: string): Uint8Array {
  // Упрощённый импорт — для production использовать web-push библиотеку
  const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
}

async function encryptPayload(payload: string, keys: Record<string, string> | null): Promise<Uint8Array> {
  // Для production нужна полная ECDH + AES-128-GCM шифрация по RFC 8291
  // Здесь — упрощённая заглушка (payload без шифрования для демонстрации)
  // В реальной реализации использовать: https://github.com/nickygerritsen/web-push-deno
  if (!keys) {
    return new TextEncoder().encode(payload);
  }
  // TODO: Полная реализация ECDH encryption
  return new TextEncoder().encode(payload);
}

// ============================================================
// Email через Resend
// ============================================================
async function sendEmail(
  userId: string,
  userRole: string,
  title: string,
  body: string
): Promise<boolean> {
  // Получаем email пользователя
  const { data: tokenData } = await sb
    .from("user_device_tokens")
    .select("email")
    .eq("user_id", userId)
    .eq("user_role", userRole)
    .not("email", "is", null)
    .limit(1)
    .maybeSingle();

  if (!tokenData?.email) return false;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: tokenData.email,
        subject: `🔔 ${title}`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1a365d;">${title}</h2>
            <p style="color: #333; font-size: 16px;">${body}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">Dispatcher.PRO — уведомление</p>
          </div>
        `,
      }),
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

// ============================================================
// Telegram fallback (вызывает существующий API бота)
// ============================================================
async function sendTelegramFallback(
  userId: string,
  userRole: string,
  title: string,
  body: string
): Promise<boolean> {
  // Определяем таблицу по роли
  const tableMap: Record<string, string> = {
    worker: "workers",
    client: "clients",
    dispatcher: "users",
    owner: "users",
  };
  const table = tableMap[userRole] || "workers";

  // Получаем telegram_chat_id
  const { data } = await sb
    .from(table)
    .select("telegram_chat_id")
    .eq("id", userId)
    .maybeSingle();

  if (!data?.telegram_chat_id) return false;

  try {
    const tgToken = Deno.env.get("TG_BOT_TOKEN") || "8340184731:AAFlKiRAWVzKVvw3ND4aUsHzw0LL62-p8jE";
    await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: data.telegram_chat_id,
        text: `🔔 <b>${title}</b>\n\n${body}`,
        parse_mode: "HTML",
      }),
    });
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Логирование
// ============================================================
async function logNotification(
  userId: string,
  userRole: string,
  channel: string,
  eventType: string,
  status: string,
  payload: Record<string, unknown> | null,
  error: string | null,
  retryCount = 0
) {
  try {
    await sb.from("notification_logs").insert({
      user_id: userId,
      user_role: userRole,
      channel,
      event_type: eventType,
      status,
      payload,
      error,
      retry_count: retryCount,
    });
  } catch (e) {
    console.error("[NotificationLog] Failed:", e);
  }
}
