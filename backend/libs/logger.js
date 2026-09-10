import winston from "winston";

const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }), // Important: handle Error objects
        winston.format.json()
    ),
    transports: [new winston.transports.Console()]
});

export default logger;
