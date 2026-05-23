export const config = {
    port: parseInt(process.env.PORT || '5000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    database: {
        url: process.env.DATABASE_URL,
    },
    jwtSecret: process.env.JWT_SECRET || 'dev-secret',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',  // ADD THIS LINE
};

export const validateConfig = () => {
    // console.log('All env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('PORT')));
    // console.log('DATABASE_URL value:', process.env.DATABASE_URL);
    
    if (!process.env.DATABASE_URL) {
        throw new Error('Missing DATABASE_URL in .env');
    }
};