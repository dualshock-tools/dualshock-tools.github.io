# Docker

This project provides a pre-built Docker image that can be used to run **DualShock Tools** without installing Node.js or building the project manually.

The Docker image contains a production build served through nginx.

## Requirements

- Docker installed on your system

## Run using Docker

Pull the latest image from GitHub Container Registry:

```bash
docker pull ghcr.io/dualshock-tools/dualshock-tools:latest
```

Run the container:

```bash
docker run -d \
  --name dualshock-tools \
  -p 8080:80 \
  --restart unless-stopped \
  ghcr.io/dualshock-tools/dualshock-tools:latest
```

The application will now be available at:

```
http://localhost:8080
```

If running on a remote server, replace `localhost` with the server IP address:

```
http://<server-ip>:8080
```

## Using Docker Compose

Create a `docker-compose.yml` file:

```yaml
services:
  dualshock-tools:
    image: ghcr.io/dualshock-tools/dualshock-tools:latest
    container_name: dualshock-tools
    ports:
      - "8080:80"
    restart: unless-stopped
```

Start the service:

```bash
docker compose up -d
```

## Updating

To update to the latest version:

```bash
docker pull ghcr.io/dualshock-tools/dualshock-tools:latest
```

Stop and remove the old container:

```bash
docker stop dualshock-tools
docker rm dualshock-tools
```

Start it again:

```bash
docker run -d \
  --name dualshock-tools \
  -p 8080:80 \
  --restart unless-stopped \
  ghcr.io/dualshock-tools/dualshock-tools:latest
```

## Available versions

The Docker image is automatically built and published from Git tags.

To use a specific version:

```bash
docker pull ghcr.io/dualshock-tools/dualshock-tools:<version>
```

Example:

```bash
docker pull ghcr.io/dualshock-tools/dualshock-tools:v1.0.0
```

## Building manually

If you prefer to build the image yourself:

```bash
git clone https://github.com/dualshock-tools/dualshock-tools.github.io.git
cd dualshock-tools.github.io

docker build -t dualshock-tools .
```

Run the locally built image:

```bash
docker run -d \
  --name dualshock-tools \
  -p 8080:80 \
  dualshock-tools
```

## Troubleshooting

Check running containers:

```bash
docker ps
```

View logs:

```bash
docker logs -f dualshock-tools
```

Stop the container:

```bash
docker stop dualshock-tools
```

Remove the container:

```bash
docker rm dualshock-tools
```
