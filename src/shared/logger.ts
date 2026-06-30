import { inspect } from "node:util";
import { redactObject } from "./redaction.js";

type LogLevel = "info" | "warn" | "error";

type LoggerContext = Record<string, unknown>;

function write(level: LogLevel, message: string, context: LoggerContext = {}): void {
  const safeContext = redactObject(context);
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message} ${inspect(safeContext)}`;
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, context?: LoggerContext): void => write("info", message, context ?? {}),
  warn: (message: string, context?: LoggerContext): void => write("warn", message, context ?? {}),
  error: (message: string, context?: LoggerContext): void => write("error", message, context ?? {}),
};
