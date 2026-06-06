const isDev = __DEV__;

const logger = {
  log: (...args: any[]) => {
    if (isDev) console.log(...args);
  },

  info: (...args: any[]) => {
    if (isDev) console.info(...args);
  },

  // warn and error always fire — they surface in device logs, crash reports,
  // and Sentry breadcrumbs even in production builds where console.log is
  // silenced. Silencing them was causing crashes to be completely invisible.
  warn: (...args: any[]) => {
    console.warn(...args);
  },

  error: (...args: any[]) => {
    console.error(...args);
  },
};

export default logger;
