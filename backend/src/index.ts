import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { initDb } from './config/initDb';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));

// Basic health check route
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Saksham School Management API is running',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// Initialize DB and start server
const startServer = async () => {
  try {
    // Run schema migrations and base seedings
    await initDb();
    
    app.listen(PORT, () => {
      console.log(`🚀 Saksham API Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    });
  } catch (error) {
    console.error('❌ Failed to start the server due to database initialization failure:', error);
    process.exit(1);
  }
};

startServer();
