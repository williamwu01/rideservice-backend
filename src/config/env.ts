export const config = {
    port: parseInt(process.env.PORT || '5000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    database: {
        url: process.env.DATABASE_URL,
    },
    jwtSecret: process.env.JWT_SECRET || 'dev-secret',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  tomtom: {
    apiKey: process.env.TOMTOM_API_KEY,
    baseUrl: process.env.TOMTOM_BASE_URL || 'https://api.tomtom.com',
  },
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID!,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
    baseUrl: process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com',
  },
};

export const validateConfig = () => {
    if (!process.env.DATABASE_URL) {
        throw new Error('Missing DATABASE_URL in .env');
    }
};