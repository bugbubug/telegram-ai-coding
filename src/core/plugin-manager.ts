import { ValidationError } from "./errors.js";
import type { Plugin, PluginContext } from "./types.js";

export class PluginManager {
  private readonly initialized: Plugin[] = [];

  public constructor(private readonly plugins: Plugin[]) {}

  public async loadAll(context: PluginContext): Promise<void> {
    const orderedPlugins = this.sortPlugins();

    for (const plugin of orderedPlugins) {
      await plugin.init(context);
      this.initialized.push(plugin);
      context.eventBus.emit("plugin:registered", { name: plugin.name });
    }
  }

  public async destroyAll(): Promise<void> {
    for (const plugin of [...this.initialized].reverse()) {
      await plugin.destroy?.();
    }
    this.initialized.length = 0;
  }

  private sortPlugins(): Plugin[] {
    const pluginsByName = new Map(this.plugins.map((plugin) => [plugin.name, plugin]));
    const incomingCounts = new Map<string, number>();
    const outgoing = new Map<string, string[]>();

    for (const plugin of this.plugins) {
      incomingCounts.set(plugin.name, plugin.dependencies?.length ?? 0);
      for (const dependency of plugin.dependencies ?? []) {
        if (!pluginsByName.has(dependency)) {
          throw new ValidationError(`Plugin "${plugin.name}" depends on unknown plugin "${dependency}"`);
        }

        const dependents = outgoing.get(dependency) ?? [];
        dependents.push(plugin.name);
        outgoing.set(dependency, dependents);
      }
    }

    const queue = this.plugins
      .filter((plugin) => (plugin.dependencies?.length ?? 0) === 0)
      .map((plugin) => plugin.name);
    const orderedNames: string[] = [];

    while (queue.length > 0) {
      const currentName = queue.shift();
      if (!currentName) {
        continue;
      }

      orderedNames.push(currentName);
      for (const dependent of outgoing.get(currentName) ?? []) {
        const remaining = (incomingCounts.get(dependent) ?? 0) - 1;
        incomingCounts.set(dependent, remaining);
        if (remaining === 0) {
          queue.push(dependent);
        }
      }
    }

    if (orderedNames.length !== this.plugins.length) {
      throw new ValidationError("Plugin dependency cycle detected");
    }

    return orderedNames.map((name) => {
      const plugin = pluginsByName.get(name);
      if (!plugin) {
        throw new ValidationError(`Plugin "${name}" not found during sort`);
      }
      return plugin;
    });
  }
}
