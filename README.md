# Terraria Live Server Map

This is a fork of https://terramap.github.io that is designed to be a (mostly) live view of your running Terraria server.

Instead of having users upload their own world files for display, it loads a world file from the local filesystem and displays that, refreshing periodically.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `WORLD_FILE_PATH` | `/terraria/worlds/world.wld` | Path to mounted world file |
| `REFRESH_INTERVAL_SECONDS` | `60` | How often to check for world updates |
| `TERRARIA_SERVER_HOST` | (empty) | Terraria server hostname for player stats |
| `TERRARIA_SERVER_PORT` | `7777` | Terraria game port |
| `TERRARIA_REST_PORT` | `7878` | TShock REST API port |
| `TERRARIA_REST_TOKEN` | (empty) | TShock REST API token |

## Kubernetes Usage Example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: terramap
spec:
  template:
    spec:
      containers:
      - name: terramap
        image: your-registry/terramap:latest
        env:
        - name: WORLD_FILE_PATH
          value: /terraria/worlds/MyWorld.wld
        - name: REFRESH_INTERVAL_SECONDS
          value: "30"
        - name: TERRARIA_SERVER_HOST
          value: terraria-server.default.svc.cluster.local
        - name: TERRARIA_REST_TOKEN
          value: your-tshock-token
        volumeMounts:
        - name: world-data
          mountPath: /terraria/worlds
          readOnly: true
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
      volumes:
      - name: world-data
        persistentVolumeClaim:
          claimName: terraria-worlds
```

## Building

`docker build -t terramap:latest .`

The player stats feature works with TShock's REST API. If you don't have TShock or don't set the token, it will still show basic server online/offline status via TCP check.
