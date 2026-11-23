import { config } from './config.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { errorHandler } from './lib/http.js';
import { requireAuth, requireCrud, requirePerm } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import companyRoutes from './routes/companies.js';
import contactRoutes from './routes/contacts.js';
import dealRoutes from './routes/deals.js';
import activityRoutes from './routes/activities.js';
import documentRoutes from './routes/documents.js';
import settingsRoutes from './routes/settings.js';
import dashboardRoutes from './routes/dashboard.js';
import searchRoutes from './routes/search.js';
import productRoutes from './routes/products.js';
import collectionRoutes from './routes/collections.js';
import counterRoutes from './routes/counters.js';
import roleRoutes from './routes/roles.js';
import { exportRouter, importRouter } from './routes/csv.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '10mb' })); // imports CSV volumineux
app.use(cookieParser());
if (!config.isProd) app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', requireAuth, userRoutes);
app.use('/api/companies', requireAuth, requireCrud('companies'), companyRoutes);
app.use('/api/contacts', requireAuth, requireCrud('contacts'), contactRoutes);
app.use('/api/deals', requireAuth, requireCrud('deals'), dealRoutes);
app.use('/api/activities', requireAuth, requireCrud('activities'), activityRoutes);
app.use('/api/documents', requireAuth, documentRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/search', requireAuth, searchRoutes);
app.use('/api/products', requireAuth, productRoutes);
app.use('/api/collections', requireAuth, requirePerm('invoices.view'), collectionRoutes);
app.use('/api/counters', requireAuth, counterRoutes);
app.use('/api/export', requireAuth, requirePerm('data.export'), exportRouter);
app.use('/api/import', requireAuth, requirePerm('data.import'), importRouter);
app.use('/api/roles', requireAuth, roleRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Route inconnue' });
});

// En production, l'API sert aussi le frontend compilé (client/dist)
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (config.isProd && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`API CRM démarrée sur http://localhost:${config.port}`);
});
