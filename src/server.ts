import app from './app';
import { env } from './config/env';
import { checkDatabaseConnection } from './config/database';

async function bootstrap(): Promise<void> {
  await checkDatabaseConnection();
  console.log('Database connected');

  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
