// Copiá este archivo como config.js y completá tus datos.
// Supabase > Project Settings > Data API (URL) y API Keys (anon public).
// La anon key es pública por diseño: la seguridad la da Row Level Security.
window.CONFIG = {
  SUPABASE_URL:      'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU-ANON-KEY',

  // Para la carga automática desde Gmail y Mercado Pago.
  // Es la URL de tus Edge Functions, sin barra final:
  FUNCTIONS_URL:     'https://TU-PROYECTO.supabase.co/functions/v1',

  // Opcional: clave pública VAPID para los avisos push. Dejala vacía
  // y los avisos van a aparecer igual dentro de la app.
  VAPID_PUBLIC:      ''
};
