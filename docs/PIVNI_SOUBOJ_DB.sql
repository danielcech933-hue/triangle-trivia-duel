-- Pivní souboj database schema.
-- This schema is deployed to the Lovable Cloud database for Triangle Trivia Duel.
-- One room represents one match. The room is closed when the match ends and is never reused.

create extension if not exists unaccent with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.beer_rooms (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  host_token_hash bytea not null,
  game_state jsonb not null default '{"phase":"lobby","round":0,"describer_id":null,"word_id":null,"word":null,"answers":[],"used_word_ids":[],"guesses":[],"winner_id":null,"winner_name":null,"last_guess":null}'::jsonb,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours'),
  closed_at timestamptz
);

create table if not exists public.beer_players (
  room_code text not null references public.beer_rooms(code) on delete cascade,
  player_id text not null,
  display_name text not null check (char_length(display_name) between 1 and 16),
  token_hash bytea not null,
  is_host boolean not null default false,
  score integer not null default 0 check (score >= 0),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_code, player_id)
);

alter table public.beer_rooms enable row level security;
alter table public.beer_players enable row level security;
revoke all on table public.beer_rooms, public.beer_players from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.beer_room_snapshot(p_code text, p_player_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'private'
AS $function$
declare
  v_room public.beer_rooms%rowtype;
  v_state jsonb;
  v_players jsonb;
begin
  select * into v_room from public.beer_rooms
  where code = upper(p_code) and expires_at > now();
  if not found then raise exception 'Místnost neexistuje nebo vypršela.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.player_id, 'name', p.display_name, 'score', p.score,
    'is_host', p.is_host, 'is_me', p.player_id = p_player_id,
    'online', p.last_seen_at > now() - interval '15 seconds'
  ) order by p.joined_at, p.player_id), '[]'::jsonb)
  into v_players from public.beer_players p where p.room_code = v_room.code;
  if v_room.game_state->>'phase' in ('result','closed') then
    v_state := (v_room.game_state - 'answers' - 'word')
      || jsonb_build_object('answer', coalesce(v_room.game_state->'answer',v_room.game_state->'word'));
  elsif v_room.game_state->>'describer_id' = p_player_id then
    v_state := v_room.game_state - 'answers';
  else
    v_state := v_room.game_state - 'answers' - 'word';
  end if;
  return jsonb_build_object('code',v_room.code,'revision',v_room.revision,'state',v_state,
    'players',v_players,'closed_at',v_room.closed_at,'expires_at',v_room.expires_at);
end;
$function$


CREATE OR REPLACE FUNCTION public.beer_begin_guessing(p_code text, p_player_id text, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'private'
AS $function$
declare
  v_room public.beer_rooms%rowtype;
begin
  select * into v_room from public.beer_rooms
  where code = upper(p_code) and expires_at > now() for update;
  if not found then raise exception 'Místnost nebyla nalezena.'; end if;

  if not exists (
    select 1 from public.beer_players
    where room_code = v_room.code and player_id = p_player_id
      and token_hash = extensions.digest(convert_to(coalesce(p_token,''), 'UTF8'), 'sha256')
  ) then raise exception 'Nemáš přístup do této místnosti.'; end if;

  if v_room.game_state->>'phase' <> 'describe' or v_room.game_state->>'describer_id' <> p_player_id then
    raise exception 'Hádání může spustit pouze hráč, který právě popisuje.';
  end if;

  update public.beer_rooms
  set game_state = jsonb_set(game_state, '{phase}', '"guess"'::jsonb),
      revision = revision + 1, updated_at = now()
  where code = v_room.code;
  return private.beer_room_snapshot(v_room.code, p_player_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.beer_close_room(p_code text, p_player_id text, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'private'
AS $function$
declare
  v_room public.beer_rooms%rowtype;
begin
  select * into v_room from public.beer_rooms
  where code = upper(p_code) and expires_at > now() for update;
  if not found then raise exception 'Místnost nebyla nalezena.'; end if;
  if not exists (
    select 1 from public.beer_players
    where room_code = v_room.code and player_id = p_player_id and is_host
      and token_hash = extensions.digest(convert_to(coalesce(p_token,''), 'UTF8'), 'sha256')
  ) then raise exception 'Místnost může uzavřít pouze hostitel.'; end if;
  update public.beer_rooms
  set game_state = jsonb_set(game_state - 'answers' - 'word','{phase}','"closed"'::jsonb)
        || jsonb_build_object('answer',coalesce(game_state->'answer',game_state->'word')),
      closed_at = coalesce(closed_at,now()),
      revision = revision + 1,
      updated_at = now()
  where code = v_room.code;
  return private.beer_room_snapshot(v_room.code,p_player_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.beer_create_room(p_code text, p_player_id text, p_token text, p_nickname text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'private'
AS $function$
declare
  v_code text := upper(trim(p_code));
  v_name text := trim(p_nickname);
  v_hash bytea;
begin
  if v_code !~ '^[A-Z0-9]{6}$' then raise exception 'Neplatný kód místnosti.'; end if;
  if length(coalesce(p_player_id,'')) < 8 or length(p_player_id) > 80 then raise exception 'Neplatné ID hráče.'; end if;
  if length(coalesce(p_token,'')) < 32 or length(p_token) > 256 then raise exception 'Neplatný bezpečnostní token.'; end if;
  if length(v_name) < 1 or length(v_name) > 16 then raise exception 'Přezdívka musí mít 1 až 16 znaků.'; end if;

  v_hash := extensions.digest(convert_to(p_token, 'UTF8'), 'sha256');
  insert into public.beer_rooms(code, host_token_hash) values (v_code, v_hash);
  insert into public.beer_players(room_code, player_id, display_name, token_hash, is_host)
  values (v_code, p_player_id, v_name, v_hash, true);

  return private.beer_room_snapshot(v_code, p_player_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.beer_end_round(p_code text, p_player_id text, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'private'
AS $function$
declare
  v_room public.beer_rooms%rowtype;
begin
  select * into v_room from public.beer_rooms
  where code = upper(p_code) and expires_at > now() for update;
  if not found then raise exception 'Místnost nebyla nalezena.'; end if;

  if not exists (
    select 1 from public.beer_players
    where room_code = v_room.code and player_id = p_player_id
      and token_hash = extensions.digest(convert_to(coalesce(p_token,''), 'UTF8'), 'sha256')
      and (is_host or player_id = (v_room.game_state->>'describer_id'))
  ) then raise exception 'Konec kola může potvrdit hostitel nebo popisující hráč.'; end if;

  if v_room.game_state->>'phase' not in ('describe','guess') then raise exception 'Kolo již skončilo.'; end if;

  update public.beer_rooms
  set game_state = jsonb_set(game_state - 'answers',
       '{phase}', '"result"'::jsonb) || jsonb_build_object('answer',game_state->'word','winner_id',null,'winner_name',null),
      revision = revision + 1, updated_at = now()
  where code = v_room.code;

  return private.beer_room_snapshot(v_room.code,p_player_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.beer_get_room(p_code text, p_player_id text, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'private'
AS $function$
begin
  if not exists (
    select 1 from public.beer_players
    where room_code = upper(p_code)
      and player_id = p_player_id
      and token_hash = extensions.digest(convert_to(coalesce(p_token,''), 'UTF8'), 'sha256')
  ) then raise exception 'Nemáš přístup do této místnosti. Připoj se znovu přes pozvánku.'; end if;

  update public.beer_players set last_seen_at = now()
  where room_code = upper(p_code) and player_id = p_player_id;

  return private.beer_room_snapshot(upper(p_code), p_player_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.beer_join_room(p_code text, p_player_id text, p_token text, p_nickname text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'private'
AS $function$
declare
  v_code text := upper(trim(p_code));
  v_name text := trim(p_nickname);
  v_room public.beer_rooms%rowtype;
  v_existing public.beer_players%rowtype;
  v_count integer;
begin
  if v_code !~ '^[A-Z0-9]{6}$' then raise exception 'Neplatný kód místnosti.'; end if;
  if length(coalesce(p_player_id,'')) < 8 or length(p_player_id) > 80 then raise exception 'Neplatné ID hráče.'; end if;
  if length(coalesce(p_token,'')) < 32 or length(p_token) > 256 then raise exception 'Neplatný bezpečnostní token.'; end if;
  if length(v_name) < 1 or length(v_name) > 16 then raise exception 'Přezdívka musí mít 1 až 16 znaků.'; end if;

  select * into v_room from public.beer_rooms
  where code = v_code and expires_at > now() for update;
  if not found then raise exception 'Tato místnost neexistuje nebo vypršela.'; end if;

  select * into v_existing from public.beer_players
  where room_code = v_code and player_id = p_player_id;

  if found then
    if v_existing.token_hash <> extensions.digest(convert_to(p_token, 'UTF8'), 'sha256') then
      raise exception 'Tento hráč již používá jiný přístupový token.';
    end if;
    update public.beer_players
    set last_seen_at = now(), display_name = v_name
    where room_code = v_code and player_id = p_player_id;
    return private.beer_room_snapshot(v_code, p_player_id);
  end if;

  if v_room.closed_at is not null or v_room.game_state->>'phase' <> 'lobby' then
    raise exception 'Tato partie už začala nebo je uzavřená. Požádej hostitele o nový odkaz.';
  end if;

  select count(*) into v_count from public.beer_players where room_code = v_code;
  if v_count >= 12 then raise exception 'Místnost je plná (max. 12 hráčů).'; end if;

  insert into public.beer_players(room_code, player_id, display_name, token_hash)
  values (v_code, p_player_id, v_name, extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'));

  update public.beer_rooms set revision = revision + 1, updated_at = now()
  where code = v_code;

  return private.beer_room_snapshot(v_code, p_player_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.beer_start_round(p_code text, p_player_id text, p_token text, p_word_id text, p_word text, p_answers jsonb, p_describer_id text, p_reset_used boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'private'
AS $function$
declare
  v_room public.beer_rooms%rowtype;
  v_state jsonb;
  v_used jsonb;
  v_round integer;
begin
  select * into v_room from public.beer_rooms
  where code = upper(p_code) and expires_at > now() for update;
  if not found then raise exception 'Místnost nebyla nalezena.'; end if;

  if not exists (
    select 1 from public.beer_players
    where room_code = v_room.code and player_id = p_player_id and is_host
      and token_hash = extensions.digest(convert_to(coalesce(p_token,''), 'UTF8'), 'sha256')
  ) then raise exception 'Pouze hostitel může spustit další kolo.'; end if;

  if v_room.closed_at is not null or v_room.game_state->>'phase' not in ('lobby','result') then
    raise exception 'Aktuální kolo ještě neskončilo nebo je místnost uzavřená.';
  end if;

  if (select count(*) from public.beer_players where room_code = v_room.code) < 2 then
    raise exception 'Ke spuštění hry potřebujete alespoň dva hráče.';
  end if;

  if not exists (select 1 from public.beer_players where room_code = v_room.code and player_id = p_describer_id) then
    raise exception 'Popisující hráč není v místnosti.';
  end if;
  if length(coalesce(p_word_id,'')) < 1 or length(p_word_id) > 120 then raise exception 'Neplatné ID slova.'; end if;
  if length(trim(coalesce(p_word,''))) < 1 or length(p_word) > 160 then raise exception 'Neplatné slovo.'; end if;
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) < 1 or jsonb_array_length(p_answers) > 8 then raise exception 'Odpovědi slova jsou neplatné.'; end if;

  v_used := case when p_reset_used then '[]'::jsonb else coalesce(v_room.game_state->'used_word_ids','[]'::jsonb) end;
  if v_used ? p_word_id then raise exception 'Toto slovo už v této partii zaznělo.'; end if;
  v_round := coalesce((v_room.game_state->>'round')::integer, 0) + 1;

  v_state := jsonb_build_object(
    'phase', 'describe',
    'round', v_round,
    'describer_id', p_describer_id,
    'word_id', p_word_id,
    'word', trim(p_word),
    'answers', p_answers,
    'used_word_ids', v_used || to_jsonb(p_word_id),
    'guesses', '[]'::jsonb,
    'winner_id', null,
    'winner_name', null,
    'last_guess', null
  );

  update public.beer_rooms
  set game_state = v_state, revision = revision + 1, updated_at = now(),
      expires_at = now() + interval '6 hours'
  where code = v_room.code;
  return private.beer_room_snapshot(v_room.code, p_player_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.beer_submit_guess(p_code text, p_player_id text, p_token text, p_guess text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'private'
AS $function$
declare
  v_room public.beer_rooms%rowtype;
  v_player public.beer_players%rowtype;
  v_state jsonb;
  v_entry jsonb;
  v_expected text;
  v_guess_norm text;
  v_expected_norm text;
  v_correct boolean := false;
  v_guesses jsonb;
  v_answered integer;
  v_guess text := trim(coalesce(p_guess,''));
  v_new_score integer;
  v_new_phase text;
begin
  if length(v_guess) < 1 or length(v_guess) > 120 then raise exception 'Tip musí mít 1 až 120 znaků.'; end if;

  select * into v_player from public.beer_players
  where room_code = upper(p_code) and player_id = p_player_id
    and token_hash = extensions.digest(convert_to(coalesce(p_token,''), 'UTF8'), 'sha256');
  if not found then raise exception 'Nemáš přístup do této místnosti.'; end if;

  select * into v_room from public.beer_rooms
  where code = upper(p_code) and expires_at > now() for update;
  if not found then raise exception 'Místnost nebyla nalezena.'; end if;

  v_state := v_room.game_state;
  if v_state->>'phase' <> 'guess' then raise exception 'Teď nelze hádat.'; end if;
  if v_state->>'describer_id' = p_player_id then raise exception 'Popisující hráč nehádá.'; end if;

  v_guesses := coalesce(v_state->'guesses','[]'::jsonb);
  if exists (select 1 from jsonb_array_elements(v_guesses) g where g->>'player_id' = p_player_id) then
    raise exception 'V tomto kole už jsi tipoval.';
  end if;

  v_guess_norm := regexp_replace(extensions.unaccent(lower(v_guess)), '[^a-z0-9]+', '', 'g');
  for v_expected in select jsonb_array_elements_text(v_state->'answers')
  loop
    v_expected_norm := regexp_replace(extensions.unaccent(lower(trim(v_expected))), '[^a-z0-9]+', '', 'g');
    if v_guess_norm = v_expected_norm
      or exists (
        select 1 from regexp_split_to_table(lower(extensions.unaccent(v_expected)), '[^a-z0-9]+') part
        where length(part) >= 4 and v_guess_norm = regexp_replace(part, '[^a-z0-9]+', '', 'g')
      )
    then v_correct := true; exit; end if;
  end loop;

  select display_name into v_expected from public.beer_players
  where room_code = v_room.code and player_id = p_player_id;

  v_entry := jsonb_build_object('player_id',p_player_id,'player_name',v_expected,'guess',v_guess,'correct',v_correct);
  v_guesses := v_guesses || jsonb_build_array(v_entry);
  v_answered := jsonb_array_length(v_guesses);

  if v_correct then
    update public.beer_players set score = score + 1, last_seen_at = now()
    where room_code = v_room.code and player_id = p_player_id
    returning score into v_new_score;
    v_new_phase := case when v_new_score >= 10 then 'closed' else 'result' end;
    v_state := v_state || jsonb_build_object(
      'phase',v_new_phase,'guesses',v_guesses,'winner_id',p_player_id,
      'winner_name',v_expected,'last_guess',v_guess
    );
    if v_new_phase = 'closed' then
      update public.beer_rooms set closed_at = now()
      where code = v_room.code;
    end if;
  else
    select count(*) - 1 into v_answered from public.beer_players
    where room_code = v_room.code;
    if jsonb_array_length(v_guesses) >= greatest(v_answered,0) then
      v_new_phase := 'result';
      v_state := v_state || jsonb_build_object('phase','result','guesses',v_guesses,'winner_id',null,'winner_name',null,'last_guess',v_guess);
    else
      v_state := v_state || jsonb_build_object('guesses',v_guesses,'last_guess',v_guess);
    end if;
  end if;

  update public.beer_rooms
  set game_state = v_state, revision = revision + 1, updated_at = now()
  where code = v_room.code;

  return jsonb_build_object('correct',v_correct,'room',private.beer_room_snapshot(v_room.code,p_player_id));
end;
$function$


revoke all on function private.beer_room_snapshot(text,text) from public, anon, authenticated;
revoke all on function public.beer_create_room(text,text,text,text) from public;
revoke all on function public.beer_join_room(text,text,text,text) from public;
revoke all on function public.beer_get_room(text,text,text) from public;
revoke all on function public.beer_start_round(text,text,text,text,text,jsonb,text,boolean) from public;
revoke all on function public.beer_begin_guessing(text,text,text) from public;
revoke all on function public.beer_submit_guess(text,text,text,text) from public;
revoke all on function public.beer_end_round(text,text,text) from public;
revoke all on function public.beer_close_room(text,text,text) from public;

grant execute on function public.beer_create_room(text,text,text,text) to anon, authenticated;
grant execute on function public.beer_join_room(text,text,text,text) to anon, authenticated;
grant execute on function public.beer_get_room(text,text,text) to anon, authenticated;
grant execute on function public.beer_start_round(text,text,text,text,text,jsonb,text,boolean) to anon, authenticated;
grant execute on function public.beer_begin_guessing(text,text,text) to anon, authenticated;
grant execute on function public.beer_submit_guess(text,text,text,text) to anon, authenticated;
grant execute on function public.beer_end_round(text,text,text) to anon, authenticated;
grant execute on function public.beer_close_room(text,text,text) to anon, authenticated;
