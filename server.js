const http = require("http");
const next = require("next");

// `npm start` is the production entrypoint on cPanel/HostAfrica. Some hosting
// panels do not inject NODE_ENV, so only opt into development explicitly.
const dev = process.env.NODE_ENV === "development";
const hostname = process.env.HOSTNAME || process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  http
    .createServer((req, res) => {
      handle(req, res);
    })
    .listen(port, hostname, () => {
      console.log(`Sunspark ready on http://${hostname}:${port}`);
    });
});
