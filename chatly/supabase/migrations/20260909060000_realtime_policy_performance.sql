-- Cache the current user once when authorizing friendship broadcasts.
ALTER POLICY friendship_broadcast_select
  ON realtime.messages
  USING (realtime.topic() = 'friendships:' || (SELECT auth.uid())::TEXT);

