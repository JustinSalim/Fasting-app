-- Removes the demo/seeder account created by seed-demo-user.sql.
-- Run in the Supabase dashboard: Project > SQL Editor > New query > paste > Run.
-- profiles, fasting_logs, and health_logs all cascade-delete from auth.users,
-- so this one statement is enough.

delete from auth.users where email = 'demo@fastingv2.seed';
