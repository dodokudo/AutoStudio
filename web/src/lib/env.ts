const requiredEnvVars = [
  'THREADS_TOKEN',
  'THREADS_BUSINESS_ID',
  'THREADS_ACCOUNT_ID',
  'CLAUDE_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
] as const;

type EnvKey = (typeof requiredEnvVars)[number];

type EnvConfig = Record<EnvKey, string>;

export function loadEnv(): EnvConfig {
  const config = {} as EnvConfig;

  requiredEnvVars.forEach((key) => {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    config[key] = value;
  });

  return config;
}

export function tryLoadEnv(): Partial<EnvConfig> {
  const config: Partial<EnvConfig> = {};

  requiredEnvVars.forEach((key) => {
    if (process.env[key]) {
      config[key] = process.env[key] as string;
    }
  });

  return config;
}
