type Level = "debug" | "info" | "warn" | "error";

const levelOrder: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: Level = (process.env.LOG_LEVEL as Level) || (process.env.NODE_ENV === "production" ? "info" : "debug");

function emit(level: Level, message: string, fields: Record<string, unknown> = {}) {
  if (levelOrder[level] < levelOrder[minLevel]) return;
  const entry = { ts: new Date().toISOString(), level, message, ...fields };
  const line = JSON.stringify(entry, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => emit("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit("error", message, fields),
  child(base: Record<string, unknown>) {
    return {
      debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, { ...base, ...f }),
      info: (m: string, f?: Record<string, unknown>) => emit("info", m, { ...base, ...f }),
      warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, { ...base, ...f }),
      error: (m: string, f?: Record<string, unknown>) => emit("error", m, { ...base, ...f }),
    };
  },
};
