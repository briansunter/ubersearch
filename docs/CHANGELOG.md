# Changelog

## [Unreleased] - Full SOLID Refactoring

### Added

- Strategy Pattern: ISearchStrategy, AllProvidersStrategy, FirstSuccessStrategy
- CreditStateProvider abstraction with FileCreditStateProvider implementation
- Dependency Injection Container with singleton/transient support
- ProviderFactory for auto-instantiating search providers
- ILifecycleProvider interface for Docker-based providers
- DockerLifecycleManager for container lifecycle management
- Bootstrap module for centralized dependency wiring
- Comprehensive test suite with >90% coverage
- New CLI commands: `health` for provider health checks

### Changed

- AiSearchOrchestrator refactored to use StrategyFactory (64% smaller)
- CreditManager now injects CreditStateProvider (no file I/O in business logic)
- LinkupProvider and SearchxngProvider refactored to use composition (LSP compliance)
- CLI refactored to use DI container instead of manual instantiation
- All providers now instantiated via ProviderFactory

### Removed

- Removed priority/weighting configuration (unused)
- Removed DockerProvider base class (replaced with composition)
- Removed 145 lines of hardcoded strategy logic from orchestrator
- Removed manual provider registration loop from CLI

### Technical Details

- **SOLID Compliance**: All 5 principles now properly implemented
- **Test Coverage**: >90% across all new abstractions
- **Architecture**: Pure composition, no inheritance violations
- **Dependency Injection**: All services injected via constructor
- **Factories**: StrategyFactory and ProviderFactory for OCP compliance
