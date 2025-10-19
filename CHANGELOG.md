# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2025-01-18

### Fixed

#### Code Quality Improvements
- **Subtask Name Display**: Fixed `startPrint()` command to extract just the filename for `subtask_name` instead of using the full path, improving display clarity in printer UI. ([commands.ts](nodes/BambuLab/helpers/commands.ts))
- **Sequence ID Matching**: Implemented proper sequence ID matching in MQTT response handling to ensure commands receive their correct responses instead of just taking the last message in the buffer. This improves reliability in scenarios with multiple concurrent commands or status updates. ([MqttHelper.ts](nodes/BambuLab/helpers/MqttHelper.ts))
  - Applied to both `publishCommand()` and `getStatus()` methods
  - Includes fallback to last message if no sequence ID match is found

### Documentation
- **Metadata Parameter**: Added explanatory comment for hardcoded `Metadata/plate_1.gcode` parameter in print commands, clarifying that this is a Bambu Lab API requirement. ([commands.ts](nodes/BambuLab/helpers/commands.ts))

### Internal
- All 21 unit tests passing
- No breaking changes

## [0.1.1] - 2025-01-18

### Fixed

#### Critical Fixes
- **MQTT Event Listener Memory Leak**: Fixed memory leak in `subscribeToUpdates()` that was creating duplicate event listeners on each call. Now uses a single callback pattern. ([MqttHelper.ts](nodes/BambuLab/helpers/MqttHelper.ts))
- **Multiple MQTT Connection Attempts**: Fixed unnecessary reconnection attempts when processing multiple items in a batch. MQTT connection is now established once and reused. ([BambuLab.node.ts](nodes/BambuLab/BambuLab.node.ts))
- **Missing Timeout/Interval Cleanup**: Added proper cleanup of setTimeout/setInterval in `publishCommand()` and `getStatus()` to prevent memory leaks. ([MqttHelper.ts](nodes/BambuLab/helpers/MqttHelper.ts))

#### Medium Priority Fixes
- **FTP Progress Tracking Cleanup**: Wrapped FTP upload logic in try-finally to ensure progress tracking is always stopped, even on error. ([FtpHelper.ts](nodes/BambuLab/helpers/FtpHelper.ts))
- **FTP Connection State Duplication**: Removed manual `isConnected` flag in favor of using the FTP client's built-in `closed` property to prevent state synchronization issues. ([FtpHelper.ts](nodes/BambuLab/helpers/FtpHelper.ts))
- **Unknown Operation Validation**: Added validation to throw clear errors when unknown resources or operations are requested, instead of returning empty responses. ([BambuLab.node.ts](nodes/BambuLab/BambuLab.node.ts))

#### Low Priority Fixes
- **Improved Error Messages**: Enhanced FTP error messages to provide specific guidance for common issues (connection refused, authentication failed, permission denied). ([FtpHelper.ts](nodes/BambuLab/helpers/FtpHelper.ts))

### Documentation
- **Camera URL Security**: Added security warning in README about credentials being included in RTSP URLs. ([README.md](README.md))

### Internal
- Reviewed `console.error` usage - confirmed acceptable for helper classes without access to n8n's logger

## [0.1.0] - 2025-01-18

### Added
- Initial release of n8n-nodes-bambulab
- **Print Resource**: Start, pause, resume, stop print operations
- **Status Resource**: Get current status, print progress, and temperature readings
- **File Resource**: Upload, list, and delete files via FTP/FTPS
- **Camera Resource**: Get stream URLs and snapshot URLs
- **Control Resource**: LED control, speed adjustment, axis homing
- MQTT helper for printer communication
- FTP helper for file operations
- Comprehensive command builders
- Full TypeScript type definitions
- 21 passing unit tests
- Complete documentation (README, CONTRIBUTING, examples)
- MIT License

### Technical Details
- Uses MQTT 5.3.0 for printer communication
- Uses basic-ftp 5.0.5 for file operations
- Supports TLS with self-signed certificates
- Node.js 22.0.0+ required
- Compatible with X1, P1, A1, and A1 Mini printers

---

## Version History Summary

- **v0.1.2** - Code quality improvements and robustness enhancements (current)
- **v0.1.1** - Bug fixes and improvements
- **v0.1.0** - Initial release

## Upgrade Notes

### Upgrading from 0.1.1 to 0.1.2

No breaking changes. This is a code quality release that improves robustness and clarity:

1. **Better Response Matching**: MQTT responses are now matched by sequence ID, preventing potential edge cases where wrong responses could be processed.
2. **Improved Display**: Print job names in the printer UI will now show just the filename instead of full paths.
3. **Better Documentation**: Code comments added to explain API requirements.

To upgrade:
```bash
npm install n8n-nodes-bambulab@0.1.2
```

Or in your package.json:
```json
{
  "dependencies": {
    "n8n-nodes-bambulab": "^0.1.2"
  }
}
```

No changes to workflows or credentials are required.

### Upgrading from 0.1.0 to 0.1.1

No breaking changes. This is a bug fix release that improves stability and error handling:

1. **Memory Leaks Fixed**: If you were experiencing memory issues with long-running workflows, this update fixes them.
2. **Better Error Messages**: FTP errors now provide more actionable guidance.
3. **Unknown Operations**: Previously silent failures on typos/invalid operations now throw clear errors.

To upgrade:
```bash
npm install n8n-nodes-bambulab@0.1.1
```

Or in your package.json:
```json
{
  "dependencies": {
    "n8n-nodes-bambulab": "^0.1.1"
  }
}
```

No changes to workflows or credentials are required.
