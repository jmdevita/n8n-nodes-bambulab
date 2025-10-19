# Contributing to n8n-nodes-bambulab

Thank you for your interest in contributing to this project! We welcome contributions from the community.

## Code of Conduct

This project follows a standard code of conduct:
- Be respectful and inclusive
- Be collaborative
- Focus on what is best for the community
- Show empathy towards other community members

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When creating a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** (workflow JSON, screenshots)
- **Describe the behavior you observed and what you expected**
- **Include details about your environment:**
  - n8n version
  - Node.js version
  - Printer model and firmware version
  - Operating system

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested enhancement**
- **Explain why this enhancement would be useful**
- **List any similar features in other tools if applicable**

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** following the coding standards below
3. **Add or update tests** as needed
4. **Ensure all tests pass** with `npm test`
5. **Lint your code** with `npm run lint`
6. **Update documentation** if needed
7. **Commit your changes** with a clear commit message
8. **Push to your fork** and submit a pull request

#### Pull Request Guidelines

- Keep pull requests focused on a single feature or fix
- Write clear, descriptive commit messages
- Include tests for new functionality
- Update documentation for user-facing changes
- Follow the existing code style

## Development Setup

### Prerequisites

- Node.js 22.0.0 or higher
- npm or yarn
- A Bambu Lab printer with Developer Mode enabled (for testing)

### Setting Up Your Development Environment

1. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/n8n-nodes-bambulab.git
   cd n8n-nodes-bambulab
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Run tests:**
   ```bash
   npm test
   ```

5. **Link for local n8n testing:**
   ```bash
   npm link
   # In your n8n directory:
   npm link n8n-nodes-bambulab
   ```

### Project Structure

```
n8n-nodes-bambulab/
├── credentials/           # Credential types
│   └── BambuLabApi.credentials.ts
├── nodes/                # Node implementations
│   └── BambuLab/
│       ├── BambuLab.node.ts      # Main node
│       ├── BambuLab.node.json    # Metadata
│       ├── bambulab.svg          # Icon
│       └── helpers/              # Helper modules
│           ├── commands.ts       # Command builders
│           ├── FtpHelper.ts      # FTP operations
│           ├── MqttHelper.ts     # MQTT communication
│           ├── types.ts          # TypeScript types
│           └── __tests__/        # Tests
├── package.json
├── tsconfig.json
└── README.md
```

## Coding Standards

### TypeScript

- Use TypeScript for all code
- Define types for all function parameters and return values
- Avoid using `any` type when possible
- Use interfaces for complex object structures

### Naming Conventions

- **Files**: camelCase for TypeScript files (e.g., `MqttHelper.ts`)
- **Classes**: PascalCase (e.g., `BambuLabMqttClient`)
- **Functions/Methods**: camelCase (e.g., `publishCommand`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `CONNECTION_TIMEOUT`)
- **Interfaces/Types**: PascalCase (e.g., `PrinterStatus`)

### Code Style

- Use tabs for indentation
- Single quotes for strings
- Semicolons at the end of statements
- Max line length: 100 characters
- Use meaningful variable and function names

The project uses Prettier and ESLint for code formatting. Run `npm run lintfix` to auto-fix style issues.

### Error Handling

- Use `NodeOperationError` for n8n-related errors
- Provide clear, actionable error messages
- Include context in error messages (e.g., which operation failed)
- Clean up resources (close connections) in `finally` blocks

### Testing

- Write unit tests for all helper functions
- Test error cases, not just happy paths
- Use descriptive test names: `should [expected behavior] when [condition]`
- Aim for high test coverage

## Adding New Features

### Adding a New Operation

1. **Update types** in `helpers/types.ts` if needed
2. **Add command builder** in `helpers/commands.ts`
3. **Add operation to node description** in `BambuLab.node.ts`:
   - Add to the resource's operation options
   - Add any required parameters
   - Implement in the execute method
4. **Write tests** for the new functionality
5. **Update README** with the new operation
6. **Add example workflow** if applicable

### Adding a New Resource

1. **Define types** for the resource in `helpers/types.ts`
2. **Create helper module** if complex logic is needed
3. **Add resource to node description** in `BambuLab.node.ts`
4. **Define operations** for the resource
5. **Implement operations** in execute method
6. **Write comprehensive tests**
7. **Update documentation**

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Writing Tests

Tests are located in `__tests__` directories next to the code they test. Use Jest for testing.

Example test structure:

```typescript
describe('FeatureName', () => {
  beforeEach(() => {
    // Setup
  });

  it('should do something when condition is met', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = functionToTest(input);

    // Assert
    expect(result).toBe('expected');
  });
});
```

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for public methods
- Include code examples for complex features
- Keep examples up to date

## Release Process

(Maintainers only)

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Commit changes: `git commit -am "Release vX.Y.Z"`
4. Create tag: `git tag vX.Y.Z`
5. Push: `git push && git push --tags`
6. GitHub Actions will publish to npm

## Questions?

If you have questions about contributing:
- Open an issue with the `question` label
- Check existing issues for similar questions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to n8n-nodes-bambulab! 🎉
