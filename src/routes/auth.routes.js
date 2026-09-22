import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import { validate, registerSchema, loginSchema } from '../lib/validate.js';
import * as authService from '../services/auth.service.js';

export const authRouter = Router();

authRouter.post('/register', asyncHandler(async (req, res) => {
  const data = validate(registerSchema, req.body);
  const result = await authService.register(data);
  res.status(201).json(result);
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const data = validate(loginSchema, req.body);
  const result = await authService.login(data);
  res.json(result);
}));
