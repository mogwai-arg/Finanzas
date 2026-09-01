import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

export const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

export const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Usuario dueño del token que manda el front. */
export async function usuarioDe(req: Request) {
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return null;
  const { data } = await admin().auth.getUser(jwt);
  return data.user ?? null;
}

export const hoyISO = () => new Date().toISOString().slice(0, 10);
