import webpush from 'web-push'

export interface PushSubscriptionRecord {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushPayload {
  title: string
  body: string
  url: string
}

let configured = false

function ensureConfigured() {
  if (configured) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  configured = true
}

export async function sendPush(
  subscription: PushSubscriptionRecord,
  payload: PushPayload
): Promise<{ delivered: true } | { delivered: false; expired: boolean }> {
  ensureConfigured()
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload)
    )
    return { delivered: true }
  } catch (err) {
    const statusCode = typeof err === 'object' && err !== null && 'statusCode' in err
      ? (err as { statusCode?: number }).statusCode
      : undefined
    const expired = statusCode === 404 || statusCode === 410
    return { delivered: false, expired }
  }
}
