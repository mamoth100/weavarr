declare module 'androidtv-remote' {
  import { EventEmitter } from 'events';

  export interface AndroidRemoteOptions {
    pairing_port?: number;
    remote_port?: number;
    name?: string;
    cert?: Record<string, unknown>;
  }

  export const RemoteDirection: {
    SHORT: number;
    START_LONG: number;
    END_LONG: number;
  };

  export const RemoteKeyCode: Record<string, number>;

  export class AndroidRemote extends EventEmitter {
    constructor(host: string, options?: AndroidRemoteOptions);
    start(): Promise<void>;
    stop(): void;
    sendCode(code: string): void;
    sendPower(): void;
    sendKey(key: number, direction: number): void;
    sendAppLink(appLink: string): void;
    getCertificate(): Record<string, unknown>;
  }
}
