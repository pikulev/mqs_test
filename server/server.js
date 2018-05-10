const http = require("http");
const fs = require("fs/promises");

class SPARoutesParams {
  constructor(route, filePath) {
    this.registerRoute(null, route, filePath, "text/html");
  }

  registerRoute(routeType, route, filePath, contentType) {
    const routePath = routeType ? `/${routeType}${route}` : route;
    this[routePath] = {
      filePath,
      routeType,
      headers: { "Content-Type": contentType }
    };
    return this;
  }
}

const PORT = 9077;
const ENCODING = "utf-8";
const API_ROUTE_TYPE = "api";
const ASSET_ROUTE_TYPE = "assets";
const JS_ROUTE_TYPE = "js";
const ROUTES_PARAMS = new SPARoutesParams("/", `${__dirname}/../client/index.html`);
ROUTES_PARAMS.registerRoute(API_ROUTE_TYPE, "/precipitation", `${__dirname}/meteo_data/precipitation.json`, "application/json");
ROUTES_PARAMS.registerRoute(API_ROUTE_TYPE, "/temperature", `${__dirname}/meteo_data/temperature.json`, "application/json");
ROUTES_PARAMS.registerRoute(ASSET_ROUTE_TYPE, "/main.css", `${__dirname}/../client/main.css`, "text/css");
[
  "app.js",
  "routing.js",
  "api.js",
  "storage.js",
  "transforms.js",
  "utils.js",
  "canvas.js",
  "workers/transform-to-db.js",
  "workers/transform-to-app.js"
].forEach(file => {
  ROUTES_PARAMS.registerRoute(JS_ROUTE_TYPE, `/${file}`, `${__dirname}/../client/js/${file}`, "text/javascript");
});

http
  .createServer((req, res) => {
    if (req.url in ROUTES_PARAMS) {
      doFileResponse(res, ROUTES_PARAMS[req.url]);
      return;
    }

    const routeType = getRouteTypeByURL(req.url);
    if (routeType === API_ROUTE_TYPE || routeType === ASSET_ROUTE_TYPE || routeType === JS_ROUTE_TYPE) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(getErrorStr("Resource not found"), ENCODING);
      return;
    }

    doFileResponse(res, ROUTES_PARAMS["/"]);
  })
  .listen(PORT, () => {
    console.log(`Server start at port ${PORT}`);
  });

async function doFileResponse(res, { filePath, headers }) {
  await getFileData(filePath)
    .then(data => {
      res.writeHead(200, headers);
      res.end(data, ENCODING);
    })
    .catch(err => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(getErrorStr(err), ENCODING);
    });
}

async function getFileData(filePath) {
  const fd = await fs.open(filePath, "r+");
  const data = await fd.readFile({ encoding: ENCODING });
  await fd.close();
  return data;
}

function getErrorStr(msg) {
  return JSON.stringify({ error: msg });
}

function getRouteTypeByURL(url) {
  switch (url.indexOf("/") + 1) {
    case url.indexOf(ASSET_ROUTE_TYPE):
      return ASSET_ROUTE_TYPE;
    case url.indexOf(JS_ROUTE_TYPE):
      return JS_ROUTE_TYPE;
    case url.indexOf(API_ROUTE_TYPE):
      return API_ROUTE_TYPE;
    default:
      break;
  }
  return null;
}
