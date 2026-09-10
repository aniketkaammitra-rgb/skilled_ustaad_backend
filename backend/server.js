import env from "./config/env.js";
import connectDB from "./config/db.js";
import app from "./app.js";
import logger from "./libs/logger.js";

import http from "http";
import path from "path";
import { initIO } from "./libs/socket.js";

import fs from "fs";

const server = http.createServer(app);
initIO(server);

// Ensure upload directories exist for production stability
const UPLOAD_DIRS = ["uploads", "uploads/profilePhotos", "uploads/documents", "uploads/temp"];
UPLOAD_DIRS.forEach(dir => {
  const fullPath = path.join(path.resolve(), dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    logger.info(`Initialization: Created directory ${dir}`);
  }
});

const start = async () => {
  try {
    await connectDB();
    const runningServer = server.listen(env.port, () => {
      logger.info(`Karaya Bandhu Backend: Node.js Instance Active on Port ${env.port}`);
      logger.info(`Environment: ${env.env}`);
    });

    // Start service reminder scheduler
    try {
      const { startReminderScheduler } = await import("./services/reminderScheduler.service.js");
      startReminderScheduler();
    } catch (schedErr) {
      logger.error("Failed to start service reminder scheduler:", schedErr);
    }

    // Start booking cleanup scheduler
    try {
      const { startBookingCleanupScheduler } = await import("./services/bookingCleanup.service.js");
      startBookingCleanupScheduler();
    } catch (schedErr) {
      logger.error("Failed to start booking cleanup scheduler:", schedErr);
    }

    // Graceful Shutdown implementation
    const shutdown = async (signal) => {
      logger.info(`${signal} received: closing HTTP server...`);
      runningServer.close(async () => {
        logger.info("HTTP server closed.");
        try {
          const mongoose = (await import("mongoose")).default;
          await mongoose.connection.close(false);
          logger.info("Database connections minimized. Shutdown complete.");
          process.exit(0);
        } catch (err) {
          logger.error("Error during DB cleanup:", err);
          process.exit(1);
        }
      });

      // Force shutdown after 10 seconds if graceful fails
      setTimeout(() => {
        logger.error("Could not close connections in time, forcefully shutting down");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

  } catch (error) {
    logger.error("FATAL: Initialization Failure", error);
    process.exit(1);
  }
};

// Global Error Handlers to prevent silent crashes in production
process.on("unhandledRejection", (err) => {
  logger.error("SYSTEM ERROR: Unhandled Rejection", { error: err.message, stack: err.stack });
  // In production, you might want to restart the process gracefully
});

process.on("uncaughtException", (err) => {
  logger.error("SYSTEM ERROR: Uncaught Exception", { error: err.message, stack: err.stack });
  process.exit(1);
});

start();

// Graceful Shutdown - Crucial for zero-downtime production deployment (Render, Kubernetes, etc.)
const gracefulShutdown = (signal) => {
  logger.info(`RECEIVED ${signal}: Commencing graceful server termination.`);
  
  // Stop accepting new connections
  server.close(async () => {
    logger.info("HTTP infrastructure halted. No new requests being processed.");
    
    try {
      // Import mongoose directly to close connection
      const mongoose = (await import("mongoose")).default;
      await mongoose.connection.close();
      logger.info("Database connection safely severed.");
      
      process.exit(0);
    } catch (err) {
      logger.error("SYSTEM ERROR: Graceful shutdown was imperfect", err.message);
      process.exit(1);
    }
  });

  // Force shutdown if graceful completion takes too long
  setTimeout(() => {
    logger.error("SYSTEM TIMEOUT: Graceful termination exceeded maximum allotted time (10s). Forcing process exit.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
