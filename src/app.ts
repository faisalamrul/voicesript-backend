import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { swaggerSpec } from './config/swagger';
import { requestLogger } from './middlewares/requestLogger';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import apiRouter from './routes';

const app = express();

app.use(helmet({
  contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
}));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestLogger);

app.use('/api/v1', apiRouter);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'VoiceScript API Docs',
  swaggerOptions: { persistAuthorization: true },
}));
app.get('/api/docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
