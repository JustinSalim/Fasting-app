import { BottomNav } from "@/components/layout/BottomNav";
import { FastingProvider } from "@/components/fasting/FastingContext";
import { createClient } from "@/utils/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let initialFast = null;
  if (user) {
    const { data } = await supabase
      .from('fasting_logs')
      .select('id, start_time, target_duration_hours')
      .eq('user_id', user.id)
      .eq('status', 'ongoing')
      .single();
    initialFast = data;
  }

  return (
    <FastingProvider initialFast={initialFast}>
      <div className="flex flex-col min-h-[100dvh] flex-1 w-full bg-background pb-24">
        {children}
        <BottomNav />
      </div>
    </FastingProvider>
  );
}
