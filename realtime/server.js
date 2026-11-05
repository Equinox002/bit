const path = require("node:path");
const { createRelay } = require("./relay");

try {
    process.loadEnvFile(path.join(__dirname, "..", ".env"));
} catch {
    // In production the variables may come from the environment instead of a file.
}

const relay = createRelay({
    secret: process.env.REALTIME_SECRET,
    appUrl: process.env.REALTIME_APP_URL || process.env.APP_URL,
    corsOrigin: process.env.REALTIME_ALLOWED_ORIGINS
        ? process.env.REALTIME_ALLOWED_ORIGINS.split(",")
        : "*",
});

const port = Number(process.env.REALTIME_PORT || 6001);

relay.listen(port).then((actualPort) => {
    console.log(`Realtime relay listening on port ${actualPort}`);
});
