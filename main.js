const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const chalk = require('chalk');

const config = require('./config.json');

const CATEGORIES = {
    'Images': ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico', '.tiff'],
    'Videos': ['.mp4', '.mkv', '.mov', '.avi', '.wmv', '.flv', '.webm', '.m4v'],
    'Audio': ['.mp3', '.wav', '.aac', '.flac', '.ogg', '.wma', '.m4a'],
    'Documents': ['.pdf', '.docx', '.doc', '.txt', '.pptx', '.ppt', '.xlsx', '.xls', '.csv', '.odt', '.rtf'],
    'Code Files': ['.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt'],
    'Compressed Files': ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'],
    'Applications': ['.exe', '.msi', '.dmg', '.deb', '.rpm', '.app'],
    'Downloaded Stuff For System': [],
    'Others': []
};

const SYSTEM_FILES = ['.ds_store', 'thumbs.db', 'desktop.ini', '$recycle.bin'];

class DownloadsOrganizer {
    constructor() {
        this.downloadsPath = config.downloadsPath;
        this.scriptFiles = ['main.js', 'config.json', 'package.json', 'package-lock.json', 'README.md'];
        this.stats = {
            createdFolders: [],
            movedFiles: [],
            skippedFiles: [],
            renamedFiles: [],
            errors: []
        };
    }

    getCategory(extension, isDirectory) {
        if (isDirectory) return 'Downloaded Stuff For System';

        for (const [category, extensions] of Object.entries(CATEGORIES)) {
            if (category === 'Downloaded Stuff For System' || category === 'Others') continue;
            if (extensions.includes(extension.toLowerCase())) {
                return category;
            }
        }
        return 'Others';
    }

    isSystemFile(filename) {
        return SYSTEM_FILES.includes(filename.toLowerCase());
    }

    isHiddenFile(filename) {
        return filename.startsWith('.') || filename.startsWith('$');
    }

    isScriptFile(filename) {
        return this.scriptFiles.includes(filename.toLowerCase());
    }

    async ensureFolderExists(folderPath) {
        try {
            await fs.access(folderPath);
        } catch {
            await fs.mkdir(folderPath, { recursive: true });
            const folderName = path.basename(folderPath);
            if (!this.stats.createdFolders.includes(folderName)) {
                this.stats.createdFolders.push(folderName);
                console.log(chalk.green(`  ✓ Created folder: ${folderName}`));
            }
        }
    }

    async generateUniqueFilename(destPath, baseName, extension) {
        let counter = 1;
        let newName = `${baseName}${extension}`;
        let destFilePath = path.join(destPath, newName);

        try {
            await fs.access(destFilePath);

            while (true) {
                newName = `${baseName}_${counter}${extension}`;
                destFilePath = path.join(destPath, newName);
                try {
                    await fs.access(destFilePath);
                    counter++;
                } catch {
                    break;
                }
            }
        } catch {
        }

        return { path: destFilePath, name: newName };
    }

    async moveFile(sourcePath, destFolder) {
        const filename = path.basename(sourcePath);
        const extension = path.extname(filename);
        const baseName = path.basename(filename, extension);

        await this.ensureFolderExists(destFolder);

        const { path: destPath, name: newName } = await this.generateUniqueFilename(
            destFolder,
            baseName,
            extension
        );

        const isDuplicate = await this.checkIfDuplicate(sourcePath, destPath);

        if (isDuplicate) {
            console.log(chalk.yellow(`  ⊙ Skipped (duplicate): ${filename}`));
            this.stats.skippedFiles.push(filename);
            return;
        }

        await fs.rename(sourcePath, destPath);

        if (newName !== filename) {
            console.log(chalk.cyan(`  ♻ Renamed & moved: ${filename} → ${newName}`));
            this.stats.renamedFiles.push(`${filename} → ${newName}`);
        } else {
            console.log(chalk.blue(`  → Moved: ${filename}`));
        }

        this.stats.movedFiles.push(filename);
    }

    async checkIfDuplicate(sourcePath, destPath) {
        try {
            const sourceStats = await fs.stat(sourcePath);
            const destStats = await fs.stat(destPath);
            return sourceStats.size === destStats.size && sourceStats.ino === destStats.ino;
        } catch {
            return false;
        }
    }

    async moveDirectory(sourcePath, destFolder) {
        const dirName = path.basename(sourcePath);
        const destPath = path.join(destFolder, dirName);

        await this.ensureFolderExists(destPath);

        await fs.rename(sourcePath, destPath);
        console.log(chalk.blue(`  → Moved folder: ${dirName}`));
        this.stats.movedFiles.push(dirName);
    }

    async scanAndOrganize() {
        console.log(chalk.bold.cyan('\n═══════════════════════════════════════════════════'));
        console.log(chalk.bold.cyan('     Downloads Folder Organizer - Weekly Auto Run'));
        console.log(chalk.bold.cyan('═══════════════════════════════════════════════════\n'));

        console.log(chalk.gray(`  Scanning: ${this.downloadsPath}\n`));
        console.log(chalk.gray('  ─────────────────────────────────────────────────────\n'));

        try {
            const entries = await fs.readdir(this.downloadsPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(this.downloadsPath, entry.name);

                if (this.isScriptFile(entry.name)) {
                    console.log(chalk.gray(`  ⊙ Skipped (script): ${entry.name}`));
                    this.stats.skippedFiles.push(entry.name);
                    continue;
                }

                if (this.isSystemFile(entry.name) || this.isHiddenFile(entry.name)) {
                    console.log(chalk.gray(`  ⊙ Skipped (system/hidden): ${entry.name}`));
                    this.stats.skippedFiles.push(entry.name);
                    continue;
                }

                try {
                    const category = this.getCategory(path.extname(entry.name), entry.isDirectory());
                    const destFolder = path.join(this.downloadsPath, category);

                    if (entry.isDirectory()) {
                        await this.moveDirectory(fullPath, destFolder);
                    } else {
                        await this.moveFile(fullPath, destFolder);
                    }
                } catch (err) {
                    console.log(chalk.red(`  ✗ Error moving ${entry.name}: ${err.message}`));
                    this.stats.errors.push({ file: entry.name, error: err.message });
                }
            }

            this.printSummary();
        } catch (err) {
            console.log(chalk.red(`\n  ✗ Fatal error: ${err.message}`));
            this.stats.errors.push({ file: 'critical', error: err.message });
        }
    }

    printSummary() {
        console.log(chalk.gray('\n  ─────────────────────────────────────────────────────'));
        console.log(chalk.bold.gray('\n  📊 ORGANIZATION SUMMARY\n'));

        if (this.stats.createdFolders.length > 0) {
            console.log(chalk.green(`  ✓ Created folders: ${this.stats.createdFolders.join(', ')}`));
        }

        if (this.stats.movedFiles.length > 0) {
            console.log(chalk.blue(`  → Files moved: ${this.stats.movedFiles.length}`));
        }

        if (this.stats.renamedFiles.length > 0) {
            console.log(chalk.cyan(`  ♻ Files renamed (duplicates): ${this.stats.renamedFiles.length}`));
        }

        if (this.stats.skippedFiles.length > 0) {
            console.log(chalk.yellow(`  ⊙ Files skipped: ${this.stats.skippedFiles.length}`));
        }

        if (this.stats.errors.length > 0) {
            console.log(chalk.red(`  ✗ Errors: ${this.stats.errors.length}`));
        }

        console.log(chalk.bold.gray('\n  ✓ Weekly organization completed!\n'));
    }

    async watchMode() {
        console.log(chalk.bold.cyan('\n═══════════════════════════════════════════════════'));
        console.log(chalk.bold.cyan('     Downloads Folder - Watch Mode Active'));
        console.log(chalk.bold.cyan('══════════════════════════════════════════════════=\n'));
        console.log(chalk.gray('  Watching for file changes...\n'));

        let watcher;

        try {
            watcher = fs.watch(this.downloadsPath, { recursive: false }, async (eventType, filename) => {
                if (!filename) return;

                console.log(chalk.gray(`\n  Detected: ${eventType} - ${filename}`));
                await this.scanAndOrganize();
            });

            process.on('SIGINT', () => {
                console.log(chalk.yellow('\n\n  Stopping watch mode...'));
                watcher.close();
                process.exit(0);
            });
        } catch (err) {
            console.log(chalk.red(`  Watch error: ${err.message}`));
        }
    }

    async dryRun() {
        console.log(chalk.bold.yellow('\n═══════════════════════════════════════════════════'));
        console.log(chalk.bold.yellow('     DRY RUN MODE - No files will be moved'));
        console.log(chalk.bold.yellow('══════════════════════════════════════════════════=\n'));

        try {
            const entries = await fs.readdir(this.downloadsPath, { withFileTypes: true });
            const preview = [];

            for (const entry of entries) {
                if (this.isScriptFile(entry.name) || this.isSystemFile(entry.name) || this.isHiddenFile(entry.name)) {
                    continue;
                }

                const category = this.getCategory(path.extname(entry.name), entry.isDirectory());
                preview.push({ name: entry.name, category, isDir: entry.isDirectory() });
            }

            console.log(chalk.gray('  Preview of files to be organized:\n'));
            for (const item of preview) {
                console.log(chalk.gray(`  ${item.isDir ? '📁' : '📄'} ${item.name} → ${chalk.white(item.category)}`));
            }
            console.log(chalk.bold.gray(`\n  Total: ${preview.length} files/folders would be moved\n`));
        } catch (err) {
            console.log(chalk.red(`  Error: ${err.message}`));
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    const organizer = new DownloadsOrganizer();

    if (args.includes('--watch')) {
        await organizer.watchMode();
    } else if (args.includes('--dry-run')) {
        await organizer.dryRun();
    } else if (args.includes('--schedule')) {
        console.log(chalk.bold.cyan('\n═══════════════════════════════════════════════════'));
        console.log(chalk.bold.cyan('     Weekly Scheduler Activated'));
        console.log(chalk.bold.cyan('═══════════════════════════════════════════════════\n'));
        console.log(chalk.gray(`  Running every: ${config.scheduleTime}`));
        console.log(chalk.gray('  Next run will be in 7 days\n'));

        cron.schedule(config.scheduleTime, async () => {
            console.log(chalk.bold.cyan('\n═══════════════════════════════════════════════════'));
            console.log(chalk.bold.cyan('     WEEKLY AUTOMATIC ORGANIZATION'));
            console.log(chalk.bold.cyan('═══════════════════════════════════════════════════\n'));
            console.log(chalk.gray(`  Triggered at: ${new Date().toLocaleString()}\n`));
            await organizer.scanAndOrganize();
        });

        await organizer.scanAndOrganize();
    } else {
        await organizer.scanAndOrganize();
    }
}

main().catch(console.error);