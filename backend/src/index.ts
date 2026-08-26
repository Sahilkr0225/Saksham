import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { initDb } from './config/initDb';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import academicRoutes from './routes/academicRoutes';
import admissionRoutes from './routes/admissionRoutes';
import studentRoutes from './routes/studentRoutes';
import parentRoutes from './routes/parentRoutes';
import teacherRoutes from './routes/teacherRoutes';
import attendanceRoutes from './routes/attendanceRoutes';
import homeworkRoutes from './routes/homeworkRoutes';
import examRoutes from './routes/examRoutes';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Core Middleware ──────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser()); // Required for reading HTTPOnly refresh_token cookie
app.use(morgan('dev'));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/v1/health', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Saksham School Management API is running',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/academic', academicRoutes);
app.use('/api/v1/admissions', admissionRoutes);
app.use('/api/v1/students', studentRoutes);
app.use('/api/v1/parents', parentRoutes);
app.use('/api/v1/teachers', teacherRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/homework', homeworkRoutes);
app.use('/api/v1/exams', examRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`🚀 Saksham API Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
      console.log(`📡 Health: http://localhost:${PORT}/api/v1/health`);
      console.log(`🔐 Auth:   http://localhost:${PORT}/api/v1/auth`);
    });
  } catch (error) {
    console.error('❌ Failed to start the server:', error);
    process.exit(1);
  }
};

startServer();
