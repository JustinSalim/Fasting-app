import { LoginView } from '@/components/auth/LoginView'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const { error, message } = await searchParams
  return (
    <div className="min-h-screen flex items-center justify-center p-container-margin bg-background">
      <LoginView error={error} message={message} />
    </div>
  )
}
