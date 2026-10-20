/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function handler(req: any, res: any) {
  try {
    const [{ default: express }, { router }] = await Promise.all([
      import("express"),
      import("../backend/app"),
    ]);

    const app = express();

    app.use(express.json());
    app.use((request: any, _response: any, next: any) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const rewrittenPath = url.searchParams.get("__path");

      if (rewrittenPath !== null) {
        request.url = rewrittenPath ? `/api/${rewrittenPath}` : "/api/";
      }

      next();
    });
    app.use("/api", router);

    return app(req, res);
  } catch (error) {
    console.error("[api] failed:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}
