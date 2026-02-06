const express = require('express');
const fs = require('fs');
const path = require('path');
const net = require('net');

const app = express();

// Configuration from environment variables
const PORT = process.env.PORT || 3000;
const WORLD_FILE_PATH = process.env.WORLD_FILE_PATH || '/terraria/worlds/world.wld';
const REFRESH_INTERVAL_SECONDS = parseInt(process.env.REFRESH_INTERVAL_SECONDS || '60', 10);

// Terraria server connection for player stats (optional)
const TERRARIA_SERVER_HOST = process.env.TERRARIA_SERVER_HOST || '';
const TERRARIA_SERVER_PORT = parseInt(process.env.TERRARIA_SERVER_PORT || '7777', 10);
const TERRARIA_REST_PORT = parseInt(process.env.TERRARIA_REST_PORT || '7878', 10);
const TERRARIA_REST_TOKEN = process.env.TERRARIA_REST_TOKEN || '';

// Track world file modification time for caching
let lastModTime = 0;
let cachedWorldBuffer = null;

// Serve static files
app.use(express.static(__dirname, {
  index: false,
  setHeaders: (res, filePath) => {
    // Set appropriate cache headers for static assets
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// Serve the modified index.html as the root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoint to get configuration
app.get('/api/config', (req, res) => {
  res.json({
    refreshIntervalSeconds: REFRESH_INTERVAL_SECONDS,
    worldFileName: path.basename(WORLD_FILE_PATH),
    hasPlayerStatsEnabled: !!(TERRARIA_REST_TOKEN && TERRARIA_SERVER_HOST)
  });
});

// API endpoint to serve the world file
app.get('/api/world', (req, res) => {
  try {
    if (!fs.existsSync(WORLD_FILE_PATH)) {
      return res.status(404).json({
        error: 'World file not found',
        path: WORLD_FILE_PATH
      });
    }

    const stats = fs.statSync(WORLD_FILE_PATH);
    const modTime = stats.mtimeMs;

    // Check if client has a cached version
    const ifModifiedSince = req.headers['if-modified-since'];
    if (ifModifiedSince) {
      const clientTime = new Date(ifModifiedSince).getTime();
      if (modTime <= clientTime) {
        return res.status(304).end();
      }
    }

    // Read and cache the world file if it changed
    if (modTime !== lastModTime || !cachedWorldBuffer) {
      cachedWorldBuffer = fs.readFileSync(WORLD_FILE_PATH);
      lastModTime = modTime;
    }

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${path.basename(WORLD_FILE_PATH)}"`,
      'Last-Modified': new Date(modTime).toUTCString(),
      'Cache-Control': 'no-cache'
    });

    res.send(cachedWorldBuffer);
  } catch (error) {
    console.error('Error serving world file:', error);
    res.status(500).json({ error: 'Failed to read world file' });
  }
});

// API endpoint to check world file status (for efficient polling)
app.get('/api/world/status', (req, res) => {
  try {
    if (!fs.existsSync(WORLD_FILE_PATH)) {
      return res.status(404).json({
        error: 'World file not found',
        exists: false
      });
    }

    const stats = fs.statSync(WORLD_FILE_PATH);
    res.json({
      exists: true,
      fileName: path.basename(WORLD_FILE_PATH),
      size: stats.size,
      lastModified: stats.mtime.toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check world file status' });
  }
});

// API endpoint to get player stats from Terraria server
app.get('/api/players', async (req, res) => {
  // If REST API is configured, use it
  if (TERRARIA_REST_TOKEN && TERRARIA_SERVER_HOST) {
    try {
      const response = await fetch(
        `http://${TERRARIA_SERVER_HOST}:${TERRARIA_REST_PORT}/v2/players/list?token=${TERRARIA_REST_TOKEN}`
      );

      if (!response.ok) {
        throw new Error(`REST API returned ${response.status}`);
      }

      const data = await response.json();
      return res.json({
        online: data.players?.length || 0,
        players: data.players || [],
        maxPlayers: data.maxplayers || 8
      });
    } catch (error) {
      console.error('Error fetching player stats from REST API:', error.message);
      // Fall through to return offline status
    }
  }

  // If no REST API or it failed, try basic TCP check
  if (TERRARIA_SERVER_HOST) {
    const isOnline = await checkServerOnline(TERRARIA_SERVER_HOST, TERRARIA_SERVER_PORT);
    return res.json({
      online: isOnline ? -1 : 0, // -1 indicates server is up but player count unknown
      players: [],
      maxPlayers: 8,
      serverOnline: isOnline
    });
  }

  // No server configured
  res.json({
    online: 0,
    players: [],
    maxPlayers: 0,
    serverOnline: false,
    configured: false
  });
});

// Helper function to check if Terraria server is online via TCP
function checkServerOnline(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      resolve(false);
    });

    socket.connect(port, host);
  });
}

// Health check endpoint for Kubernetes
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Ready check endpoint for Kubernetes
app.get('/ready', (req, res) => {
  const worldExists = fs.existsSync(WORLD_FILE_PATH);
  if (worldExists) {
    res.json({ status: 'ready', worldFile: true });
  } else {
    res.status(503).json({ status: 'not ready', worldFile: false });
  }
});

app.listen(PORT, () => {
  console.log(`TerraMap server running on port ${PORT}`);
  console.log(`World file path: ${WORLD_FILE_PATH}`);
  console.log(`Refresh interval: ${REFRESH_INTERVAL_SECONDS} seconds`);

  if (TERRARIA_REST_TOKEN && TERRARIA_SERVER_HOST) {
    console.log(`Terraria REST API: http://${TERRARIA_SERVER_HOST}:${TERRARIA_REST_PORT}`);
  } else if (TERRARIA_SERVER_HOST) {
    console.log(`Terraria server: ${TERRARIA_SERVER_HOST}:${TERRARIA_SERVER_PORT} (no REST API token)`);
  } else {
    console.log('Terraria server stats: disabled');
  }
});
