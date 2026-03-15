import { EventEmitter } from "eventemitter3";

import type { EventListener, EventMap } from "./types.js";

export class EventBus {
  private readonly emitter = new EventEmitter();

  public emit<K extends keyof EventMap>(eventName: K, payload: EventMap[K]): void {
    this.emitter.emit(eventName, payload);
  }

  public on<K extends keyof EventMap>(eventName: K, listener: EventListener<K>): () => void {
    this.emitter.on(eventName, listener);
    return () => {
      this.off(eventName, listener);
    };
  }

  public once<K extends keyof EventMap>(eventName: K, listener: EventListener<K>): () => void {
    this.emitter.once(eventName, listener);
    return () => {
      this.off(eventName, listener);
    };
  }

  public off<K extends keyof EventMap>(eventName: K, listener: EventListener<K>): void {
    this.emitter.off(eventName, listener);
  }

  public removeAllListeners<K extends keyof EventMap>(eventName?: K): void {
    this.emitter.removeAllListeners(eventName);
  }

  public listenerCount<K extends keyof EventMap>(eventName: K): number {
    return this.emitter.listenerCount(eventName);
  }
}
