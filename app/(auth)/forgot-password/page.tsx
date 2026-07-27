import { ForgotPasswordView } from '@/components/auth/ForgotPasswordView'

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const { error, message } = await searchParams
  return (
    <div className="min-h-screen flex items-center justify-center p-container-margin bg-background">
      <ForgotPasswordView error={error} message={message} />
    </div>
  )
}
