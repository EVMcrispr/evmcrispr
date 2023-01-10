import { createLogger, format, transports } from 'winston';

import { LOG_FILE_NAME } from './constants';

const { combine, align, timestamp, printf, colorize } = format;

const CONSOLE_OUTPUT = Boolean(process.env.CONSOLE_OUTPUT);

export const logger = createLogger({
  level: 'verbose',
  format: combine(
    timestamp({
      format: 'YYYY-MM-DD hh:mm:ss.SSS A',
    }),
    ...(CONSOLE_OUTPUT ? [colorize()] : []),
    align(),
    printf((info) => `[${info.timestamp}] ${info.level}: ${info.message}`),
  ),
  transports: [
    CONSOLE_OUTPUT
      ? new transports.Console()
      : new transports.File({
          filename: LOG_FILE_NAME,
        }),
  ],
});
