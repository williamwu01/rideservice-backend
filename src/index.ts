import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bookingRoutes from './routes/bookings';
import { config, validateConfig } from './config/env';
import { errorHandler } from './middleware/errorHandler';

dotenv.config({ path: `${__dirname}/../.env` });

// Validate config before starting
try {
  validateConfig();
} catch (error) {
  console.error('❌ Config error:', error);
  process.exit(1);
}

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API routes
app.use('/api', bookingRoutes);

// Error handling middleware (MUST be last!)
app.use(errorHandler);

const PORT = process.env.PORT || 5001;

const server = app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT} (${config.nodeEnv})`);
});

// Heartbeat to prove server is alive (TESTING)
// setInterval(() => {
//   console.log('[HEARTBEAT]', new Date().toISOString());
// }, 5000);

// Keep process alive
process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close();
  process.exit(0);
});
