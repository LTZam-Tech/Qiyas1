import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './modules/auth/auth.routes';
import { errorHandler } from './utils/errors';

const app = express();

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/v1/auth', authRoutes);
app.use(errorHandler);

const PORT = 8000;

app.listen(PORT, () => {
  console.log(`✅ Auth test server running on http://localhost:${PORT}`);
  console.log(`🔑 Test login at: POST http://localhost:${PORT}/api/v1/auth/login`);
});
