import jwt from 'jsonwebtoken';

export function createAccessToken(payload, env) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

export function verifyAccessToken(token, env) {
  return jwt.verify(token, env.jwtSecret);
}
