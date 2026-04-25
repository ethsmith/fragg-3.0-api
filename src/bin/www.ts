#!/usr/bin/env node

/**
 * Module dependencies.
 */

import 'dotenv/config';
import app from '../app';
import debugFactory from 'debug';
import http from 'http';
import { AddressInfo } from 'net';
import { connectDB, disconnectDB } from '../config/db';

const debug = debugFactory('fragg-3.0-api:server');

/**
 * Get port from environment and store in Express.
 */

const port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

/**
 * Create HTTP server.
 */

const server = http.createServer(app);

/**
 * Connect to MongoDB, then start listening.
 */

connectDB()
  .then(() => {
    debug('MongoDB connected');
    server.listen(port);
    server.on('error', onError);
    server.on('listening', onListening);
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

/**
 * Graceful shutdown.
 */

async function shutdown(signal: string): Promise<void> {
  debug(`Received ${signal}, shutting down...`);
  server.close(() => {
    debug('HTTP server closed');
  });
  try {
    await disconnectDB();
  } catch (err) {
    console.error('Error during MongoDB disconnect:', err);
  }
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val: string): number | string | false {
  const port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error: NodeJS.ErrnoException): void {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening(): void {
  const addr = server.address() as AddressInfo | string | null;
  const bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + (addr ? addr.port : '');
  debug('Listening on ' + bind);
}
