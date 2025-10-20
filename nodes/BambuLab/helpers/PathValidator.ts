import path from 'path';

/**
 * Path validation and sanitization to prevent directory traversal attacks
 *
 * Implements security controls for user-provided file paths to prevent:
 * - Directory traversal (../, ..\)
 * - Access to system directories (/etc, /sys, etc.)
 * - Null byte injection
 * - Path confusion attacks
 *
 * @example
 * ```typescript
 * // Safe usage
 * const safe = PathValidator.sanitizePath('/sdcard/model.3mf');
 * // Returns: '/sdcard/model.3mf'
 *
 * // Blocked attack
 * PathValidator.sanitizePath('../../../etc/passwd');
 * // Throws: Error('Path traversal detected...')
 * ```
 */
export class PathValidator {
	/**
	 * System directories that should never be accessible
	 * Prevents access to sensitive system files
	 */
	private static readonly BLOCKED_PATHS = [
		'/etc',
		'/sys',
		'/proc',
		'/root',
		'/boot',
		'/dev',
		'/var',
		'/usr',
		'/bin',
		'/sbin',
		'/lib',
		'/tmp',
		'\\windows',
		'\\system32',
		'\\program files',
	];

	/**
	 * Maximum allowed path length to prevent buffer issues
	 */
	private static readonly MAX_PATH_LENGTH = 4096;

	/**
	 * Maximum allowed filename length
	 */
	private static readonly MAX_FILENAME_LENGTH = 255;

	/**
	 * Sanitize and validate a file path to prevent traversal attacks
	 *
	 * Security checks performed:
	 * 1. Null byte removal (path poisoning)
	 * 2. Path normalization (resolves .. and .)
	 * 3. Traversal detection (.., encoded variants)
	 * 4. System directory blocking
	 * 5. Path length validation
	 * 6. Relative path detection
	 *
	 * @param userPath User-provided file path
	 * @returns Sanitized absolute path
	 * @throws Error if path is invalid or contains malicious patterns
	 *
	 * @example
	 * ```typescript
	 * // Valid paths
	 * PathValidator.sanitizePath('/sdcard/model.3mf')  // OK
	 * PathValidator.sanitizePath('model.3mf')          // OK (filename only)
	 *
	 * // Invalid paths (throws)
	 * PathValidator.sanitizePath('../../../etc/passwd')  // Traversal
	 * PathValidator.sanitizePath('/etc/shadow')          // System directory
	 * PathValidator.sanitizePath('test\x00.txt')         // Null byte
	 * ```
	 */
	static sanitizePath(userPath: string): string {
		// Input validation
		if (!userPath || typeof userPath !== 'string') {
			throw new Error('Path must be a non-empty string');
		}

		// Length check (prevent DoS via extremely long paths)
		if (userPath.length > this.MAX_PATH_LENGTH) {
			throw new Error(
				`Path too long. Maximum ${this.MAX_PATH_LENGTH} characters allowed. ` +
					`Provided: ${userPath.length} characters.`,
			);
		}

// Remove null bytes (path poisoning attack)
		let sanitized = userPath.replace(/\0/g, '');

		// Decode URL encoding to prevent bypasses (%2e%2e%2f => ../)
		// Decode twice to catch double-encoded attacks (%252e => %2e => .)
		try {
			sanitized = decodeURIComponent(sanitized);
			sanitized = decodeURIComponent(sanitized);
		} catch (error) {
			// Invalid URL encoding - proceed with current value
		}

		// Check for relative path indicators before normalization
		// Only block paths that start with ./ or ../, or have directory/../ patterns
		// Allow absolute paths like /sdcard/./file (they normalize correctly)
		if (sanitized.startsWith('./') || sanitized.startsWith('../') || /\/\.\.\//.test(sanitized)) {
			throw new Error(
				'Path traversal detected. ' +
					'Use absolute paths starting with / (e.g., /sdcard/file.3mf) or filename only.',
			);
		}

		// Normalize path (resolves .. and . components)
		// Use posix for consistent behavior across platforms
		let normalized = path.posix.normalize(sanitized);

		// Strip trailing slashes (except for root /)
		if (normalized !== '/') {
			normalized = normalized.replace(/\/+$/, '');
		}

		// Check for traversal attempts (after normalization)
		if (normalized.includes('..')) {
			throw new Error(
				'Path traversal detected. Paths containing ".." are not allowed for security reasons. ' +
					'Use absolute paths starting with / or filename only.',
			);
		}

		// Check for Windows-style traversal
		if (normalized.includes('\\..') || /\.\.[\/\\]/.test(userPath)) {
			throw new Error(
				'Path traversal detected (Windows-style). Paths containing "..\\" are not allowed.',
			);
		}

		// Block access to system directories
		// Only check absolute paths (Unix: starts with /, Windows: contains \)
		// Relative paths like "model/file.3mf" are allowed (safe subdirectories)
		if (normalized.startsWith('/') || userPath.includes('\\')) {
			const lowerPath = normalized.toLowerCase();
			const lowerUserPath = userPath.toLowerCase();
			for (const blockedPath of this.BLOCKED_PATHS) {
				const lowerBlockedPath = blockedPath.toLowerCase();
				if (lowerPath.startsWith(lowerBlockedPath) || lowerUserPath.startsWith(lowerBlockedPath)) {
					throw new Error(
						`Access to system directory "${blockedPath}" is not allowed for security reasons. ` +
							`Only printer storage directories (/sdcard, /cache) are accessible.`,
					);
				}
			}
		}

		// Additional check: ensure no path components are hidden files (starting with .)
		// Exception: Allow .3mf extension
		const components = normalized.split('/').filter((c) => c !== '');
		for (const component of components) {
			if (component.startsWith('.') && !component.match(/\.(3mf|gcode)$/i)) {
				throw new Error(
					`Hidden files/directories (starting with ".") are not allowed: "${component}"`,
				);
			}
		}

		return normalized;
	}

	/**
	 * Validate that a path stays within allowed base directory
	 *
	 * Useful for ensuring files don't escape a designated upload directory.
	 *
	 * @param basePath Base directory path (must be absolute)
	 * @param userPath User-provided path (relative or absolute)
	 * @returns Resolved path (guaranteed to be within basePath)
	 * @throws Error if path escapes base directory
	 *
	 * @example
	 * ```typescript
	 * PathValidator.validateWithinBounds('/sdcard', 'model.3mf')
	 * // Returns: '/sdcard/model.3mf'
	 *
	 * PathValidator.validateWithinBounds('/sdcard', '../etc/passwd')
	 * // Throws: Error('Path escapes allowed directory')
	 * ```
	 */
	static validateWithinBounds(basePath: string, userPath: string): string {
		// First sanitize the user path
		const sanitized = this.sanitizePath(userPath);

		// Resolve both paths to absolute
		const resolvedBase = path.resolve(basePath);
		const resolvedUser = path.resolve(basePath, sanitized);

		// Check if resolved path is within base
		if (!resolvedUser.startsWith(resolvedBase)) {
			throw new Error(
				`Path "${userPath}" escapes allowed directory "${basePath}". ` +
					`Resolved to: "${resolvedUser}"`,
			);
		}

		return resolvedUser;
	}

	/**
	 * Sanitize filename (no path separators allowed)
	 *
	 * Ensures the input is a filename only, not a path.
	 * Useful for validating file upload names.
	 *
	 * @param filename User-provided filename
	 * @returns Sanitized filename
	 * @throws Error if filename contains path separators or is invalid
	 *
	 * @example
	 * ```typescript
	 * PathValidator.sanitizeFilename('model.3mf')  // OK
	 * PathValidator.sanitizeFilename('dir/file.3mf')  // Throws (contains /)
	 * PathValidator.sanitizeFilename('..')  // Throws (special filename)
	 * ```
	 */
	static sanitizeFilename(filename: string): string {
		// Input validation
		if (!filename || typeof filename !== 'string') {
			throw new Error('Filename must be a non-empty string');
		}

		// Length check
		if (filename.length > this.MAX_FILENAME_LENGTH) {
			throw new Error(
				`Filename too long. Maximum ${this.MAX_FILENAME_LENGTH} characters allowed. ` +
					`Provided: ${filename.length} characters.`,
			);
		}

		// Remove null bytes
		const sanitized = filename.replace(/\0/g, '');

		// Check for path separators (both Unix and Windows)
		if (sanitized.includes('/') || sanitized.includes('\\')) {
			throw new Error(
				'Path separators (/ or \\) are not allowed in filenames. ' +
					'Provide filename only, not a path.',
			);
		}

		// Block special filenames
		if (['.', '..', ''].includes(sanitized)) {
			throw new Error(`Invalid filename: "${sanitized}"`);
		}

		// Block filenames starting with . (hidden files)
		// No exceptions for filenames
		if (sanitized.startsWith('.') ) {
			throw new Error('Hidden filenames (starting with ".") are not allowed');
		}

		// Block control characters and special chars
		if (/[\x00-\x1f\x7f<>:"|?*]/.test(sanitized)) {
			throw new Error(
				'Filename contains invalid characters. ' +
					'Only alphanumeric, dash, underscore, and dot are allowed.',
			);
		}

		return sanitized;
	}

	/**
	 * Validate and sanitize a complete file path (combines sanitization methods)
	 *
	 * For paths with directories: sanitizes path
	 * For filenames only: sanitizes as filename
	 *
	 * @param userPath User-provided path or filename
	 * @returns Sanitized path
	 * @throws Error if path is invalid
	 */
	static validate(userPath: string): string {
		// Determine if it's a path or filename
		if (userPath.includes('/') || userPath.includes('\\')) {
			// It's a path
			return this.sanitizePath(userPath);
		} else {
			// It's a filename only
			return this.sanitizeFilename(userPath);
		}
	}

	/**
	 * Join paths safely (prevents traversal in join operation)
	 *
	 * @param basePath Base directory
	 * @param userPath User-provided path component
	 * @returns Joined path (guaranteed safe)
	 * @throws Error if result would escape base directory
	 *
	 * @example
	 * ```typescript
	 * PathValidator.safeJoin('/sdcard', 'model.3mf')
	 * // Returns: '/sdcard/model.3mf'
	 *
	 * PathValidator.safeJoin('/sdcard', '../etc/passwd')
	 * // Throws: Error
	 * ```
	 */
	static safeJoin(basePath: string, userPath: string): string {
		// Strip leading ./ from userPath (it's safe in context of explicit base)
		let cleanedPath = userPath;
		if (cleanedPath.startsWith('./')) {
			cleanedPath = cleanedPath.substring(2);
		}

		// Sanitize user path
		const sanitizedUser = this.sanitizePath(cleanedPath);

		// Use posix.join for consistent behavior
		const joined = path.posix.join(basePath, sanitizedUser);

		// Validate result is within base
		const normalizedBase = path.posix.normalize(basePath);
		const normalizedJoined = path.posix.normalize(joined);

		if (!normalizedJoined.startsWith(normalizedBase)) {
			throw new Error(`Joined path "${joined}" escapes base directory "${basePath}"`);
		}

		return joined;
	}
}
