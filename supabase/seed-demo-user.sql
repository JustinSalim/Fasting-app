-- Demo/seeder account with ~3 months of realistic fasting + health history.
-- Run in the Supabase dashboard: Project > SQL Editor > New query > paste > Run.
-- Safe to re-run: if the account already exists it just wipes and regenerates
-- its logs, it never touches any other user's data.
--
-- Login:  demo@fastingv2.seed / DemoSeed123!
--
-- To remove the account and everything it owns, run delete-demo-user.sql instead.

do $$
declare
  demo_user_id uuid;
  demo_email text := 'demo@fastingv2.seed';
  day_offset int;
  fast_date date;
  target numeric;
  start_ts timestamptz;
  end_ts timestamptz;
  elapsed_minutes numeric;
  fast_status text;
  roll numeric;
begin
  select id into demo_user_id from auth.users where email = demo_email;

  if demo_user_id is null then
    demo_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      demo_user_id, 'authenticated', 'authenticated', demo_email,
      extensions.crypt('DemoSeed123!', extensions.gen_salt('bf')),
      now() - interval '90 days',
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', 'Demo Seed'),
      now() - interval '90 days', now(),
      '', '', '', ''
    );

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), demo_user_id, demo_user_id::text,
      jsonb_build_object('sub', demo_user_id::text, 'email', demo_email),
      'email', now() - interval '90 days', now() - interval '90 days', now()
    );
  end if;

  -- wipe any previously seeded logs so this script is idempotent
  delete from public.fasting_logs where user_id = demo_user_id;
  delete from public.health_logs where user_id = demo_user_id;

  -- 90 days of fasting logs: ~70% completed, ~15% missed, ~10% partial, ~5% skipped
  for day_offset in 0..89 loop
    fast_date := (current_date - day_offset);
    target := (array[14,16,16,18,18,20,16.5])[1 + floor(random()*7)::int];
    start_ts := fast_date + time '20:00' + (random()*90 || ' minutes')::interval;
    roll := random();
    if roll < 0.7 then
      elapsed_minutes := target * 60 * (0.95 + random()*0.25);
      fast_status := 'completed';
    elsif roll < 0.85 then
      elapsed_minutes := target * 60 * (0.5 + random()*0.3);
      fast_status := 'missed';
    elsif roll < 0.95 then
      elapsed_minutes := target * 60 * (0.8 + random()*0.15);
      fast_status := 'partial';
    else
      elapsed_minutes := 0;
      fast_status := null;
    end if;

    if fast_status is not null then
      end_ts := start_ts + (elapsed_minutes || ' minutes')::interval;
      insert into public.fasting_logs (user_id, start_time, end_time, target_duration_hours, status, created_at, phase)
      values (demo_user_id, start_ts, end_ts, target, fast_status, start_ts, 'fasting');

      -- eating window follows the fast, until the next fast starts ~24h after this one began
      insert into public.fasting_logs (user_id, start_time, end_time, target_duration_hours, status, created_at, phase)
      values (
        demo_user_id, end_ts, start_ts + interval '24 hours',
        round((24 - target)::numeric, 1), 'completed', end_ts, 'eating'
      );
    end if;
  end loop;

  -- today's fast: left ongoing so the account feels "live"
  insert into public.fasting_logs (user_id, start_time, end_time, target_duration_hours, status, created_at)
  values (demo_user_id, now() - interval '3 hours', null, 16, 'ongoing', now() - interval '3 hours');

  -- weight logs every ~3 days, gentle downward trend
  for day_offset in 0..89 loop
    if day_offset % 3 = 0 then
      insert into public.health_logs (user_id, log_type, value, created_at)
      values (
        demo_user_id, 'weight',
        round((82 - (89 - day_offset) * 0.05 + (random()-0.5))::numeric, 1)::text,
        current_date - day_offset + time '07:30'
      );
    end if;
  end loop;

  -- water logs, most days
  for day_offset in 0..89 loop
    if random() < 0.8 then
      insert into public.health_logs (user_id, log_type, value, created_at)
      values (demo_user_id, 'water', (1500 + floor(random()*1500))::text, current_date - day_offset + time '12:00');
    end if;
  end loop;

  -- mood logs, a few times a week
  for day_offset in 0..89 loop
    if random() < 0.4 then
      insert into public.health_logs (user_id, log_type, value, created_at)
      values (
        demo_user_id, 'mood',
        (array['great','good','okay','tired','low energy'])[1 + floor(random()*5)::int],
        current_date - day_offset + time '19:00'
      );
    end if;
  end loop;

  -- occasional free-text notes
  for day_offset in 0..89 loop
    if random() < 0.1 then
      insert into public.health_logs (user_id, log_type, value, created_at)
      values (
        demo_user_id, 'note',
        (array['Feeling great today','Tough fast, low energy','Slept well, easy fast','Hungry around hour 12','New personal best'])[1 + floor(random()*5)::int],
        current_date - day_offset + time '21:00'
      );
    end if;
  end loop;

  raise notice 'Seeded demo user % (%)', demo_email, demo_user_id;
end $$;
