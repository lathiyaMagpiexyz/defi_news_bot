import winston from 'winston';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

// Check if running in Lambda environment
const isLambda = !!process.env['AWS_LAMBDA_FUNCTION_NAME'];

// Ensure logs directory exists (only for local environment)
const logsDir = isLambda ? '/tmp/logs' : './logs';
if (!isLambda && !existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Safe JSON stringify that handles circular references
function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    // Handle Error objects
    if (value instanceof Error) {
      return {
        message: value.message,
        name: value.name,
        stack: value.stack?.split('\n').slice(0, 3).join('\n'),
      };
    }
    return value;
  });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${safeStringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

// Build transports based on environment
const transports: winston.transport[] = [
  // Console output (CloudWatch captures this in Lambda)
  new winston.transports.Console({
    format: consoleFormat,
  }),
];

// Add file transports only in local environment
if (!isLambda) {
  transports.push(
    // File output - all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    // File output - errors only
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] || 'info',
  transports,
});

// Create child loggers for different modules
export function createLogger(module: string) {
  return logger.child({ module });
}

export default logger;
