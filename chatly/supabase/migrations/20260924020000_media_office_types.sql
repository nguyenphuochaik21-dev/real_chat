-- Accept spreadsheet and text documents in the existing private chat-media bucket.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY(
  SELECT DISTINCT mime
  FROM UNNEST(
    COALESCE(allowed_mime_types, ARRAY[]::TEXT[]) || ARRAY[
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/plain'
    ]::TEXT[]
  ) AS mime
)
WHERE id = 'chat-media';
