-- ============================================================
-- 온그린(On Green) — Supabase 백엔드 스키마
-- ------------------------------------------------------------
-- 기존 Google Apps Script + Sheet 백엔드를 대체합니다.
-- 프런트(api.js)는 여기 정의된 RPC 함수만 호출합니다.
--
-- 설계 요약
--  * 모든 테이블은 RLS(행 수준 보안)를 켜고 정책을 두지 않습니다 → anon 키로
--    테이블에 직접 접근 불가. 오직 아래 SECURITY DEFINER 함수(RPC)로만 접근.
--    (SECURITY DEFINER 함수는 소유자 권한으로 실행되어 RLS를 우회합니다.)
--  * 인증은 기존과 동일한 "사용자명 + 4자리 PIN → 토큰" 방식.
--    PIN 은 bcrypt(crypt)로 해시 저장하고, 토큰은 무작위 문자열입니다.
--  * 각 RPC 함수는 기존 Apps Script 엔드포인트와 1:1로 대응하며, app.js 가
--    기대하는 JSON 모양({ ok, rounds, courses, bench, token, isAdmin, ... })을
--    그대로 반환합니다.
--
-- 사용법: Supabase 대시보드 → SQL Editor 에 이 파일을 통째로 붙여넣고 실행.
-- ============================================================

create extension if not exists pgcrypto;

-- ── 버전 (api.js / app.js 의 버전 표기와 맞춥니다) ──────────────
create or replace function og_version() returns text
  language sql immutable as $$ select 'v13-supabase-2026.06.22'::text $$;

-- ============================================================
-- 테이블
-- ============================================================
create table if not exists og_users (
  username   text primary key,
  pin_hash   text not null,
  token      text,
  token_exp  timestamptz,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists og_rounds (
  username   text primary key references og_users(username) on delete cascade,
  rounds     jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists og_courses (
  id         text primary key,
  name       text not null,
  data       jsonb not null,            -- 코스 객체 전체 {id,name,addr,layouts,...}
  updated_at timestamptz not null default now()
);
create unique index if not exists og_courses_name_uidx on og_courses (lower(name));

create table if not exists og_settings (
  key   text primary key,
  value jsonb not null
);

create table if not exists og_notifications (
  id         bigint generated always as identity primary key,
  course     text,
  username   text,
  action     text,
  detail     text,
  created_at timestamptz not null default now()
);

-- RLS 켜기 (정책 없음 = anon/authenticated 직접 접근 차단)
alter table og_users         enable row level security;
alter table og_rounds        enable row level security;
alter table og_courses       enable row level security;
alter table og_settings      enable row level security;
alter table og_notifications enable row level security;

-- ============================================================
-- 내부 헬퍼
-- ============================================================
-- 한국시간 날짜/시각 포맷
create or replace function og__kr(p_ts timestamptz, p_fmt text)
returns text language sql immutable as $$
  select to_char(p_ts at time zone 'Asia/Seoul', p_fmt)
$$;

-- 토큰 검증 → 유효하면 사용자 행, 아니면 NULL 행
create or replace function og__uid(p_u text, p_token text)
returns og_users
language plpgsql security definer set search_path = public as $$
declare v og_users;
begin
  if p_u is null or p_token is null then return v; end if;
  select * into v from og_users
   where username = p_u and token = p_token
     and (token_exp is null or token_exp > now());
  return v;  -- 못 찾으면 모든 필드가 NULL 인 행
end;
$$;

-- ============================================================
-- 공개 / 인증 불필요
-- ============================================================
create or replace function og_ping()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'version', og_version())
$$;

create or replace function og_login(p_username text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user  og_users;
  v_token text;
  v_admin boolean;
  v_cnt   int;
begin
  if p_username is null or length(btrim(p_username)) < 2 then
    return jsonb_build_object('ok', false, 'err', '이름2자');
  end if;
  if p_pin is null or p_pin !~ '^\d{4}$' then
    return jsonb_build_object('ok', false, 'err', '비번4자');
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  select * into v_user from og_users where username = p_username;

  if not found then
    -- 신규 가입 (첫 사용자는 자동으로 관리자)
    select count(*) into v_cnt from og_users;
    v_admin := (v_cnt = 0);
    insert into og_users(username, pin_hash, token, token_exp, is_admin)
      values (p_username, crypt(p_pin, gen_salt('bf')), v_token, now() + interval '180 days', v_admin);
    insert into og_rounds(username) values (p_username)
      on conflict (username) do nothing;
    return jsonb_build_object('ok', true, 'token', v_token, 'isAdmin', v_admin, 'isNew', true);
  end if;

  if v_user.pin_hash <> crypt(p_pin, v_user.pin_hash) then
    return jsonb_build_object('ok', false, 'wrongPin', true);
  end if;

  update og_users set token = v_token, token_exp = now() + interval '180 days'
    where username = p_username;
  return jsonb_build_object('ok', true, 'token', v_token, 'isAdmin', v_user.is_admin, 'isNew', false);
end;
$$;

create or replace function og_get_courses()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('ok', true,
    'courses', coalesce((select jsonb_agg(data order by name) from og_courses), '[]'::jsonb))
$$;

create or replace function og_get_bench()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('ok', true,
    'bench', coalesce((select value from og_settings where key = 'BENCH'), '{}'::jsonb))
$$;

-- ============================================================
-- 인증 필요
-- ============================================================
create or replace function og_get_rounds(p_u text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v og_users; r jsonb;
begin
  v := og__uid(p_u, p_token);
  if v.username is null then return jsonb_build_object('ok', false, 'err', '인증실패'); end if;
  select rounds into r from og_rounds where username = p_u;
  return jsonb_build_object('ok', true, 'rounds', coalesce(r, '[]'::jsonb));
end;
$$;

create or replace function og_save_rounds(p_u text, p_token text, p_rounds jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v og_users;
begin
  v := og__uid(p_u, p_token);
  if v.username is null then return jsonb_build_object('ok', false, 'err', '인증실패'); end if;
  insert into og_rounds(username, rounds, updated_at)
    values (p_u, coalesce(p_rounds, '[]'::jsonb), now())
  on conflict (username) do update set rounds = excluded.rounds, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function og_save_course(p_u text, p_token text, p_course jsonb, p_is_edit boolean, p_old_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v       og_users;
  v_id    text;
  v_name  text;
begin
  v := og__uid(p_u, p_token);
  if v.username is null then return jsonb_build_object('ok', false, 'err', '인증실패'); end if;

  v_name := nullif(btrim(coalesce(p_course->>'name', '')), '');
  if v_name is null then return jsonb_build_object('ok', false, 'err', '이름필요'); end if;
  v_id := coalesce(nullif(p_course->>'id', ''), 'c' || (extract(epoch from now())*1000)::bigint::text);

  -- 같은 id / 같은 이름 / (수정 시) 이전 이름 행을 먼저 지워 충돌 방지 후 삽입 = 업서트
  delete from og_courses
   where id = v_id
      or lower(name) = lower(v_name)
      or (p_is_edit and p_old_name <> '' and lower(name) = lower(p_old_name));
  insert into og_courses(id, name, data, updated_at) values (v_id, v_name, p_course, now());

  -- 관리자 알림 로그 (관리자 본인 변경도 기록되지만 무해)
  insert into og_notifications(course, username, action)
    values (v_name, p_u, case when p_is_edit then '수정' else '추가' end);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function og_report_par(p_u text, p_token text, p_course text, p_detail text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v og_users;
begin
  v := og__uid(p_u, p_token);
  if v.username is null then return jsonb_build_object('ok', false, 'err', '인증실패'); end if;
  insert into og_notifications(course, username, action, detail)
    values (p_course, p_u, '파변경', p_detail);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function og_update_pin(p_u text, p_token text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v og_users; v_token text;
begin
  v := og__uid(p_u, p_token);
  if v.username is null then return jsonb_build_object('ok', false, 'err', '인증실패'); end if;
  if p_pin is null or p_pin !~ '^\d{4}$' then return jsonb_build_object('ok', false, 'err', '비번4자'); end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  update og_users
     set pin_hash = crypt(p_pin, gen_salt('bf')),
         token = v_token, token_exp = now() + interval '180 days'
   where username = p_u;
  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

create or replace function og_set_bench(p_u text, p_token text, p_bench jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v og_users;
begin
  v := og__uid(p_u, p_token);
  if v.username is null then return jsonb_build_object('ok', false, 'err', '인증실패'); end if;
  if not v.is_admin then return jsonb_build_object('ok', false, 'err', '권한없음'); end if;
  insert into og_settings(key, value) values ('BENCH', coalesce(p_bench, '{}'::jsonb))
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true, 'bench', coalesce(p_bench, '{}'::jsonb));
end;
$$;

-- ============================================================
-- 관리자 전용
-- ============================================================
create or replace function og_get_notifications(p_u text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v og_users; notes jsonb;
begin
  v := og__uid(p_u, p_token);
  if v.username is null then return jsonb_build_object('ok', false, 'err', '인증실패'); end if;
  if not v.is_admin then return jsonb_build_object('ok', false, 'err', '권한없음'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'course', course, 'user', username, 'action', action,
           'detail', detail, 'at', og__kr(created_at, 'YYYY.MM.DD HH24:MI')
         ) order by created_at desc), '[]'::jsonb)
    into notes from og_notifications;
  return jsonb_build_object('ok', true, 'notes', notes);
end;
$$;

create or replace function og_clear_notifications(p_u text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v og_users;
begin
  v := og__uid(p_u, p_token);
  if v.username is null then return jsonb_build_object('ok', false, 'err', '인증실패'); end if;
  if not v.is_admin then return jsonb_build_object('ok', false, 'err', '권한없음'); end if;
  delete from og_notifications;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function og_get_users(p_u text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v og_users; users jsonb;
begin
  v := og__uid(p_u, p_token);
  if v.username is null then return jsonb_build_object('ok', false, 'err', '인증실패'); end if;
  if not v.is_admin then return jsonb_build_object('ok', false, 'err', '권한없음'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'username', u.username,
           'at', og__kr(u.created_at, 'YYYY.MM.DD'),
           'rounds', coalesce((select jsonb_array_length(r.rounds) from og_rounds r where r.username = u.username), 0)
         ) order by u.created_at), '[]'::jsonb)
    into users from og_users u;
  return jsonb_build_object('ok', true, 'users', users);
end;
$$;

create or replace function og_delete_course(p_u text, p_token text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v og_users;
begin
  v := og__uid(p_u, p_token);
  if v.username is null then return jsonb_build_object('ok', false, 'err', '인증실패'); end if;
  if not v.is_admin then return jsonb_build_object('ok', false, 'err', '권한없음'); end if;
  delete from og_courses where lower(name) = lower(p_name);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function og_reset_user_pin(p_u text, p_token text, p_target text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v og_users;
begin
  v := og__uid(p_u, p_token);
  if v.username is null then return jsonb_build_object('ok', false, 'err', '인증실패'); end if;
  if not v.is_admin then return jsonb_build_object('ok', false, 'err', '권한없음'); end if;
  if p_pin is null or p_pin !~ '^\d{4}$' then return jsonb_build_object('ok', false, 'err', '비번4자'); end if;
  update og_users
     set pin_hash = crypt(p_pin, gen_salt('bf')),
         token = null, token_exp = null   -- 토큰 무효화 → 대상은 재로그인 필요
   where username = p_target;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function og_delete_user(p_u text, p_token text, p_target text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v og_users;
begin
  v := og__uid(p_u, p_token);
  if v.username is null then return jsonb_build_object('ok', false, 'err', '인증실패'); end if;
  if not v.is_admin then return jsonb_build_object('ok', false, 'err', '권한없음'); end if;
  delete from og_users where username = p_target;  -- og_rounds 는 on delete cascade
  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================
-- 마이그레이션용 일괄 가져오기 (관리자 또는 사용자 0명일 때만)
--  dump 모양:
--  { "bench": {...},
--    "courses": [ {코스객체}, ... ],
--    "users":   [ { "username":"홍길동", "pin":"1234"?, "is_admin":false,
--                   "created_at":"2025-01-01"?, "rounds":[ {라운드}, ... ] }, ... ] }
--  * pin 이 있으면 해시 저장, 없으면 임의값으로 막아두고 관리자가 PIN 재설정.
-- ============================================================
create or replace function og_import_dump(p_u text, p_token text, p_dump jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v        og_users;
  v_cnt    int;
  rec      jsonb;
  v_user   text;
  v_pin    text;
  v_hash   text;
  v_admin  boolean;
  v_created timestamptz;
  n_users  int := 0;
  n_courses int := 0;
begin
  select count(*) into v_cnt from og_users;
  -- 부트스트랩(사용자 0명) 이 아니면 관리자 인증 요구
  if v_cnt > 0 then
    v := og__uid(p_u, p_token);
    if v.username is null then return jsonb_build_object('ok', false, 'err', '인증실패'); end if;
    if not v.is_admin then return jsonb_build_object('ok', false, 'err', '권한없음'); end if;
  end if;

  -- BENCH
  if p_dump ? 'bench' and jsonb_typeof(p_dump->'bench') = 'object' then
    insert into og_settings(key, value) values ('BENCH', p_dump->'bench')
    on conflict (key) do update set value = excluded.value;
  end if;

  -- 코스
  if p_dump ? 'courses' and jsonb_typeof(p_dump->'courses') = 'array' then
    for rec in select * from jsonb_array_elements(p_dump->'courses') loop
      if nullif(btrim(coalesce(rec->>'name','')),'') is null then continue; end if;
      delete from og_courses where lower(name) = lower(rec->>'name')
        or id = coalesce(nullif(rec->>'id',''), '___none___');
      insert into og_courses(id, name, data)
        values (coalesce(nullif(rec->>'id',''), 'c'||(extract(epoch from clock_timestamp())*1000)::bigint::text || floor(random()*1000)::text),
                rec->>'name', rec);
      n_courses := n_courses + 1;
    end loop;
  end if;

  -- 사용자 + 라운드
  if p_dump ? 'users' and jsonb_typeof(p_dump->'users') = 'array' then
    for rec in select * from jsonb_array_elements(p_dump->'users') loop
      v_user := nullif(btrim(coalesce(rec->>'username','')),'');
      if v_user is null then continue; end if;
      v_pin  := rec->>'pin';
      v_admin := coalesce((rec->>'is_admin')::boolean, false);
      v_created := coalesce((rec->>'created_at')::timestamptz, now());
      if v_pin is not null and v_pin ~ '^\d{4}$' then
        v_hash := crypt(v_pin, gen_salt('bf'));
      else
        v_hash := crypt(encode(gen_random_bytes(8),'hex'), gen_salt('bf')); -- 막아둠 → PIN 재설정 필요
      end if;
      insert into og_users(username, pin_hash, is_admin, created_at)
        values (v_user, v_hash, v_admin, v_created)
      on conflict (username) do update
        set is_admin = excluded.is_admin,
            pin_hash = case when v_pin ~ '^\d{4}$' then excluded.pin_hash else og_users.pin_hash end;
      insert into og_rounds(username, rounds)
        values (v_user, coalesce(rec->'rounds', '[]'::jsonb))
      on conflict (username) do update set rounds = excluded.rounds, updated_at = now();
      n_users := n_users + 1;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'users', n_users, 'courses', n_courses);
end;
$$;

-- ============================================================
-- 권한: anon(+authenticated) 에게 RPC 실행만 허용. 테이블 권한은 부여하지 않음.
-- (내부 헬퍼 og__uid / og__kr / og_version 은 노출하지 않음)
-- ============================================================
grant usage on schema public to anon, authenticated;

grant execute on function og_ping()                                   to anon, authenticated;
grant execute on function og_login(text, text)                        to anon, authenticated;
grant execute on function og_get_courses()                            to anon, authenticated;
grant execute on function og_get_bench()                              to anon, authenticated;
grant execute on function og_get_rounds(text, text)                   to anon, authenticated;
grant execute on function og_save_rounds(text, text, jsonb)           to anon, authenticated;
grant execute on function og_save_course(text, text, jsonb, boolean, text) to anon, authenticated;
grant execute on function og_report_par(text, text, text, text)       to anon, authenticated;
grant execute on function og_update_pin(text, text, text)             to anon, authenticated;
grant execute on function og_set_bench(text, text, jsonb)             to anon, authenticated;
grant execute on function og_get_notifications(text, text)            to anon, authenticated;
grant execute on function og_clear_notifications(text, text)          to anon, authenticated;
grant execute on function og_get_users(text, text)                    to anon, authenticated;
grant execute on function og_delete_course(text, text, text)          to anon, authenticated;
grant execute on function og_reset_user_pin(text, text, text, text)   to anon, authenticated;
grant execute on function og_delete_user(text, text, text)            to anon, authenticated;
grant execute on function og_import_dump(text, text, jsonb)           to anon, authenticated;

-- 끝.
