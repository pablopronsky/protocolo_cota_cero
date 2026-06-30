import { z } from 'zod';

const clientEnvSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY:            z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:        z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID:         z.string().min(1),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:     z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID:             z.string().min(1),
});

export const clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_FIREBASE_API_KEY:             process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:         process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID:          process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID:              process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

const serverEnvSchema = z.object({
  FIREBASE_ADMIN_PROJECT_ID:   z.string().min(1),
  FIREBASE_ADMIN_CLIENT_EMAIL: z.string().min(1),
  FIREBASE_ADMIN_PRIVATE_KEY:  z.string().min(1),
});

export const serverEnv = typeof window === 'undefined'
  ? serverEnvSchema.parse({
      FIREBASE_ADMIN_PROJECT_ID:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      FIREBASE_ADMIN_PRIVATE_KEY:  process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    })
  : null;
