type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const formatMessage = (level: LogLevel, message: string, context?: LogContext) => {
  if (!context) {
    return `[Kernel][${level.toUpperCase()}] ${message}`;
  }
  return `[Kernel][${level.toUpperCase()}] ${message} ${JSON.stringify(context)}`;
};

export const logger = {
  info(message: string, context?: LogContext) {
    console.log(formatMessage("info", message, context));
  },
  warn(message: string, context?: LogContext) {
    console.warn(formatMessage("warn", message, context));
  },
  error(message: string, context?: LogContext) {
    console.error(formatMessage("error", message, context));
  },
};
