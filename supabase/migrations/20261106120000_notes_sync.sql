-- Notes shared across every device a user signs in on.
--
-- Each browser keeps a local copy (localStorage) and syncs with this table:
--   push: devices send changed notes through push_notes(); the newer client_updated_at wins.
--   pull: devices read rows whose server_updated_at is past their last cursor.
-- Deletes are kept as tombstones (deleted_at set, transcript emptied) so other devices learn about them.

CREATE TABLE public.notes (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Client-generated id. Text, not uuid: older exported/imported notes may carry other id formats.
  id text NOT NULL,
  title text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL,
  transcript_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_hash text,
  -- When the note last changed on the device that wrote it. Decides conflicts (last write wins).
  client_updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Set by the server on every write. Devices pull everything past their last cursor.
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- Keyed per user so two accounts importing the same exported file never collide.
  PRIMARY KEY (user_id, id)
);

CREATE INDEX notes_user_server_updated_idx ON public.notes (user_id, server_updated_at);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notes."
  ON public.notes FOR SELECT
  USING ( auth.uid() = user_id );

CREATE POLICY "Users can insert own notes."
  ON public.notes FOR INSERT
  WITH CHECK ( auth.uid() = user_id );

CREATE POLICY "Users can update own notes."
  ON public.notes FOR UPDATE
  USING ( auth.uid() = user_id )
  WITH CHECK ( auth.uid() = user_id );

CREATE POLICY "Users can delete own notes."
  ON public.notes FOR DELETE
  USING ( auth.uid() = user_id );

-- Stamp every write with the server clock so the pull cursor never depends on device clocks.
CREATE OR REPLACE FUNCTION public.notes_touch_server_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.server_updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER notes_touch_server_updated_at
  BEFORE INSERT OR UPDATE ON public.notes
  FOR EACH ROW EXECUTE PROCEDURE public.notes_touch_server_updated_at();

-- Upsert a batch of notes for the signed-in user. A row only overwrites the stored one when its
-- client_updated_at is newer, so a stale device can never clobber a fresher edit.
-- Returns the ids that were written.
--
-- p_notes: [{ id, title, recorded_at, transcript_items, content_hash, client_updated_at, deleted_at }]
CREATE OR REPLACE FUNCTION public.push_notes(p_notes jsonb)
RETURNS SETOF text
LANGUAGE plpgsql
SECURITY INVOKER -- runs under the caller's RLS
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  INSERT INTO public.notes AS n
    (user_id, id, title, recorded_at, transcript_items, content_hash, client_updated_at, deleted_at)
  SELECT DISTINCT ON (x->>'id')
    v_user_id,
    x->>'id',
    COALESCE(x->>'title', ''),
    (x->>'recorded_at')::timestamptz,
    CASE WHEN x->>'deleted_at' IS NULL THEN COALESCE(x->'transcript_items', '[]'::jsonb) ELSE '[]'::jsonb END,
    x->>'content_hash',
    (x->>'client_updated_at')::timestamptz,
    (x->>'deleted_at')::timestamptz
  FROM jsonb_array_elements(p_notes) AS x
  WHERE x->>'id' IS NOT NULL
  ORDER BY x->>'id', (x->>'client_updated_at')::timestamptz DESC
  ON CONFLICT (user_id, id) DO UPDATE SET
    title = EXCLUDED.title,
    recorded_at = EXCLUDED.recorded_at,
    transcript_items = EXCLUDED.transcript_items,
    content_hash = EXCLUDED.content_hash,
    client_updated_at = EXCLUDED.client_updated_at,
    deleted_at = EXCLUDED.deleted_at
  WHERE n.client_updated_at < EXCLUDED.client_updated_at
  RETURNING n.id;
END;
$$;

REVOKE ALL ON FUNCTION public.push_notes(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.push_notes(jsonb) TO authenticated;
