# Example Workflows

This directory contains example n8n workflows demonstrating common use cases for the Bambu Lab node.

## Importing Workflows

1. Open your n8n instance
2. Click "Workflows" in the left sidebar
3. Click "Import from File" or "Import from URL"
4. Select one of the JSON files from this directory
5. Update the credentials to use your Bambu Lab API credentials

## Available Examples

### 1. Upload and Print (`upload-and-print.json`)

**Use Case**: Download a G-code file from a URL, upload it to your printer, and start printing.

**Workflow Steps**:
1. Manual trigger
2. Download G-code file from URL (HTTP Request)
3. Upload file to printer (File → Upload)
4. Start print job (Print → Start)

**Customization**:
- Change the URL to point to your G-code file
- Modify the file name
- Adjust print options (bed leveling, AMS, etc.)

---

### 2. Monitor Print Progress (`monitor-print-progress.json`)

**Use Case**: Automatically monitor your print progress and send a notification when the print reaches 50% completion.

**Workflow Steps**:
1. Schedule trigger (runs every 5 minutes)
2. Get print progress (Status → Get Progress)
3. Check if progress >= 50% (IF node)
4. Send email notification

**Customization**:
- Adjust the schedule interval
- Change the progress threshold
- Replace email with Slack, Discord, or other notification services
- Add more conditions (e.g., notify at 25%, 50%, 75%, 100%)

---

## Creating Your Own Workflows

### Common Patterns

#### 1. File Upload from Local Storage
```
[Manual Trigger]
    ↓
[Read Binary File] - Use n8n's Read Binary Files node
    ↓
[Bambu Lab - File: Upload]
    ↓
[Bambu Lab - Print: Start]
```

#### 2. Print Queue Management
```
[Webhook Trigger] - Receive print requests
    ↓
[Function] - Queue management logic
    ↓
[Bambu Lab - Status: Get Current Status] - Check if idle
    ↓
[IF] - Printer is idle?
    ↓
[Bambu Lab - File: Upload]
    ↓
[Bambu Lab - Print: Start]
```

#### 3. Temperature Monitoring
```
[Schedule Trigger] - Every minute
    ↓
[Bambu Lab - Status: Get Temperature]
    ↓
[IF] - Temperature too high?
    ↓
[Bambu Lab - Print: Pause]
    ↓
[Send Alert]
```

#### 4. Print Completion Notification
```
[Schedule Trigger] - Every 5 minutes
    ↓
[Bambu Lab - Status: Get Progress]
    ↓
[IF] - Progress == 100% AND state == "FINISHED"?
    ↓
[Send Notification]
    ↓
[Bambu Lab - Control: Set LED] - Turn off chamber light
```

### Tips

1. **Error Handling**: Use the "Continue On Fail" setting on Bambu Lab nodes to handle connection issues gracefully
2. **Credentials**: Set up your Bambu Lab API credentials once and reuse them across all nodes
3. **Testing**: Use manual triggers for initial testing before setting up automated schedules
4. **Rate Limiting**: Don't poll the printer too frequently (every 30-60 seconds is usually sufficient)
5. **Workflow Organization**: Use sticky notes and node descriptions to document your workflows

### Advanced Examples

#### Multi-Printer Management
If you have multiple Bambu Lab printers, create separate credentials for each printer and use the Switch node to route jobs to available printers.

#### Print Farm Automation
Combine with database nodes to track print jobs, materials used, and print statistics across multiple printers.

#### Automated Slicing
Integrate with slicing software APIs (if available) to automatically slice 3D models before sending to the printer.

## Need Help?

- Check the main [README](../README.md) for detailed documentation
- Review the [Troubleshooting](../README.md#troubleshooting) section
- Open an issue on GitHub if you encounter problems
- Share your own workflows with the community!

## Contributing Examples

Have a great workflow to share? Please submit a pull request with:
1. The workflow JSON file
2. A description of what it does
3. Any special setup requirements
4. Screenshots (optional but helpful)

See [CONTRIBUTING.md](../CONTRIBUTING.md) for more details.
