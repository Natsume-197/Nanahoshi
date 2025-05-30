import chokidar, { FSWatcher } from "chokidar";
import { libraryProcessingService } from "./libraryProcessingService";
import { LibraryPath } from "../../../common/models/supabaseTableTypes";
import { LibraryRepository } from "@/api/library/libraryRepository";
import { logger } from "@/server";

type WatcherKey = string; // `${libraryId}:${pathId}`
class MonitoringService {
  private libraryRepository: LibraryRepository;

  constructor(repository: LibraryRepository = new LibraryRepository()) {
    this.libraryRepository = repository;
  }

  private watchers: Map<WatcherKey, FSWatcher> = new Map();

  async initializeMonitoring() {
    const libraries = await this.libraryRepository.findAllCronWatch();

    if (!libraries) return;

    for (const lib of libraries) {
      await this.registerLibraryPaths(lib.id);
    }
    logger.info(`Monitoring initialized for ${libraries.length} libraries`);
  }

  async registerLibraryPaths(libraryId: number) {
    const paths = await this.libraryRepository.findEnabledPathsByLibraryId(libraryId);

    if (!paths || paths == null || paths.length == 0) {
      logger.info(`Failed monitoring: no paths found (library ${libraryId})`);
      return;
    }

    for (const p of paths) {
      this.registerPathWatcher(p, libraryId);
    }
  }

  registerPathWatcher(libraryPath: LibraryPath, libraryId: number) {
    const key = `${libraryId}:${libraryPath.id}`;
    if (this.watchers.has(key)) return; // Already monitored

    if (libraryPath.path) {
      const watcher = chokidar.watch(libraryPath.path, {
        persistent: true,
        ignoreInitial: false,
      });

      watcher
        .on("add", (filePath) => libraryProcessingService.processFile("add", libraryId, libraryPath, filePath))
        .on("unlink", (filePath) => libraryProcessingService.processFile("unlink", libraryId, libraryPath, filePath));

      this.watchers.set(key, watcher);
      logger.info(`Started monitoring: ${libraryPath.path} (library ${libraryId})`);

    } else {
      logger.info(`Can not monitor: path null for ${libraryId}, pathId ${libraryPath.id}`);
    }
  }

  async unregisterPathWatcher(libraryId: number, pathId: number) {
    const key = `${libraryId}:${pathId}`;
    const watcher = this.watchers.get(key);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(key);
      logger.info(`Stopped monitoring: library ${libraryId}, pathId ${pathId}`);
    }
  }

  async stopMonitoringAll() {
    for (const [key, watcher] of this.watchers) {
      await watcher.close();
      this.watchers.delete(key);
    }
  }
}

export const monitoringService = new MonitoringService();