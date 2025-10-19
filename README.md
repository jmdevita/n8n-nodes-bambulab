# n8n-nodes-bambulab

[![NPM Version](https://img.shields.io/npm/v/n8n-nodes-bambulab)](https://www.npmjs.com/package/n8n-nodes-bambulab)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This is an n8n community node that lets you control and monitor Bambu Lab 3D printers directly from your n8n workflows.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

### Manual Installation

1. Navigate to your n8n installation directory
2. Install the package:
   ```bash
   npm install n8n-nodes-bambulab
   ```
3. Restart your n8n instance

### Prerequisites

**IMPORTANT:** Before using this node, you MUST enable **Developer Mode** on your Bambu Lab printer. This grants local network access via MQTT and FTP.

⚠️ **Security Warning:** Developer Mode disables authentication and allows full control over your printer. Use only on trusted networks.

#### Enabling Developer Mode

1. On your printer, go to **Settings** → **General** → **Developer Mode**
2. Enable **Developer Mode**
3. Note your **LAN Access Code** from **Settings** → **Network** → **LAN Access Code**
4. Note your **Serial Number** from **Settings** → **Device** → **Serial Number**
5. Ensure your printer is connected to the same network as your n8n instance

📖 [Official Guide: Enable Developer Mode](https://wiki.bambulab.com/en/knowledge-sharing/enable-developer-mode)

## Operations

### Print Resource
Control print jobs on your printer.

- **Start**: Start a print job from a file on the printer's SD card
  - File name (required)
  - Options: Bed leveling, flow calibration, vibration calibration, layer inspect, use AMS
- **Pause**: Pause the current print job
- **Resume**: Resume a paused print job
- **Stop**: Stop the current print job

### Status Resource
Monitor printer status and get information.

- **Get Current Status**: Retrieve full printer status (temperatures, progress, state, etc.)
- **Get Print Progress**: Get progress information for the current print job
- **Get Temperature**: Get current temperature readings (nozzle, bed, chamber)

### File Resource
Manage files on the printer via FTP.

- **Upload**: Upload a G-code or 3MF file to the printer
  - File content (required)
  - File name (required)
  - Remote path (default: `/`)
- **List**: List files on the printer's SD card
  - Path (default: `/`)
- **Delete**: Delete a file from the printer
  - File path (required)

### Camera Resource
Access the printer's camera.

- **Get Stream URL**: Get URLs for the camera stream (RTSP and HTTP)
- **Get Snapshot**: Get URL for capturing a snapshot

⚠️ **Security Note**: The RTSP URL includes your access code for authentication (`rtsp://bblp:YOUR_ACCESS_CODE@PRINTER_IP/...`). Be careful not to expose these URLs in logs or share them publicly.

### Control Resource
Control printer hardware and settings.

- **Set LED**: Control printer LED lights (chamber light, work light, logo LED)
  - LED selection
  - Mode: on, off, flashing
- **Set Speed**: Set print speed percentage (50-166%)
  - Speed percentage
- **Home Axes**: Home all printer axes

## Credentials

This node requires Bambu Lab API credentials. You need the following information from your printer:

1. **Printer IP Address**: The local network IP address of your printer
   - Find in **Settings** → **Network** → **IP Address**
2. **Access Code**: The LAN access code
   - Find in **Settings** → **Network** → **LAN Access Code**
3. **Serial Number**: The printer's serial number
   - Find in **Settings** → **Device** → **Serial Number**
4. **MQTT Port** (optional): Default is 8883 for secure connection
5. **Use TLS** (optional): Default is enabled. Uses self-signed certificates.
6. **FTP Port** (optional): Default is 990 for FTPS

## Compatibility

- **n8n Version**: 1.0.0+
- **Node.js Version**: 22.0.0+
- **Supported Printers**: X1 Series, P1 Series, A1 Series, A1 Mini

This node uses:
- **MQTT** for printer control and status monitoring
- **FTP/FTPS** for file operations

## Usage

### Example: Upload and Print Workflow

This workflow uploads a G-code file and starts printing:

```
[HTTP Request] Download .gcode file
    ↓
[Bambu Lab - File: Upload] Upload to printer
    ↓
[Bambu Lab - Print: Start] Start printing
```

### Example: Print Status Monitor

Monitor print progress every 30 seconds:

```
[Schedule Trigger] Every 30 seconds
    ↓
[Bambu Lab - Status: Get Progress]
    ↓
[IF] Check if progress > 50%
    ↓
[Send Email] Notify when print is halfway done
```

### Example: Temperature Monitor

Check temperatures and send alert if too high:

```
[Schedule Trigger] Every minute
    ↓
[Bambu Lab - Status: Get Temperature]
    ↓
[IF] Nozzle temp > 250°C
    ↓
[Slack] Send alert to #printer-alerts
```

### Example Workflow JSON

See the `/examples` directory for complete workflow JSON files that you can import into n8n.

## Troubleshooting

### Connection Issues

**Problem**: "MQTT connection timeout" or "Failed to connect to FTP server"

**Solutions**:
1. Verify your printer is on the same network as n8n
2. Check that Developer Mode is enabled
3. Confirm the printer IP address is correct
4. Ensure firewall isn't blocking ports 8883 (MQTT) or 990 (FTP)
5. Try pinging the printer: `ping <printer-ip>`

### Authentication Errors

**Problem**: "MQTT connection error: Not authorized"

**Solutions**:
1. Verify your Access Code is correct (Settings → Network → LAN Access Code)
2. Ensure Developer Mode is enabled
3. Try resetting the Access Code on the printer

### File Upload Failures

**Problem**: File upload fails or times out

**Solutions**:
1. Check that the file is a valid .gcode or .3MF file
2. Ensure sufficient space on printer's SD card
3. Try uploading a smaller file first to test connection
4. Check FTP port (default: 990) is accessible

### Print Won't Start

**Problem**: Print command succeeds but print doesn't start

**Solutions**:
1. Verify the file name matches exactly (case-sensitive)
2. Check that the file exists on the printer's SD card (use File → List)
3. Ensure the printer is in IDLE state (not already printing)
4. Check printer display for error messages

## Resources

* [n8n Community Nodes Documentation](https://docs.n8n.io/integrations/community-nodes/)
* [Bambu Lab Wiki - Developer Mode](https://wiki.bambulab.com/en/knowledge-sharing/enable-developer-mode)
* [OpenBambuAPI Documentation](https://github.com/Doridian/OpenBambuAPI)
* [Bambu Lab Official Website](https://bambulab.com/)

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
npm run lintfix
```

### Local Development

To test this node locally with n8n:

```bash
# Build the node
npm run build

# Link globally
npm link

# In your n8n directory
npm link n8n-nodes-bambulab

# Start n8n
n8n start
```

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This is a community-developed node and is not officially supported by Bambu Lab. Use at your own risk. The developers are not responsible for any damage to your printer or failed prints.

## Acknowledgments

- Built with [n8n](https://n8n.io/)
- MQTT API documentation from [OpenBambuAPI](https://github.com/Doridian/OpenBambuAPI)
- Bambu Lab for creating excellent 3D printers

---

**Made with ❤️ for the n8n and 3D printing communities**
