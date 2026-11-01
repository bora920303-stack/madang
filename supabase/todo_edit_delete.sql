-- 기존 madang Supabase 프로젝트 SQL Editor에서 1회 실행
-- 기존 데이터는 유지합니다. 삭제는 화면에서 직접 확인한 경우에만 수행됩니다.

-- 팀 생성자만 팀 이름 변경/삭제 가능
create or replace function public.todo_rename_team(p_team_id uuid,p_name text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if p_name is null or length(trim(p_name))=0 or length(trim(p_name))>80 then raise exception 'Invalid team name'; end if;
  update public.todo_teams set name=trim(p_name)
  where id=p_team_id and created_by=auth.uid();
  if not found then raise exception 'Only team owner can rename team'; end if;
end $$;

create or replace function public.todo_delete_team(p_team_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  delete from public.todo_teams where id=p_team_id and created_by=auth.uid();
  if not found then raise exception 'Only team owner can delete team'; end if;
end $$;

revoke all on function public.todo_rename_team(uuid,text),public.todo_delete_team(uuid) from public,anon;
grant execute on function public.todo_rename_team(uuid,text),public.todo_delete_team(uuid) to authenticated;

-- 할 일은 해당 팀원 누구나 수정 / 삭제 가능
drop policy if exists "tasks delete" on public.todo_tasks;
create policy "tasks delete" on public.todo_tasks for delete to authenticated
using (public.todo_is_member(team_id));

-- 게시글은 작성자만 수정 / 삭제 가능
drop policy if exists "posts update" on public.todo_posts;
create policy "posts update" on public.todo_posts for update to authenticated
using (public.todo_is_member(team_id) and author_id=auth.uid())
with check (public.todo_is_member(team_id) and author_id=auth.uid());

drop policy if exists "posts delete" on public.todo_posts;
create policy "posts delete" on public.todo_posts for delete to authenticated
using (public.todo_is_member(team_id) and author_id=auth.uid());

-- 댓글은 작성자만 수정 / 삭제 가능
drop policy if exists "comments update" on public.todo_comments;
create policy "comments update" on public.todo_comments for update to authenticated
using (author_id=auth.uid() and exists (
  select 1 from public.todo_posts p
  where p.id=post_id and public.todo_is_member(p.team_id)
))
with check (author_id=auth.uid() and exists (
  select 1 from public.todo_posts p
  where p.id=post_id and public.todo_is_member(p.team_id)
));

drop policy if exists "comments delete" on public.todo_comments;
create policy "comments delete" on public.todo_comments for delete to authenticated
using (author_id=auth.uid() and exists (
  select 1 from public.todo_posts p
  where p.id=post_id and public.todo_is_member(p.team_id)
));
