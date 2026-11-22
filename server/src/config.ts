import 'dotenv/config';

export const config = {
  // API_PORT (et non PORT) pour éviter les conflits avec les outils qui définissent PORT pour le frontend
  port: Number(process.env.API_PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? '',
  isProd: process.env.NODE_ENV === 'production',
  tokenTtlDays: 7,
};

if (!config.jwtSecret || config.jwtSecret.length < 16) {
  throw new Error('JWT_SECRET manquant ou trop court dans server/.env');
}
