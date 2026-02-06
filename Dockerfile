FROM node:20-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY . .

# Environment variables with defaults
ENV PORT=3000 \
    WORLD_FILE_PATH=/terraria/worlds/world.wld \
    REFRESH_INTERVAL_SECONDS=60 \
    TERRARIA_SERVER_HOST= \
    TERRARIA_SERVER_PORT=7777 \
    TERRARIA_REST_PORT=7878 \
    TERRARIA_REST_TOKEN=

# Expose the port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Run the server
CMD ["node", "server.js"]
