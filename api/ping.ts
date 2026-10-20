export default function handler(
  req: { url?: string; originalUrl?: string },
  res: {
    status: (code: number) => {
      json: (body: unknown) => void;
    };
  },
) {
  res.status(200).json({
    url: req.url,
    originalUrl: req.originalUrl,
    env: {
      hasTursoUrl: Boolean(process.env.TURSO_DATABASE_URL),
      hasTursoToken: Boolean(process.env.TURSO_AUTH_TOKEN),
      hasAdminToken: Boolean(process.env.ADMIN_TOKEN),
      hasAdminUser: Boolean(process.env.ADMIN_USER),
      hasAdminPassword: Boolean(process.env.ADMIN_PASSWORD),
    },
  });
}
