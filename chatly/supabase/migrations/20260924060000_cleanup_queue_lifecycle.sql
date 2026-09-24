-- A Storage API removal makes the retry row obsolete immediately.
CREATE OR REPLACE FUNCTION public.dequeue_removed_storage_object()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.storage_cleanup_queue WHERE object_id = OLD.id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.dequeue_removed_storage_object() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS dequeue_removed_storage_object ON storage.objects;
CREATE TRIGGER dequeue_removed_storage_object
  AFTER DELETE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.dequeue_removed_storage_object();

DELETE FROM public.storage_cleanup_queue AS queue
WHERE NOT EXISTS (
  SELECT 1 FROM storage.objects AS object WHERE object.id = queue.object_id
);
