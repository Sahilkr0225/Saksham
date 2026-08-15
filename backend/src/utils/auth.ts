import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey_saksham123!';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'supersecretjwtrefreshkey_saksham456!';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

export interface TokenPayload {
  userId: string;
  role: string;
  name?: string;
  email?: string;
  phone?: string
}

/**
 * Hashes a plain password using bcrypt with 12 salt rounds.
 */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

/**
 * Compares a plain password with a hashed password.
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

/**
 * Generates a short-lived access token (JWT) containing userId and role.
 */
export const generateAccessToken = (payload: TokenPayload): string => {
  const options: jwt.SignOptions = { expiresIn: JWT_EXPIRY as jwt.SignOptions['expiresIn'] };
  return jwt.sign(
    { userId: payload.userId, role: payload.role },
    JWT_SECRET,
    options
  );
};

/**
 * Generates a long-lived refresh token (JWT) containing userId.
 */
export const generateRefreshToken = (payload: Pick<TokenPayload, 'userId'>): string => {
  const options: jwt.SignOptions = { expiresIn: JWT_REFRESH_EXPIRY as jwt.SignOptions['expiresIn'] };
  return jwt.sign(
    { userId: payload.userId },
    JWT_REFRESH_SECRET,
    options
  );
};

/**
 * Verifies an access token and returns its decoded payload, or null if invalid.
 */
export const verifyAccessToken = (token: string): { userId: string; role: string } | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
  } catch (error) {
    return null;
  }
};

/**
 * Verifies a refresh token and returns its decoded payload, or null if invalid.
 */
export const verifyRefreshToken = (token: string): { userId: string } | null => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string };
  } catch (error) {
    return null;
  }
};
