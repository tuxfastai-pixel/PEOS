import { z } from "zod";

const optionalNonBlank = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: optionalNonBlank(z.string().min(1)),
  PEOS_SESSION_ISSUER: z.string().min(1).default("peos"),
  PEOS_SESSION_TTL_SECONDS: z.coerce.number().int().positive().max(86_400).default(28_800),
  OIDC_ISSUER: optionalNonBlank(z.string().url()),
  OIDC_AUDIENCE: optionalNonBlank(z.string().min(1)),
  OIDC_JWKS_URL: optionalNonBlank(z.string().url()),
  PEOS_ALLOW_SELF_SIGNUP: z.enum(["true", "false"]).default("false"),
  SUPABASE_PUBLISHABLE_KEY: optionalNonBlank(z.string().min(1)),
});

export type ServerEnvironment = z.infer<typeof serverEnvSchema>;

export function readServerEnvironment(source: NodeJS.ProcessEnv = process.env): ServerEnvironment {
  return serverEnvSchema.parse(source);
}
