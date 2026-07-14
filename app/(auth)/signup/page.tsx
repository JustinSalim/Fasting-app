import { SignupView } from '@/components/auth/SignupView'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return (
    <div className="min-h-screen flex items-center justify-center p-container-margin bg-background">
      <SignupView error={error} />
    </div>
  )
}
