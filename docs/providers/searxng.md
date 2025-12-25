# SearXNG Integration

[SearXNG](https://github.com/searxng/searxng) is a free internet metasearch engine which aggregates results from various search services and databases. Users are neither tracked nor profiled.

## Quick Start

1. **Start SearXNG with Docker**

```bash
cd providers/searxng
docker compose up -d
```

2. **Wait for container to be healthy** (about 30-60 seconds)

```bash
docker compose ps
```

3. **Verify SearXNG is running**

```bash
curl http://localhost:8888/healthz
# Should return: OK
```

4. **Test the search API**

```bash
curl -X GET "http://localhost:8888/search?q=test&format=json"
```

## Multi-Search Configuration

The SearXNG provider is already configured in `ubersearch.config.json`.

Default settings:

- **Endpoint**: `http://localhost:8888/search`
- **Port**: 8888 (mapped from container's 8080)
- **API Key**: Uses `SEARXNG_API_KEY` environment variable
- **Rate Limit**: 10,000 queries per month (free, self-hosted)
- **Cost**: 0 credits per search

## Environment Variables

```bash
export SEARXNG_API_KEY="your-secret-key"
```

The API key is sent as a Bearer token in the Authorization header.

## Customizing SearXNG

### Configuration File

Edit `providers/searxng/config/settings.yml` to customize. A sample variant is kept at `docs/providers/searxng-settings.sample.yml` (not used by Docker).

- Enable/disable search engines
- Set default search language
- Configure SafeSearch
- Set time range filters
- Add custom engines

Example:

```yaml
# config/settings.yml
server:
  secret_key: "your-secret-key"
  limiter: false # Disable rate limiting for local use
  image_proxy: true

ui:
  static_use_hash: true

search:
  safe_search: 0
  autocomplete: ""
  default_lang: "auto"
```

### Enable Additional Search Engines

SearXNG supports 100+ search engines out of the box. To enable:

1. Edit `config/settings.yml`
2. Find the `engines:` section
3. Uncomment or add engines you want

Example:

```yaml
engines:
  - name: google
    engine: google
    disabled: false

  - name: duckduckgo
    engine: duckduckgo
    disabled: false

  - name: bing
    engine: bing
    disabled: false
```

See the [official SearXNG documentation](https://docs.searxng.org/) for a full list of supported engines.

## Using with Multi-Search

### Start SearXNG

```bash
cd providers/searxng
docker compose up -d
```

### Search using SearXNG

```bash
# Use only SearXNG
bun run src/cli.ts "test query" --engines searxng

# Use SearXNG with other providers
bun run src/cli.ts "test query" --engines searxng,tavily

# Get JSON output
bun run src/cli.ts "test query" --engines searxng --json
```

### Check credit status

```bash
bun run src/cli.ts credits
```

Note: SearXNG uses 0 credits since it's self-hosted.

## Troubleshooting

### Container won't start

```bash
# Check logs
docker compose logs -f

# Ensure port 8888 is available
lsof -i :8888

# Remove old containers and volumes
docker compose down
docker compose up -d
```

### Search returns no results

1. Verify SearXNG is running:

   ```bash
   curl http://localhost:8888/healthz
   ```

2. Check if search engines are configured:

   ```bash
   curl "http://localhost:8888/search?q=test&format=json"
   ```

3. Review logs for errors:

   ```bash
   docker compose logs -f searxng
   ```

4. Check configuration syntax:

   ```bash
   docker compose exec searxng cat /etc/searxng/settings.yml
   ```

### High memory usage

SearXNG can use significant memory if many engines are enabled. To reduce:

- Disable unused engines in `config/settings.yml`
- Set `dlimit: 1` in engine configs
- Reduce `max_page: 1` in settings

### Rate limiting

If you're getting rate limited by search engines:

- Enable fewer engines
- Reduce `max_page` setting
- Enable Redis caching (already included in docker-compose.yml)
- Consider using a proxy for high-volume searches

## Performance Tuning

### Enable Redis Caching

Already included in docker-compose.yml. Redis caches:

- Search results (for a few minutes)
- Autocomplete suggestions
- Engine responses

### Adjust Worker Count

Edit docker-compose.yml:

```yaml
environment:
  - SEARXNG_BIND_ADDRESS=0.0.0.0:8080
  - SEARXNG_SERVER_WORKER_CLASS=uvicorn.workers.UvicornWorker
  - SEARXNG_SERVER_WORKERS=4 # Increase for more concurrency
```

### Use Persistent Redis

Current setup uses in-memory Redis. For persistent cache:

```yaml
redis:
  volumes:
    - redis-data:/data
  command: redis-server --appendonly yes
```

## Security Considerations

### Change Default Secret Key

Generate a new secret key:

```bash
openssl rand -hex 32
```

Set it in docker-compose.yml:

```yaml
environment:
  - SEARXNG_SECRET_KEY=your-generated-key
```

### Restrict Network Access

By default, SearXNG listens on all interfaces. To restrict:

```yaml
ports:
  - "127.0.0.1:8888:8080" # Only accessible from localhost
```

### Enable Authentication

Add basic auth via Caddy:

1. Edit docker-compose.yml and add Caddy service
2. Create Caddyfile with basicauth directive

## Comparison with Cloud Providers

| Feature            | SearXNG (Local)           | Tavily         | Brave          | Linkup         |
| ------------------ | ------------------------- | -------------- | -------------- | -------------- |
| **Cost**           | Free (self-hosted)        | Paid API       | Paid API       | Paid API       |
| **Privacy**        | ✅ No tracking            | ✅ No tracking | ✅ No tracking | ✅ No tracking |
| **Speed**          | Fast (local)              | ~1s            | ~1s            | ~1.5s          |
| **Setup**          | Requires Docker           | API key only   | API key only   | API key only   |
| **Maintenance**    | Yes (self-hosted)         | No             | No             | No             |
| **Result Quality** | Good (depends on engines) | Excellent      | Good           | Excellent      |
| **Engine Count**   | 100+ (configurable)       | Multiple       | Single         | Multiple       |

## Updating SearXNG

```bash
cd providers/searxng
docker compose pull
docker compose up -d
```

This pulls the latest image and restarts the container.

## Removing SearXNG

```bash
cd providers/searxng
docker compose down -v  # Removes containers and volumes
```

Then remove the SearXNG entry from `ubersearch.config.json`.

## Additional Resources

- [SearXNG Documentation](https://docs.searxng.org/)
- [SearXNG GitHub](https://github.com/searxng/searxng)
- [List of Supported Engines](https://docs.searxng.org/admin/engines/configured_engines.html)
- [Engine Configuration Reference](https://docs.searxng.org/admin/engines/engine.html)
- [Multi-Search Documentation](../../README.md)
