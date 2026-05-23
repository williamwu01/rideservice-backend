import { Request, Response, NextFunction } from 'express';

// This is an Express middleware that catches errors
// It runs AFTER all your routes, catching any errors they throw
export const errorHandler = (
    error: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.error('Error:', error);

    // Default error response
    const status = error.status || 500;
    const message = error.message || 'Internal Server Error';

    res.status(status).json({
        error: message,
        status: status,
        timestamp: new Date().toISOString(),
    });
};