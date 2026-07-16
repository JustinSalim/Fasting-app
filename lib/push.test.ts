import { describe, it, expect, vi, beforeEach } from 'vitest'
import webpush from 'web-push'
import { sendPush } from './push'

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))

const subscription = { endpoint: 'https://push.example/abc', p256dh: 'p256dh-key', auth: 'auth-key' }
const payload = { title: 'Fast complete', body: "You've reached your fasting goal.", url: '/dashboard' }

describe('sendPush', () => {
  beforeEach(() => {
    vi.mocked(webpush.sendNotification).mockReset()
    process.env.VAPID_SUBJECT = 'mailto:test@example.com'
    process.env.VAPID_PUBLIC_KEY = 'public-key'
    process.env.VAPID_PRIVATE_KEY = 'private-key'
  })

  it('returns delivered true on success', async () => {
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never)
    const result = await sendPush(subscription, payload)
    expect(result).toEqual({ delivered: true })
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload)
    )
  })

  it('marks the subscription expired on a 410 response', async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValue({ statusCode: 410 })
    const result = await sendPush(subscription, payload)
    expect(result).toEqual({ delivered: false, expired: true })
  })

  it('marks the subscription expired on a 404 response', async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValue({ statusCode: 404 })
    const result = await sendPush(subscription, payload)
    expect(result).toEqual({ delivered: false, expired: true })
  })

  it('does not mark expired on other errors', async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValue({ statusCode: 500 })
    const result = await sendPush(subscription, payload)
    expect(result).toEqual({ delivered: false, expired: false })
  })

  it('configures VAPID details exactly once across repeated calls', async () => {
    // The module-level `configured` flag persists across tests in this file, so a
    // fresh module instance is needed to observe the first-call configuration
    // deterministically rather than depending on prior test execution order.
    vi.resetModules()
    const freshWebpush = (await import('web-push')).default
    vi.mocked(freshWebpush.sendNotification).mockResolvedValue({} as never)
    vi.mocked(freshWebpush.setVapidDetails).mockClear()
    const { sendPush: freshSendPush } = await import('./push')

    await freshSendPush(subscription, payload)
    await freshSendPush(subscription, payload)

    expect(freshWebpush.setVapidDetails).toHaveBeenCalledTimes(1)
    expect(freshWebpush.setVapidDetails).toHaveBeenCalledWith(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    )
  })
})
