import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const MIN_SECRET_LENGTH = 32;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

export interface ValidatedJwtSecrets {
  jwtSecret: string;
  jwtRefreshSecret: string;
}

/**
 * Validates JWT signing and refresh secrets from environment variables.
 * Enforces:
 * 1. Both secrets are defined and non-empty.
 * 2. Minimum length of at least 32 characters (256 bits).
 * 3. Secrets are distinct from each other (JWT_SECRET !== JWT_REFRESH_SECRET).
 *
 * Throws a descriptive Error without leaking secret values.
 */
export const validateJwtSecrets = (): ValidatedJwtSecrets => {
  const jwtSecret = process.env.JWT_SECRET;
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

  if (!jwtSecret || jwtSecret.trim() === '') {
    throw new Error('FATAL SECURITY CONFIGURATION: JWT_SECRET environment variable is missing or empty.');
  }

  if (!jwtRefreshSecret || jwtRefreshSecret.trim() === '') {
    throw new Error('FATAL SECURITY CONFIGURATION: JWT_REFRESH_SECRET environment variable is missing or empty.');
  }

  if (jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`FATAL SECURITY CONFIGURATION: JWT_SECRET is too short. Minimum required length is ${MIN_SECRET_LENGTH} characters.`);
  }

  if (jwtRefreshSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`FATAL SECURITY CONFIGURATION: JWT_REFRESH_SECRET is too short. Minimum required length is ${MIN_SECRET_LENGTH} characters.`);
  }

  if (jwtSecret === jwtRefreshSecret) {
    throw new Error('FATAL SECURITY CONFIGURATION: JWT_SECRET and JWT_REFRESH_SECRET must be distinct and independent values.');
  }

  return { jwtSecret, jwtRefreshSecret };
};

/**
 * Retrieves the validated access token signing secret.
 */
export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error('FATAL SECURITY CONFIGURATION: JWT_SECRET is not configured or does not meet the minimum 32-character requirement.');
  }
  return secret;
};

/**
 * Retrieves the validated refresh token signing secret.
 */
export const getJwtRefreshSecret = (): string => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret || secret.trim() === '' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error('FATAL SECURITY CONFIGURATION: JWT_REFRESH_SECRET is not configured or does not meet the minimum 32-character requirement.');
  }
  return secret;
};

export interface TokenPayload {
  userId: string;
  role: string;
  name?: string;
  email?: string;
  phone?: string;
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
  const secret = getJwtSecret();
  const options: jwt.SignOptions = { expiresIn: JWT_EXPIRY as jwt.SignOptions['expiresIn'] };
  return jwt.sign(
    { userId: payload.userId, role: payload.role },
    secret,
    options
  );
};

/**
 * Generates a long-lived refresh token (JWT) containing userId.
 */
export const generateRefreshToken = (payload: Pick<TokenPayload, 'userId'>): string => {
  const refreshSecret = getJwtRefreshSecret();
  const options: jwt.SignOptions = { expiresIn: JWT_REFRESH_EXPIRY as jwt.SignOptions['expiresIn'] };
  return jwt.sign(
    { userId: payload.userId },
    refreshSecret,
    options
  );
};

/**
 * Verifies an access token and returns its decoded payload, or null if invalid.
 */
export const verifyAccessToken = (token: string): { userId: string; role: string } | null => {
  try {
    const secret = getJwtSecret();
    return jwt.verify(token, secret) as { userId: string; role: string };
  } catch (error) {
    return null;
  }
};

/**
 * Verifies a refresh token and returns its decoded payload, or null if invalid.
 */
export const verifyRefreshToken = (token: string): { userId: string } | null => {
  try {
    const refreshSecret = getJwtRefreshSecret();
    return jwt.verify(token, refreshSecret) as { userId: string };
  } catch (error) {
    return null;
  }
};
