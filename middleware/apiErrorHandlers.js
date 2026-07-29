import eventStreamService from '../src/services/eventStreamService.js';

/**
 * Catches any /api/* request that fell through every mounted router
 * (typo'd path, unmounted route, wrong method, etc). Without this,
 * Express's default 404 returns an HTML page — which is exactly what
 * produced "Unexpected token '<'" on the frontend, since it always
 * expects JSON back from /api routes.
 *
 * Must be registered AFTER all real API routes, and BEFORE the SPA
 * catch-all (`app.get("/{*path}", ...)`) — otherwise the SPA catch-all
 * would swallow this first for GETs, and unmatched POST/PUT/DELETE to
 * /api/* would still fall through with no handler at all.
 */
export function apiNotFoundHandler(req, res, next) {
    if (!req.originalUrl.startsWith('/api')) return next();

    eventStreamService
        .emit('api.route_not_found', {
            method: req.method,
            path: req.originalUrl,
            userId: req.user?.id || null,
        })
        .catch(() => {});

    return res.status(404).json({
        error: 'Not found',
        code: 'ROUTE_NOT_FOUND',
        path: req.originalUrl,
    });
}

/**
 * Global error handler — catches anything thrown or passed to next(err)
 * anywhere in the API. Guarantees JSON back to the client no matter what
 * broke, and pushes the failure to the same event stream the deposit
 * pipeline / operator dashboard already listens on, so it shows up live
 * instead of only in server logs.
 *
 * Must be the LAST app.use() call, after every route and after
 * apiNotFoundHandler.
 */
export function globalErrorHandler(err, req, res, next) {
    console.error(`[UnhandledError] ${req.method} ${req.originalUrl}:`, err);

    eventStreamService
        .emit('api.unhandled_error', {
            method: req.method,
            path: req.originalUrl,
            userId: req.user?.id || null,
            message: err.message,
            // Stack intentionally omitted from the emitted event — keep
            // full stack in server console logs only, not in an event
            // stream that admin dashboards render.
        })
        .catch(() => {});

    if (res.headersSent) return next(err);

    const status = err.status || err.statusCode || 500;
    return res.status(status).json({
        error: status === 500 ? 'Internal server error' : err.message,
        code: err.code || 'INTERNAL_ERROR',
    });
}
