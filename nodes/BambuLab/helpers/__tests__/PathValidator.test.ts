import { PathValidator } from '../PathValidator';

describe('PathValidator', () => {
	describe('sanitizePath', () => {
		describe('Valid paths', () => {
			it('should allow valid absolute paths', () => {
				expect(PathValidator.sanitizePath('/sdcard/model.3mf')).toBe('/sdcard/model.3mf');
				expect(PathValidator.sanitizePath('/cache/print.gcode')).toBe('/cache/print.gcode');
			});

			it('should allow valid filenames without paths', () => {
				expect(PathValidator.sanitizePath('model.3mf')).toBe('model.3mf');
				expect(PathValidator.sanitizePath('test-file_123.gcode')).toBe('test-file_123.gcode');
			});

			it('should normalize paths correctly', () => {
				expect(PathValidator.sanitizePath('/sdcard/./model.3mf')).toBe('/sdcard/model.3mf');
				expect(PathValidator.sanitizePath('/sdcard//model.3mf')).toBe('/sdcard/model.3mf');
			});

			it('should allow .3mf extension (not hidden file)', () => {
				expect(PathValidator.sanitizePath('test.3mf')).toBe('test.3mf');
				expect(PathValidator.sanitizePath('/sdcard/file.gcode')).toBe('/sdcard/file.gcode');
			});
		});

		describe('Path traversal attacks', () => {
			it('should block parent directory traversal (Unix)', () => {
				expect(() => PathValidator.sanitizePath('../../../etc/passwd')).toThrow(
					'Path traversal detected',
				);
				expect(() => PathValidator.sanitizePath('../../shadow')).toThrow(
					'Path traversal detected',
				);
				expect(() => PathValidator.sanitizePath('/sdcard/../../../etc/passwd')).toThrow(
					'Path traversal detected',
				);
			});

			it('should block parent directory traversal (Windows)', () => {
				expect(() => PathValidator.sanitizePath('..\\..\\..\\windows\\system32')).toThrow(
					'Path traversal detected',
				);
				expect(() => PathValidator.sanitizePath('dir\\..\\..\\file')).toThrow(
					/Path traversal detected|Relative paths/,
				);
			});

			it('should block URL-encoded traversal', () => {
				// %2e%2e%2f = ../
				expect(() => PathValidator.sanitizePath('%2e%2e%2f%2e%2e%2fetc%2fpasswd')).toThrow(
					'Path traversal detected',
				);
			});

			it('should block double-encoded traversal', () => {
				// %252e = %2e (double encoded)
				expect(() => PathValidator.sanitizePath('%252e%252e%252f')).toThrow(
					/Path traversal|Relative paths/,
				);
			});
		});

		describe('System directory blocking', () => {
			it('should block /etc access', () => {
				expect(() => PathValidator.sanitizePath('/etc/passwd')).toThrow(
					'Access to system directory "/etc"',
				);
				expect(() => PathValidator.sanitizePath('/etc/shadow')).toThrow(
					'Access to system directory "/etc"',
				);
			});

			it('should block /sys access', () => {
				expect(() => PathValidator.sanitizePath('/sys/kernel')).toThrow(
					'Access to system directory "/sys"',
				);
			});

			it('should block /proc access', () => {
				expect(() => PathValidator.sanitizePath('/proc/cpuinfo')).toThrow(
					'Access to system directory "/proc"',
				);
			});

			it('should block /root access', () => {
				expect(() => PathValidator.sanitizePath('/root/.ssh/id_rsa')).toThrow(
					'Access to system directory "/root"',
				);
			});

			it('should block Windows system directories', () => {
				expect(() => PathValidator.sanitizePath('\\windows\\system32\\config\\sam')).toThrow(
					'Access to system directory',
				);
			});

			it('should be case-insensitive for system paths', () => {
				expect(() => PathValidator.sanitizePath('/ETC/PASSWD')).toThrow(
					'Access to system directory',
				);
				expect(() => PathValidator.sanitizePath('/Sys/Kernel')).toThrow(
					'Access to system directory',
				);
			});
		});

		describe('Null byte injection', () => {
			it('should remove null bytes', () => {
				expect(PathValidator.sanitizePath('test\x00.txt')).toBe('test.txt');
				expect(PathValidator.sanitizePath('/sdcard/file\x00.3mf')).toBe('/sdcard/file.3mf');
			});
		});

		describe('Hidden files', () => {
			it('should block hidden files (except allowed extensions)', () => {
				expect(() => PathValidator.sanitizePath('.hidden')).toThrow('Hidden');
				expect(() => PathValidator.sanitizePath('/sdcard/.secret')).toThrow('Hidden');
			});

			it('should allow .3mf and .gcode extensions', () => {
				expect(PathValidator.sanitizePath('file.3mf')).toBe('file.3mf');
				expect(PathValidator.sanitizePath('file.gcode')).toBe('file.gcode');
			});
		});

		describe('Relative paths', () => {
			it('should block ./ and ../ relative paths', () => {
				expect(() => PathValidator.sanitizePath('./file.3mf')).toThrow(
					/Path traversal/,
				);
				expect(() => PathValidator.sanitizePath('../file.3mf')).toThrow(
					/Path traversal/,
				);
			});

			it('should allow safe subdirectory paths', () => {
				expect(PathValidator.sanitizePath('dir/file.3mf')).toBe('dir/file.3mf');
				expect(PathValidator.sanitizePath('models/subdir/file.3mf')).toBe('models/subdir/file.3mf');
				expect(PathValidator.sanitizePath('model/file.gcode.3mf')).toBe('model/file.gcode.3mf');
			});
		});

		describe('Path length limits', () => {
			it('should block paths exceeding maximum length', () => {
				const longPath = '/' + 'a'.repeat(5000);
				expect(() => PathValidator.sanitizePath(longPath)).toThrow(
					'Path too long. Maximum 4096 characters',
				);
			});
		});

		describe('Input validation', () => {
			it('should reject empty strings', () => {
				expect(() => PathValidator.sanitizePath('')).toThrow('must be a non-empty string');
			});

			it('should reject non-string inputs', () => {
				expect(() => PathValidator.sanitizePath(null as any)).toThrow(
					'must be a non-empty string',
				);
				expect(() => PathValidator.sanitizePath(undefined as any)).toThrow(
					'must be a non-empty string',
				);
				expect(() => PathValidator.sanitizePath(123 as any)).toThrow(
					'must be a non-empty string',
				);
			});
		});
	});

	describe('validateWithinBounds', () => {
		it('should allow paths within base directory', () => {
			expect(PathValidator.validateWithinBounds('/sdcard', 'model.3mf')).toContain(
				'/sdcard/model.3mf',
			);
			expect(PathValidator.validateWithinBounds('/sdcard', '/sdcard/file.3mf')).toContain(
				'/sdcard/file.3mf',
			);
		});

		it('should block paths escaping base directory', () => {
			expect(() => PathValidator.validateWithinBounds('/sdcard', '../etc/passwd')).toThrow(
				/Path traversal|escapes/,
			);
			expect(() => PathValidator.validateWithinBounds('/sdcard', '../../root')).toThrow(
				/Path traversal|escapes/,
			);
		});
	});

	describe('sanitizeFilename', () => {
		describe('Valid filenames', () => {
			it('should allow alphanumeric filenames', () => {
				expect(PathValidator.sanitizeFilename('model123.3mf')).toBe('model123.3mf');
				expect(PathValidator.sanitizeFilename('test-file_v2.gcode')).toBe('test-file_v2.gcode');
			});

			it('should allow common file extensions', () => {
				expect(PathValidator.sanitizeFilename('file.3mf')).toBe('file.3mf');
				expect(PathValidator.sanitizeFilename('file.gcode')).toBe('file.gcode');
				expect(PathValidator.sanitizeFilename('archive.zip')).toBe('archive.zip');
			});
		});

		describe('Path separators', () => {
			it('should block Unix path separators', () => {
				expect(() => PathValidator.sanitizeFilename('dir/file.3mf')).toThrow(
					'Path separators',
				);
				expect(() => PathValidator.sanitizeFilename('/etc/passwd')).toThrow('Path separators');
			});

			it('should block Windows path separators', () => {
				expect(() => PathValidator.sanitizeFilename('dir\\file.3mf')).toThrow(
					'Path separators',
				);
				expect(() => PathValidator.sanitizeFilename('C:\\file.txt')).toThrow('Path separators');
			});
		});

		describe('Special filenames', () => {
			it('should block . and .. filenames', () => {
				expect(() => PathValidator.sanitizeFilename('.')).toThrow('Invalid filename');
				expect(() => PathValidator.sanitizeFilename('..')).toThrow('Invalid filename');
			});
		});

		describe('Hidden filenames', () => {
			it('should block hidden filenames', () => {
				expect(() => PathValidator.sanitizeFilename('.hidden')).toThrow('Hidden filenames');
				expect(() => PathValidator.sanitizeFilename('.gitignore')).toThrow('Hidden filenames');
			});
		});

		describe('Invalid characters', () => {
			it('should block control characters', () => {
				expect(PathValidator.sanitizeFilename('file\x00.txt')).toBe('file.txt'); // Null byte removed
				expect(() => PathValidator.sanitizeFilename('file\x01.txt')).toThrow(
					'invalid characters',
				);
			});

			it('should block special characters', () => {
				expect(() => PathValidator.sanitizeFilename('file<script>.txt')).toThrow(
					'invalid characters',
				);
				expect(() => PathValidator.sanitizeFilename('file|pipe.txt')).toThrow(
					'invalid characters',
				);
				expect(() => PathValidator.sanitizeFilename('file?.txt')).toThrow('invalid characters');
				expect(() => PathValidator.sanitizeFilename('file*.txt')).toThrow('invalid characters');
			});
		});

		describe('Length limits', () => {
			it('should block filenames exceeding maximum length', () => {
				const longFilename = 'a'.repeat(300) + '.3mf';
				expect(() => PathValidator.sanitizeFilename(longFilename)).toThrow(
					'Filename too long. Maximum 255 characters',
				);
			});
		});
	});

	describe('validate (combined)', () => {
		it('should validate paths with directories', () => {
			expect(PathValidator.validate('/sdcard/model.3mf')).toBe('/sdcard/model.3mf');
		});

		it('should validate filenames without directories', () => {
			expect(PathValidator.validate('model.3mf')).toBe('model.3mf');
		});

		it('should block invalid paths', () => {
			expect(() => PathValidator.validate('../../../etc/passwd')).toThrow();
			expect(() => PathValidator.validate('file<>.txt')).toThrow();
		});
	});

	describe('safeJoin', () => {
		it('should join paths safely', () => {
			expect(PathValidator.safeJoin('/sdcard', 'model.3mf')).toBe('/sdcard/model.3mf');
			expect(PathValidator.safeJoin('/cache', 'file.gcode')).toBe('/cache/file.gcode');
		});

		it('should prevent traversal in join', () => {
			expect(() => PathValidator.safeJoin('/sdcard', '../etc/passwd')).toThrow(
				/Path traversal|escapes/,
			);
			expect(() => PathValidator.safeJoin('/sdcard', '../../root')).toThrow(
				/Path traversal|escapes/,
			);
		});

		it('should normalize joined paths', () => {
			expect(PathValidator.safeJoin('/sdcard/', 'model.3mf')).toBe('/sdcard/model.3mf');
			expect(PathValidator.safeJoin('/sdcard', './model.3mf')).toBe('/sdcard/model.3mf');
		});
	});

	describe('Real-world attack vectors', () => {
		it('should block WiFi config access', () => {
			expect(() => PathValidator.sanitizePath('/etc/wpa_supplicant.conf')).toThrow();
		});

		it('should block firmware access', () => {
			expect(() => PathValidator.sanitizePath('/boot/firmware.bin')).toThrow();
		});

		it('should block printer config access', () => {
			expect(() => PathValidator.sanitizePath('/etc/printer.conf')).toThrow();
		});

		it('should allow legitimate printer paths', () => {
			expect(PathValidator.sanitizePath('/sdcard/model.3mf')).toBe('/sdcard/model.3mf');
			expect(PathValidator.sanitizePath('/cache/print.gcode')).toBe('/cache/print.gcode');
		});
	});

	describe('Edge cases', () => {
		it('should handle paths with multiple slashes', () => {
			expect(PathValidator.sanitizePath('/sdcard///model.3mf')).toBe('/sdcard/model.3mf');
		});

		it('should handle trailing slashes', () => {
			expect(PathValidator.sanitizePath('/sdcard/')).toBe('/sdcard');
		});

		it('should handle unicode filenames', () => {
			// Allow unicode in filenames (common for international users)
			expect(PathValidator.sanitizeFilename('模型.3mf')).toBe('模型.3mf');
			expect(PathValidator.sanitizeFilename('моdel.gcode')).toBe('моdel.gcode');
		});

		it('should handle mixed case extensions', () => {
			expect(PathValidator.sanitizePath('MODEL.3MF')).toBe('MODEL.3MF');
			expect(PathValidator.sanitizePath('File.GCODE')).toBe('File.GCODE');
		});
	});
});
