import { NotFoundError, ValidationError } from "./errors.js";

export class ServiceRegistry {
  private readonly services = new Map<string, unknown>();

  public register<T>(name: string, value: T): void {
    if (this.services.has(name)) {
      throw new ValidationError(`Service "${name}" is already registered`);
    }

    this.services.set(name, value);
  }

  public get<T>(name: string): T {
    if (!this.services.has(name)) {
      throw new NotFoundError(`Service "${name}" is not registered`);
    }

    return this.services.get(name) as T;
  }

  public has(name: string): boolean {
    return this.services.has(name);
  }

  public unregister(name: string): void {
    this.services.delete(name);
  }
}
