import { BottomNav } from "@/components/layout/BottomNav";
import { SwipeNavigator } from "@/components/layout/SwipeNavigator";
import { FastingProvider } from "@/components/fasting/FastingContext";
import { createClient } from "@/utils/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let initialFast = null;
  if (user) {
    const { data } = await supabase
      .from('fasting_logs')
      .select('id, start_time, target_duration_hours, phase')
      .eq('user_id', user.id)
      .eq('status', 'ongoing')
      .single();
    initialFast = data;
  }

  return (
    <FastingProvider initialFast={initialFast}>
      <div
        className="flex flex-col h-[100dvh] w-full bg-background overflow-y-auto"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))',
        }}
      >
        <SwipeNavigator>{children}</SwipeNavigator>
        <BottomNav />
      </div>
    </FastingProvider>
  );
}
