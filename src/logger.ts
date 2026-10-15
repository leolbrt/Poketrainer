import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

const targets: pino.TransportTargetOptions[] = [
    {
        target: 'pino/file',
        level: 'debug',
        options: { destination: './logs/app.log', mkdir: true },
    },
];

if (!isProd) {
    targets.push({
        target: 'pino-pretty',
        level: 'debug',
        options: { colorize: true, translateTime: 'SYS:standard' },
    });
}

export const logger = pino({
    level: isProd ? 'info' : 'debug',
    transport: { targets },
});
