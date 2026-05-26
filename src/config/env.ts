export const config = {
    port: parseInt(process.env.PORT || '5000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    database: {
        url: process.env.DATABASE_URL,
    },
    jwtSecret: process.env.JWT_SECRET || 'dev-secret',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    adminPhone: process.env.ADMIN_PHONE || '',
};

export const validateConfig = () => {
    if (!process.env.DATABASE_URL) {
        throw new Error('Missing DATABASE_URL in .env');
    }
    if (!process.env.ADMIN_PHONE) {
        throw new Error('Missing ADMIN_PHONE in .env');
    }
};