-- Tafaß V1.1.6.24
-- Real publication RPC for personal accounts, Pages and Groups.
-- The function derives the author from auth.uid() and does not trust
-- a browser-supplied user_id/owner_id.

CREATE OR REPLACE FUNCTION public.tafa_create_post(
  p_id uuid,
  p_content text DEFAULT '',
  p_media_url text DEFAULT NULL,
  p_media_type text DEFAULT 'text',
  p_visibility text DEFAULT 'public',
  p_publisher_page_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL
)
RETURNS public.posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.posts;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Session Supabase introuvable.';
  END IF;

  IF p_publisher_page_id IS NOT NULL AND p_group_id IS NOT NULL THEN
    RAISE EXCEPTION 'Une publication ne peut pas cibler une Page et un Groupe en même temps.';
  END IF;

  -- Personal publication
  IF p_publisher_page_id IS NULL AND p_group_id IS NULL THEN
    NULL;

  -- Page publication: only the Page owner can publish as the Page.
  ELSIF p_publisher_page_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.pages p
      WHERE p.id = p_publisher_page_id
        AND p.owner_id = v_user_id
    ) THEN
      RAISE EXCEPTION 'Vous ne pouvez publier qu''au nom de votre propre Page.';
    END IF;

  -- Group publication: active members only.
  ELSIF p_group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = p_group_id
        AND gm.user_id = v_user_id
        AND gm.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Vous devez être membre actif du groupe pour publier.';
    END IF;
  END IF;

  INSERT INTO public.posts (
    id,
    user_id,
    content,
    media_url,
    media_type,
    visibility,
    owner_id,
    allowed_users,
    publisher_page_id,
    group_id
  )
  VALUES (
    COALESCE(p_id, gen_random_uuid()),
    v_user_id,
    COALESCE(p_content, ''),
    p_media_url,
    COALESCE(p_media_type, 'text'),
    COALESCE(p_visibility, 'public'),
    v_user_id,
    '{}'::uuid[],
    p_publisher_page_id,
    p_group_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.tafa_create_post(
  uuid, text, text, text, text, uuid, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.tafa_create_post(
  uuid, text, text, text, text, uuid, uuid
) TO authenticated;

NOTIFY pgrst, 'reload schema';
