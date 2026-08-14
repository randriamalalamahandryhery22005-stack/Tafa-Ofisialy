BEGIN;

-- Message attachments bridge. This is deliberately SECURITY DEFINER so the
-- attachment layer is not blocked by table-level/RLS differences.
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  file_url text,
  file_name text,
  file_type text,
  file_size bigint,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.tafa_attach_message(
  p_message_id uuid,
  p_file_url text,
  p_file_name text,
  p_file_type text,
  p_file_size bigint,
  p_storage_path text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id_col text;
  v_url_col text;
  v_name_col text;
  v_type_col text;
  v_size_col text;
  v_path_col text;
  v_sql text;
  v_id uuid;
  v_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Utilisateur non connecté'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.messages m
    WHERE m.id=p_message_id
      AND (m.sender_id=auth.uid() OR m.recipient_id=auth.uid())
  ) INTO v_exists;
  IF NOT v_exists THEN RAISE EXCEPTION 'Accès refusé au message'; END IF;

  SELECT column_name INTO v_message_id_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='message_attachments'
    AND column_name IN ('message_id','messageid','msg_id')
  ORDER BY CASE column_name WHEN 'message_id' THEN 1 WHEN 'messageid' THEN 2 ELSE 3 END
  LIMIT 1;

  IF v_message_id_col IS NULL THEN RAISE EXCEPTION 'message_attachments ne contient pas de colonne message_id'; END IF;

  SELECT column_name INTO v_url_col FROM information_schema.columns
   WHERE table_schema='public' AND table_name='message_attachments' AND column_name IN ('file_url','url','media_url','attachment_url')
   ORDER BY CASE column_name WHEN 'file_url' THEN 1 WHEN 'url' THEN 2 WHEN 'media_url' THEN 3 ELSE 4 END LIMIT 1;
  SELECT column_name INTO v_name_col FROM information_schema.columns
   WHERE table_schema='public' AND table_name='message_attachments' AND column_name IN ('file_name','name','filename')
   ORDER BY CASE column_name WHEN 'file_name' THEN 1 WHEN 'name' THEN 2 ELSE 3 END LIMIT 1;
  SELECT column_name INTO v_type_col FROM information_schema.columns
   WHERE table_schema='public' AND table_name='message_attachments' AND column_name IN ('file_type','mime_type','type')
   ORDER BY CASE column_name WHEN 'file_type' THEN 1 WHEN 'mime_type' THEN 2 ELSE 3 END LIMIT 1;
  SELECT column_name INTO v_size_col FROM information_schema.columns
   WHERE table_schema='public' AND table_name='message_attachments' AND column_name IN ('file_size','size','size_bytes')
   ORDER BY CASE column_name WHEN 'file_size' THEN 1 WHEN 'size' THEN 2 ELSE 3 END LIMIT 1;
  SELECT column_name INTO v_path_col FROM information_schema.columns
   WHERE table_schema='public' AND table_name='message_attachments' AND column_name IN ('storage_path','path','file_path')
   ORDER BY CASE column_name WHEN 'storage_path' THEN 1 WHEN 'path' THEN 2 ELSE 3 END LIMIT 1;

  -- Rebuild the VALUES list according to available columns.
  v_sql := 'INSERT INTO public.message_attachments ('||quote_ident(v_message_id_col);
  IF v_url_col IS NOT NULL THEN v_sql:=v_sql||','||quote_ident(v_url_col); END IF;
  IF v_name_col IS NOT NULL THEN v_sql:=v_sql||','||quote_ident(v_name_col); END IF;
  IF v_type_col IS NOT NULL THEN v_sql:=v_sql||','||quote_ident(v_type_col); END IF;
  IF v_size_col IS NOT NULL THEN v_sql:=v_sql||','||quote_ident(v_size_col); END IF;
  IF v_path_col IS NOT NULL THEN v_sql:=v_sql||','||quote_ident(v_path_col); END IF;
  v_sql:=v_sql||') VALUES ($1';
  IF v_url_col IS NOT NULL THEN v_sql:=v_sql||',$2'; END IF;
  IF v_name_col IS NOT NULL THEN v_sql:=v_sql||',$3'; END IF;
  IF v_type_col IS NOT NULL THEN v_sql:=v_sql||',$4'; END IF;
  IF v_size_col IS NOT NULL THEN v_sql:=v_sql||',$5'; END IF;
  IF v_path_col IS NOT NULL THEN v_sql:=v_sql||',$6'; END IF;
  v_sql:=v_sql||') RETURNING id';

  EXECUTE v_sql INTO v_id USING p_message_id,p_file_url,p_file_name,p_file_type,p_file_size,p_storage_path;
  RETURN jsonb_build_object('success',true,'id',v_id,'message_id',p_message_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.tafa_get_message_attachments(p_message_ids uuid[])
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id_col text;
  v_sql text;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT column_name INTO v_message_id_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='message_attachments'
    AND column_name IN ('message_id','messageid','msg_id')
  ORDER BY CASE column_name WHEN 'message_id' THEN 1 WHEN 'messageid' THEN 2 ELSE 3 END LIMIT 1;
  IF v_message_id_col IS NULL THEN RETURN; END IF;
  v_sql := format($q$
    SELECT to_jsonb(a) FROM public.message_attachments a
    WHERE a.%I = ANY($1)
      AND EXISTS (
        SELECT 1 FROM public.messages m
        WHERE m.id = a.%I
          AND (m.sender_id=auth.uid() OR m.recipient_id=auth.uid())
      )
    ORDER BY a.created_at ASC NULLS LAST
  $q$,v_message_id_col,v_message_id_col);
  FOR r IN EXECUTE v_sql USING p_message_ids LOOP RETURN NEXT r.to_jsonb; END LOOP;
END;
$$;


GRANT EXECUTE ON FUNCTION public.tafa_attach_message(uuid,text,text,text,bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tafa_get_message_attachments(uuid[]) TO authenticated;

-- Realtime publication (safe if already present).
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.message_attachments; EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
