import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { connectDatabase } from './config/db.js';
import Document from './models/Document.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import employeeRoutes from './routes/employee.js';
import documentRoutes from './routes/documents.js';
import knowledgeRoutes from './routes/knowledge.js';
import analysisRoutes from './routes/analyses.js';
import conversationRoutes from './routes/conversations.js';
import correctionRoutes from './routes/corrections.js';
import versionRoutes from './routes/versions.js';
import reviewRoutes from './routes/reviews.js';
import insightsRoutes from './routes/insights.js';
import { errorHandler, notFound } from './utils/errors.js';

const app = express();
const port = Number(process.env.PORT || 5000);
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters.');
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));

// CLIENT_ORIGIN accepts a comma-separated list (e.g. localhost + 127.0.0.1).
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  // Requests without an Origin header (curl, same-origin proxy) are allowed.
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'BrandGuard API' }));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', insightsRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api', analysisRoutes);
app.use('/api', conversationRoutes);
app.use('/api', correctionRoutes);
app.use('/api', versionRoutes);
app.use('/api', reviewRoutes);
app.use('/api/brands/default/knowledge', knowledgeRoutes);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV === 'production') {
  const clientDistPath = path.resolve(__dirname, '../client/dist');
  app.use(express.static(clientDistPath));

  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

const STARTUP_ATTEMPTS = 5;

async function connectDatabaseWithRetry() {
  for (let attempt = 1; attempt <= STARTUP_ATTEMPTS; attempt += 1) {
    try {
      await connectDatabase();
      return;
    } catch (error) {
      // SRV lookups can fail transiently (flaky DNS, VPN, sleep/wake). Retry
      // instead of exiting, which would leave the API unreachable.
      console.error(`Database connection attempt ${attempt}/${STARTUP_ATTEMPTS} failed: ${error.message}`);
      if (attempt === STARTUP_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}

try {
  await connectDatabaseWithRetry();
  // A restart cannot leave a live analysis behind, so clear any stale locks.
  await Document.updateMany({ analysisStatus: 'pending' }, { $set: { analysisStatus: 'not_run' } });
  app.listen(port, '0.0.0.0', () => console.info(`BrandGuard API listening on ${port}`));
} catch (error) {
  console.error(`Startup failed: ${error.message}`);
  process.exit(1);
}