import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'

export function createQueueConnection(accessTokenFactory: () => Promise<string>) {
  // Same-origin in development and deployment; the proxy owns backend addressing.
  return new HubConnectionBuilder()
    .withUrl('/hubs/queue', { accessTokenFactory })
    .withAutomaticReconnect([0, 2_000, 10_000, 30_000])
    .configureLogging(LogLevel.None)
    .build()
}
