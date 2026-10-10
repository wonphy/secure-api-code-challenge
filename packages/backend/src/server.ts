import express from "express";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3001", 10);

app.get("/health", (_request, response) => {
  response.status(200).json({ service: "backend", status: "ok" });
});

app.get("/api/v1/status", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.use("/api/users", (request, response, next) => {
  if (!request.header("x-verified-user")) {
    response.status(403).json({ error: "verified user header is required" });
    return;
  }

  next();
});

app.get("/api/users", (_request, response) => {
  response.status(200).json({ users: [] });
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
