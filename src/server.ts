import express from "express";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
