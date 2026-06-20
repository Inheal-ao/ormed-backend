import { Request, Response, NextFunction } from 'express';

/**
 * Remove chaves perigosas (operadores MongoDB) de objetos enviados pelo cliente,
 * mitigando injeção NoSQL (ex.: { "$gt": "" }, { "campo.$where": ... }).
 */
function scrub(value: unknown, depth = 0): void {
  if (depth > 6 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v) => scrub(v, depth + 1));
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
    } else {
      scrub(obj[key], depth + 1);
    }
  }
}

export function mongoSanitize(req: Request, _res: Response, next: NextFunction): void {
  scrub(req.body);
  scrub(req.query);
  scrub(req.params);
  next();
}
