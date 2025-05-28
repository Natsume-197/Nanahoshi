import chokidar, { FSWatcher } from "chokidar";
import { libraryProcessingService } from "./libraryProcessingService";
import supabase from "../../../common/database/client";
import { LibraryPath } from "../../../common/models/supabaseTableTypes";

type WatcherKey = string; // `${libraryId}:${pathId}`

class MonitoringService {
  private watchers: Map<WatcherKey, FSWatcher> = new Map();

  async initializeMonitoring() {
    const { data: libraries } = await supabase
      .from("library")
      .select("*")
      .eq("is_cron_watch", true);

    if (!libraries) return;

    for (const lib of libraries) {
      await this.registerLibraryPaths(lib.id);
    }
    console.log(`Monitoring initialized for ${libraries.length} libraries`);
  }

  async registerLibraryPaths(libraryId: number) {
    const { data: paths } = await supabase
      .from("library_path")
      .select("*")
      .eq("library_id", libraryId)
      .eq("is_enabled", true);

    if (!paths || paths == null || paths.length == 0) {
      console.log(`Failed monitoring: no paths found (library ${libraryId})`);
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
      console.log(`Started monitoring: ${libraryPath.path} (library ${libraryId})`);

    } else {
      console.log(`Can not monitor: path null for ${libraryId}, pathId ${libraryPath.id}`);
    }
  }

  async unregisterPathWatcher(libraryId: number, pathId: number) {
    const key = `${libraryId}:${pathId}`;
    const watcher = this.watchers.get(key);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(key);
      console.log(`Stopped monitoring: library ${libraryId}, pathId ${pathId}`);
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