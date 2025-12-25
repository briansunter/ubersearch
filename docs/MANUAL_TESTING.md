# Manual Testing Instructions for SearXNG Integration

## Overview

This document provides step-by-step instructions for manually testing the SearXNG integration with auto-start functionality.

## Prerequisites

```bash
# Ensure Docker Desktop is installed and running
docker version
# Should show Docker version info

# Ensure you're in the ubersearch directory
cd /Users/briansunter/.dotfiles/bun-scripts/ubersearch

# Ensure dependencies are installed
bun install
```

## Test 1: Compilation Check

**Verify all code compiles without errors:**

```bash
# Test SearchxngProvider compilation
bun build --target=bun ./src/providers/searchxng.ts --outfile /tmp/searchxng-test.js
# Expected: Bundled 4 modules in Xms

# Test bootstrap providers compilation
bun build --target=bun ./src/bootstrap/providers.ts --outfile /dev/null
# Expected: Bundled 9 modules in Xms

# Test CLI compilation
bun build --target=bun ./src/cli.ts --outfile /dev/null
# Expected: Bundled 14 modules in Xms

# Run TypeScript type checking
bun run tsc --noEmit
# Expected: No errors
```

**Expected Result**: All commands complete successfully with no errors.

## Test 2: Configuration Validation

**Verify configuration is valid:**

```bash
# Check that SearXNG is highest priority in config
cat ubersearch.config.json | grep -A 2 '"defaultEngineOrder"'
# Expected output should show: "searxng", "tavily", "brave", "linkup"

# Check SearXNG configuration
cat ubersearch.config.json | grep -A 15 '"id": "searxng"'
# Should show:
# - enabled: true
# - autoStart: true
# - autoStop: true
# - composeFile: "./providers/searxng/docker-compose.yml"
# - healthEndpoint: "http://localhost:8888/healthz"
```

**Expected Result**: SearXNG is first in defaultEngineOrder and has all required configuration fields.

## Test 3: Docker Compose Validation

**Verify Docker is available and compose file is valid:**

```bash
# Check if Docker is running
docker version
# Expected: Shows Docker version info

# Check compose file is present
ls -la providers/searxng/docker-compose.yml
# Expected: File exists

# Validate compose file syntax
cd providers/searxng
docker compose config
# Expected: Shows parsed compose configuration without errors

docker compose ps
# Expected: No containers running yet (empty)
```

**Expected Result**: Docker is running and compose file is valid.

## Test 4: Auto-Start First Search

**Test that SearXNG container automatically starts on first search:**

```bash
# From ubersearch directory
cd /Users/briansunter/.dotfiles/bun-scripts/ubersearch

# Create environment file
echo "SEARXNG_API_KEY=test-key-12345" > providers/searxng/.env

# Run first search (SearXNG is highest priority, so it will be tried first)
bun run src/cli.ts "rust programming" --json 2>&1 | tee test1-output.json

# Expected output should show:
# 1. "[searxng] Container is not running." or "[searxng] Starting Docker container..."
# 2. "[searxng] Container started successfully."
# 3. "[searxng] Waiting for health check..."
# 4. "[searxng] Health check passed."
# 5. JSON output with results from SearXNG
```

**Expected Result**: Container starts automatically and search completes successfully with JSON output.

Check the output:

```bash
# Verify JSON is valid
cat test1-output.json | python3 -m json.tool
# Should show valid JSON with query, items, enginesTried, credits

cat test1-output.json | grep -A 5 '"enginesTried"'
# Should show searxng as the first engine tried
```

**First search timing**: Should take 35-45 seconds (includes container startup).

## Test 5: Subsequent Search (Container Already Running)

**Test that subsequent searches are fast:**

```bash
# Run second search (container is now running)
bun run src/cli.ts "rust error handling" --json 2>&1 | tee test2-output.json

# Expected output should show:
# 1. "[searxng] Container is already running.
# 2. Much faster execution (0.5-1 second)
```

**Expected Result**: Search completes quickly since container is already running.

Verify speed:

```bash
time bun run src/cli.ts "test" --engines searxng --limit 2
# Should show completion time < 2 seconds
```

## Test 6: Credit Tracking

**Verify that SearXNG credits are tracked correctly:**

```bash
# Check credit status before
bun run src/cli.ts credits 2>&1 | grep -A 5 "searxng"
# Should show: Used: 0 / 10000 (0%)

# Run a search
bun run src/cli.ts "test credits" --engines searxng 2>&1

# Check credit status after
bun run src/cli.ts credits 2>&1 | grep -A 5 "searxng"
# Should show: Used: 1 / 10000 (0.1%)

# Run another search
bun run src/cli.ts "another test" --engines searxng 2>&1

# Check credit status again
bun run src/cli.ts credits 2>&1 | grep -A 5 "searxng"
# Should show: Used: 2 / 10000 (0.2%)
```

**Expected Result**: Credits increment correctly and SearXNG shows 0 cost per search.

## Test 7: Multiple Providers with Priority

**Test that SearXNG is highest priority by default:**

```bash
# Search without specifying engines (uses default order)
bun run src/cli.ts "javascript async features" 2>&1 | tee test3-output.txt

# Check which engine was tried first
cat test3-output.txt | grep "Engine Status" -A 10
# Should show searxng first in the list

# Verify searxng appears in results
cat test3-output.txt | grep "============================================================" -A 50
# Should show searxng results first, then others
```

**Expected Result**: SearXNG is tried first and appears first in results.

## Test 8: Engine Override (CLI Override)

**Test that CLI --engines flag overrides config:**

```bash
# Request only Tavily (skip SearXNG)
bun run src/cli.ts "python decorators" --engines tavily --limit 2

# Expected: Only Tavily results, Searxng not mentioned
# Check: grep -i searxng should return nothing
```

**Expected Result**: Only Tavily provider is used.

## Test 9: First-Success Strategy

**Test first-success strategy with SearXNG as highest priority:**

```bash
# Create a situation where SearXNG is slow or unavailable
# (Optional: temporarily rename container or cause error)

# Search with first-success strategy
bun run src/cli.ts "parallel programming" --strategy first-success 2>&1 | tee test4-output.json

# Should show:
# 1. searxng attempt
# 2. If searxng fails, tavily attempt (and stop)
# 3. Only results from first successful provider
```

**Expected Result**: Search stops after first successful provider.

Verify with:

```bash
cat test4-output.json | grep -A 10 '"enginesTried"'
# Should only show one or two providers, not all
```

## Test 10: Auto-Stop on Process Exit

**Test that container stops when process exits gracefully:**

```bash
# Start a search process in background
bun run src/cli.ts "background test" --engines searxng &
SEARCH_PID=$!

# Wait a moment
sleep 5

# Check container is running
docker compose -f providers/searxng/docker-compose.yml ps
# Should show searxng container as "Up"

# Kill the process
kill $SEARCH_PID

# Give it time to cleanup
sleep 3

# Check container is stopped
docker compose -f providers/searxng/docker-compose.yml ps
# Should show no containers or container as "Exited"
```

**Expected Result**: Container is stopped when the CLI process exits.

## Test 11: Configuration Validation (Zod)

**Test that configuration is validated:**

```bash
# Test with invalid config (missing required field)
cat > test-invalid-config.json << 'EOF'
{
  "defaultEngineOrder": ["searxng"],
  "engines": [
    {
      "id": "searxng",
      "type": "searchxng",
      "enabled": true,
      "apiKeyEnv": "SEARXNG_API_KEY"
      // Missing endpoint and other required fields
    }
  ]
}
EOF

# Try to use invalid config
MULTI_SEARCH_CONFIG=test-invalid-config.json bun run src/cli.ts "test" 2>&1
# Expected: Should show validation error about missing fields
```

**Expected Result**: Clear error message about invalid configuration.

Test valid config:

```bash
# Use valid config
bun run src/cli.ts "valid config test" --config ubersearch.config.json
# Should work without errors
```

## Test 12: JSON Output Format

**Test that JSON output matches expected schema:**

```bash
bun run src/cli.ts "json format test" --engines searxng --json > test5-output.json

# Validate JSON structure
cat test5-output.json | python3 -m json.tool > /dev/null
# Should succeed (no errors)

# Verify required fields
cat test5-output.json | jq '.query' > /dev/null
cat test5-output.json | jq '.items' > /dev/null
cat test5-output.json | jq '.enginesTried' > /dev/null
cat test5-output.json | jq '.credits' > /dev/null
# All should succeed

# Check searxng is sourceEngine for items
cat test5-output.json | jq '.items[].sourceEngine' | grep -c "searxng"
# Should equal number of items
```

**Expected Result**: Valid JSON with all required fields and correct source engine.

## Test 13: Error Handling

**Test graceful degradation when SearXNG fails:**

```bash
# Stop SearXNG container
cd providers/searxng
docker compose stop searxng

# Try search (with autoStart disabled temporarily)
# Edit config: "autoStart": false

bun run src/cli.ts "should fail" --engines searxng,tavily 2>&1 | grep -A 5 "Engine Status"
# Should show searxng failed, tavily succeeded

# Check environment continues working
# (Re-enable autoStart in config)

bun run src/cli.ts "tavily works" --engines tavily
# Should succeed with tavily
```

**Expected Result**: System continues working with remaining providers when one fails.

## Test 14: Real Search Query

**Test with a real, complex query:**

```bash
# Test with multi-word technical query
bun run src/cli.ts "advanced typescript generic types conditional types" --json > test6-output.json

# Verify results are relevant
cat test6-output.json | jq '.items[0].title' | grep -i "typescript"
# Should contain TypeScript

cat test6-output.json | jq '.items[0].snippet' | grep -i "generic\|conditional\|type"
# Should contain relevant technical terms

# Check we got results (at least 1)
cat test6-output.json | jq '.items | length'
# Should be > 0
```

**Expected Result**: Relevant, high-quality results for technical queries.

## Test 15: Priority System

**Test that results are prioritized correctly:**

```bash
# Search with multiple engines
bun run src/cli.ts "standard library functions" --engines searxng,tavily --limit 3 --json > test7-output.json

# Check if resultPriority is applied
cat test7-output.json | jq -r '.items[] | "\(.sourceEngine): \(.title)"' | head -10
# Should show SearXNG results first (higher priority score)

# Verify each result has score field
cat test7-output.json | jq '.items[].score' | wc -l
# Should equal number of items
```

**Expected Result**: Results respect priority configuration.

## Test Cleanup

**Clean up after testing:**

```bash
# Stop all containers
cd providers/searxng
docker compose down -v

# Remove test environment file
rm -f providers/searxng/.env

# Remove test output files
rm -f test*.json test*.txt

# Clean up any dangling images
docker system prune -f
```

## Summary Checklist

- [ ] Code compiles without errors
- [ ] Configuration is valid (SearXNG first)
- [ ] Docker is available and compose file valid
- [ ] Auto-start works on first search (35-45s total)
- [ ] Second search is fast (< 2s)
- [ ] Credits track correctly (0 cost for SearXNG)
- [ ] SearXNG is highest priority by default
- [ ] CLI --engines override works
- [ ] First-success strategy stops after first success
- [ ] Auto-stop works on exit
- [ ] Configuration validation catches errors
- [ ] JSON output is valid and complete
- [ ] Error handling is graceful
- [ ] Real queries return relevant results
- [ ] Priority system applies correctly

## Expected Total Test Time

- Compilation: ~1 minute
- First search (auto-start): ~45 seconds
- Subsequent tests: ~10 minutes
- Total: ~12-15 minutes

## Notes

- Docker must be running for all tests
- First search will be slow (container startup)
- SearXNG needs ~30-60 seconds to initialize
- Some tests may need to be run in sequence (e.g., auto-start then fast)
- Some tests modify config temporarily - remember to restore
