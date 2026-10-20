export default function handler(
  req: { url?: string; originalUrl?: string },
  res: {
    status: (code: number) => {
      json: (body: unknown) => void;
    };
  },
) {
  res.status(200).json({ url: req.url, originalUrl: req.originalUrl });
}
