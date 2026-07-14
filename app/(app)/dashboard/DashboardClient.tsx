export default function DashboardClient({ initialProfile }: { initialProfile: { full_name: string | null } }) {
  return <div className="p-container-margin">Hi, {initialProfile.full_name}</div>
}
