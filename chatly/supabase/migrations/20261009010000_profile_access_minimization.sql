-- Keep privileged account state available through the self-scoped SECURITY DEFINER RPC only.
REVOKE SELECT (role, is_suspended) ON TABLE public.profiles FROM authenticated;
