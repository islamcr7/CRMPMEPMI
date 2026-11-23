import 'dotenv/config';

export const config = {
  // API_PORT (et non PORT) pour éviter les conflits avec les outils qui définissent PORT pour le frontend
  // En hébergement (Render…), la plateforme impose PORT ; API_PORT reste prioritaire en local.
  port: Number(process.env.API_PORT ?? process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? '',
  isProd: process.env.NODE_ENV === 'production',
  tokenTtlDays: 7,
  /** Assistant IA : fournisseur compatible « OpenAI » (chat/completions avec outils) */
  ai: {
    apiKey: process.env.AI_API_KEY ?? '',
    baseUrl: (process.env.AI_BASE_URL ?? '').replace(/\/+$/, ''),
    model: process.env.AI_MODEL ?? '',
    /** Nombre maximal d'allers-retours modèle ↔ outils par message */
    maxSteps: Number(process.env.AI_MAX_STEPS ?? 8),
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 60_000),
  },
};

export const aiConfigured = () => !!(config.ai.baseUrl && config.ai.model);

if (!config.jwtSecret || config.jwtSecret.length < 16) {
  throw new Error('JWT_SECRET manquant ou trop court dans server/.env');
}
